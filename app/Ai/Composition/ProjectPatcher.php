<?php

namespace App\Ai\Composition;

use Illuminate\Support\Str;
use InvalidArgumentException;

/**
 * Apply a list of small, semantic operations to a project's stored arrays.
 *
 * Agents used to rewrite the whole composition JSON for every change, which
 * models do badly at scale and which made "fix scene 3 only" impossible. This
 * class is the operations vocabulary instead: pure array in, array out, no
 * database, so the agent tool and the tests share one implementation.
 *
 * The project array has the shape `get_video_project` returns: `scenes`,
 * `video_tracks`, `audio_tracks`, `subtitle_tracks`, `resolution_width`,
 * `resolution_height`, `fps`, `name`, `brand_kit_id`.
 */
class ProjectPatcher
{
    /**
     * @var list<string>
     */
    public const OPERATIONS = [
        'set_project',
        'set_scene',
        'add_scene',
        'remove_scene',
        'add_element',
        'update_element',
        'remove_element',
        'set_subtitle_style',
        'add_subtitle_entries',
        'add_audio_clip',
    ];

    /**
     * @var list<string>
     */
    protected const PROJECT_FIELDS = ['resolution_width', 'resolution_height', 'fps', 'brand_kit_id', 'name'];

    /**
     * @var list<string>
     */
    protected const SCENE_FIELDS = ['duration_ms', 'name', 'background_color', 'transition'];

    /**
     * @param  array<string, mixed>  $project
     * @param  array<int, array<string, mixed>>  $operations
     * @return array{project: array<string, mixed>, applied: list<string>}
     */
    public static function apply(array $project, array $operations): array
    {
        $applied = [];

        foreach (array_values($operations) as $index => $operation) {
            if (! is_array($operation) || ! is_string($operation['op'] ?? null)) {
                throw new InvalidArgumentException("Operation #{$index} must be an object with an \"op\" string. Valid ops: ".implode(', ', self::OPERATIONS).'.');
            }

            $op = $operation['op'];

            $project = match ($op) {
                'set_project' => self::setProject($project, $operation),
                'set_scene' => self::setScene($project, $operation),
                'add_scene' => self::addScene($project, $operation),
                'remove_scene' => self::removeScene($project, $operation),
                'add_element' => self::addElement($project, $operation),
                'update_element' => self::updateElement($project, $operation),
                'remove_element' => self::removeElement($project, $operation),
                'set_subtitle_style' => self::setSubtitleStyle($project, $operation),
                'add_subtitle_entries' => self::addSubtitleEntries($project, $operation),
                'add_audio_clip' => self::addAudioClip($project, $operation),
                default => throw new InvalidArgumentException("Unknown op \"{$op}\" at #{$index}. Valid ops: ".implode(', ', self::OPERATIONS).'.'),
            };

            $applied[] = $op;
        }

        return ['project' => $project, 'applied' => $applied];
    }

    /**
     * @param  array<string, mixed>  $project
     * @param  array<string, mixed>  $operation
     * @return array<string, mixed>
     */
    protected static function setProject(array $project, array $operation): array
    {
        foreach (self::PROJECT_FIELDS as $field) {
            if (array_key_exists($field, $operation)) {
                $project[$field] = $operation[$field];
            }
        }

        return $project;
    }

    /**
     * @param  array<string, mixed>  $project
     * @param  array<string, mixed>  $operation
     * @return array<string, mixed>
     */
    protected static function setScene(array $project, array $operation): array
    {
        $index = self::sceneIndex($project, $operation);

        foreach (self::SCENE_FIELDS as $field) {
            if (array_key_exists($field, $operation)) {
                $project['scenes'][$index][$field] = $operation[$field];
            }
        }

        return $project;
    }

    /**
     * @param  array<string, mixed>  $project
     * @param  array<string, mixed>  $operation
     * @return array<string, mixed>
     */
    protected static function addScene(array $project, array $operation): array
    {
        $scene = $operation['scene'] ?? null;

        if (! is_array($scene)) {
            throw new InvalidArgumentException('add_scene requires a "scene" object.');
        }

        $scene['id'] = self::idOrUuid($scene['id'] ?? null);
        $scene['layers'] = array_values(array_map(
            fn (array $layer): array => self::withId($layer),
            array_filter(is_array($scene['layers'] ?? null) ? $scene['layers'] : [], 'is_array'),
        ));
        $scene['duration_ms'] ??= 3000;

        $scenes = array_values(is_array($project['scenes'] ?? null) ? $project['scenes'] : []);
        $index = isset($operation['index']) && is_numeric($operation['index'])
            ? max(0, min(count($scenes), (int) $operation['index']))
            : count($scenes);

        array_splice($scenes, $index, 0, [$scene]);
        $project['scenes'] = $scenes;

        return $project;
    }

    /**
     * @param  array<string, mixed>  $project
     * @param  array<string, mixed>  $operation
     * @return array<string, mixed>
     */
    protected static function removeScene(array $project, array $operation): array
    {
        $index = self::sceneIndex($project, $operation);
        $scenes = $project['scenes'];
        array_splice($scenes, $index, 1);
        $project['scenes'] = array_values($scenes);

        return $project;
    }

    /**
     * @param  array<string, mixed>  $project
     * @param  array<string, mixed>  $operation
     * @return array<string, mixed>
     */
    protected static function addElement(array $project, array $operation): array
    {
        $element = $operation['element'] ?? null;

        if (! is_array($element)) {
            throw new InvalidArgumentException('add_element requires an "element" object.');
        }

        $element = self::withId($element);

        if (is_string($operation['scene_id'] ?? null)) {
            $index = self::sceneIndex($project, $operation);
            $project['scenes'][$index]['layers'][] = $element;

            return $project;
        }

        if (is_string($operation['track_id'] ?? null)) {
            foreach ($project['video_tracks'] ?? [] as $trackIndex => $track) {
                if (($track['id'] ?? null) === $operation['track_id']) {
                    $project['video_tracks'][$trackIndex]['clips'][] = $element;

                    return $project;
                }
            }

            throw new InvalidArgumentException("Video track \"{$operation['track_id']}\" was not found.");
        }

        throw new InvalidArgumentException('add_element requires a scene_id or a track_id.');
    }

    /**
     * @param  array<string, mixed>  $project
     * @param  array<string, mixed>  $operation
     * @return array<string, mixed>
     */
    protected static function updateElement(array $project, array $operation): array
    {
        $fields = $operation['fields'] ?? null;

        if (! is_array($fields)) {
            throw new InvalidArgumentException('update_element requires a "fields" object.');
        }

        unset($fields['id']);

        $location = self::locateElement($project, $operation['element_id'] ?? null);

        [$list, $container, $child, $index] = $location;
        $project[$list][$container][$child][$index] = array_merge($project[$list][$container][$child][$index], $fields);

        return $project;
    }

    /**
     * @param  array<string, mixed>  $project
     * @param  array<string, mixed>  $operation
     * @return array<string, mixed>
     */
    protected static function removeElement(array $project, array $operation): array
    {
        [$list, $container, $child, $index] = self::locateElement($project, $operation['element_id'] ?? null);

        array_splice($project[$list][$container][$child], $index, 1);
        $project[$list][$container][$child] = array_values($project[$list][$container][$child]);

        return $project;
    }

    /**
     * @param  array<string, mixed>  $project
     * @param  array<string, mixed>  $operation
     * @return array<string, mixed>
     */
    protected static function setSubtitleStyle(array $project, array $operation): array
    {
        $style = $operation['style'] ?? null;

        if (! is_array($style)) {
            throw new InvalidArgumentException('set_subtitle_style requires a "style" object.');
        }

        $project = self::ensureSubtitleTrack($project);
        $index = self::subtitleTrackIndex($project, $operation['track_id'] ?? null);
        $existing = is_array($project['subtitle_tracks'][$index]['style'] ?? null) ? $project['subtitle_tracks'][$index]['style'] : [];
        $project['subtitle_tracks'][$index]['style'] = array_merge($existing, $style);

        return $project;
    }

    /**
     * @param  array<string, mixed>  $project
     * @param  array<string, mixed>  $operation
     * @return array<string, mixed>
     */
    protected static function addSubtitleEntries(array $project, array $operation): array
    {
        $entries = $operation['entries'] ?? null;

        if (! is_array($entries)) {
            throw new InvalidArgumentException('add_subtitle_entries requires an "entries" array.');
        }

        $project = self::ensureSubtitleTrack($project);
        $index = self::subtitleTrackIndex($project, $operation['track_id'] ?? null);

        foreach (array_filter($entries, 'is_array') as $entry) {
            $project['subtitle_tracks'][$index]['entries'][] = self::withId($entry);
        }

        usort($project['subtitle_tracks'][$index]['entries'], fn (array $a, array $b): int => ($a['start_ms'] ?? 0) <=> ($b['start_ms'] ?? 0));

        return $project;
    }

    /**
     * @param  array<string, mixed>  $project
     * @param  array<string, mixed>  $operation
     * @return array<string, mixed>
     */
    protected static function addAudioClip(array $project, array $operation): array
    {
        $clip = $operation['clip'] ?? null;

        if (! is_array($clip)) {
            throw new InvalidArgumentException('add_audio_clip requires a "clip" object.');
        }

        $clip = self::withId($clip);
        $clip['volume'] ??= 1.0;

        if (isset($clip['start_ms'], $clip['end_ms']) && ! isset($clip['duration_ms'])) {
            $clip['duration_ms'] = max(0, (int) $clip['end_ms'] - (int) $clip['start_ms']);
        }

        $tracks = array_values(is_array($project['audio_tracks'] ?? null) ? $project['audio_tracks'] : []);

        foreach ($tracks as $index => $track) {
            $matchesId = is_string($operation['track_id'] ?? null) && ($track['id'] ?? null) === $operation['track_id'];
            $matchesName = is_string($operation['track_name'] ?? null) && ($track['name'] ?? null) === $operation['track_name'];

            if ($matchesId || $matchesName) {
                $tracks[$index]['clips'][] = $clip;
                $project['audio_tracks'] = $tracks;

                return $project;
            }
        }

        if (is_string($operation['track_id'] ?? null)) {
            throw new InvalidArgumentException("Audio track \"{$operation['track_id']}\" was not found.");
        }

        $tracks[] = [
            'id' => (string) Str::uuid(),
            'name' => is_string($operation['track_name'] ?? null) ? $operation['track_name'] : 'Track '.(count($tracks) + 1),
            'volume' => 1.0,
            'clips' => [$clip],
        ];
        $project['audio_tracks'] = $tracks;

        return $project;
    }

    /**
     * Find an element by id inside scene layers or video-track clips.
     *
     * @param  array<string, mixed>  $project
     * @return array{0: string, 1: int, 2: string, 3: int} [list key, container index, child key, element index]
     */
    protected static function locateElement(array $project, mixed $elementId): array
    {
        if (! is_string($elementId) || $elementId === '') {
            throw new InvalidArgumentException('An element_id is required.');
        }

        foreach ([['scenes', 'layers'], ['video_tracks', 'clips']] as [$list, $child]) {
            foreach ($project[$list] ?? [] as $containerIndex => $container) {
                foreach ($container[$child] ?? [] as $index => $element) {
                    if (($element['id'] ?? null) === $elementId) {
                        return [$list, $containerIndex, $child, $index];
                    }
                }
            }
        }

        throw new InvalidArgumentException("Element \"{$elementId}\" was not found in any scene or video track.");
    }

    /**
     * @param  array<string, mixed>  $project
     * @param  array<string, mixed>  $operation
     */
    protected static function sceneIndex(array $project, array $operation): int
    {
        $sceneId = $operation['scene_id'] ?? null;

        if (! is_string($sceneId) || $sceneId === '') {
            throw new InvalidArgumentException('A scene_id is required.');
        }

        foreach ($project['scenes'] ?? [] as $index => $scene) {
            if (($scene['id'] ?? null) === $sceneId || ($scene['name'] ?? null) === $sceneId) {
                return $index;
            }
        }

        throw new InvalidArgumentException("Scene \"{$sceneId}\" was not found.");
    }

    /**
     * @param  array<string, mixed>  $project
     * @return array<string, mixed>
     */
    protected static function ensureSubtitleTrack(array $project): array
    {
        $tracks = array_values(is_array($project['subtitle_tracks'] ?? null) ? $project['subtitle_tracks'] : []);

        if ($tracks === []) {
            $tracks[] = [
                'id' => (string) Str::uuid(),
                'name' => 'Captions',
                'enabled' => true,
                'style' => [],
                'entries' => [],
            ];
        }

        $project['subtitle_tracks'] = $tracks;

        return $project;
    }

    /**
     * @param  array<string, mixed>  $project
     */
    protected static function subtitleTrackIndex(array $project, mixed $trackId): int
    {
        if (! is_string($trackId) || $trackId === '') {
            return 0;
        }

        foreach ($project['subtitle_tracks'] as $index => $track) {
            if (($track['id'] ?? null) === $trackId) {
                return $index;
            }
        }

        throw new InvalidArgumentException("Subtitle track \"{$trackId}\" was not found.");
    }

    /**
     * @param  array<string, mixed>  $item
     * @return array<string, mixed>
     */
    protected static function withId(array $item): array
    {
        $item['id'] = self::idOrUuid($item['id'] ?? null);

        return $item;
    }

    protected static function idOrUuid(mixed $id): string
    {
        return is_string($id) && Str::isUuid($id) ? $id : (string) Str::uuid();
    }
}
