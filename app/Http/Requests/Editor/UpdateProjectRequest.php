<?php

namespace App\Http\Requests\Editor;

use App\Enums\TransitionType;
use App\Models\Project;
use App\Services\FFmpegService;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateProjectRequest extends FormRequest
{
    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'string', 'max:255'],
            'resolution_width' => ['sometimes', 'integer', 'min:100', 'max:7680'],
            'resolution_height' => ['sometimes', 'integer', 'min:100', 'max:7680'],
            'fps' => ['sometimes', 'integer', 'min:1', 'max:120'],
            'scenes' => ['sometimes', 'array'],
            'scenes.*.id' => ['required_with:scenes', 'string', 'uuid'],
            // Scenes are becoming a derived view over absolute element timing,
            // so a payload may omit the duration entirely; it is still accepted
            // and still the source of a scene's span while the view exists.
            'scenes.*.duration_ms' => ['sometimes', 'integer', 'min:0'],
            'scenes.*.layers' => ['sometimes', 'array'],
            ...$this->elementRules('scenes.*.layers.*'),
            'scenes.*.transition' => ['sometimes', 'nullable', 'array'],
            'scenes.*.transition.type' => ['required_with:scenes.*.transition', 'string', Rule::in(TransitionType::values())],
            'scenes.*.transition.duration_ms' => ['required_with:scenes.*.transition', 'integer', 'min:1', 'max:'.FFmpegService::MAX_TRANSITION_MS],
            // A track's `name` is a display label the model defaults when it is
            // missing, so it is not required here: agent-composed projects carry
            // unnamed tracks and must stay saveable from the editor.
            'audio_tracks' => ['sometimes', 'array'],
            'audio_tracks.*.id' => ['required_with:audio_tracks', 'string', 'uuid'],
            'audio_tracks.*.name' => ['sometimes', 'string', 'max:255'],
            'audio_tracks.*.volume' => ['sometimes', 'numeric', 'min:0', 'max:2'],
            'audio_tracks.*.clips' => ['sometimes', 'array'],
            'video_tracks' => ['sometimes', 'array'],
            'video_tracks.*.id' => ['required_with:video_tracks', 'string', 'uuid'],
            'video_tracks.*.name' => ['sometimes', 'string', 'max:255'],
            'video_tracks.*.visible' => ['sometimes', 'boolean'],
            'video_tracks.*.clips' => ['sometimes', 'array'],
            'video_tracks.*.clips.*.id' => ['required_with:video_tracks.*.clips', 'string', 'uuid'],
            // `start_ms`/`end_ms` now come from the shared element rules below;
            // `duration_ms` stays accepted for legacy clips.
            'video_tracks.*.clips.*.duration_ms' => ['sometimes', 'integer', 'min:0'],
            ...$this->elementRules('video_tracks.*.clips.*'),
            'subtitle_tracks' => ['sometimes', 'array'],
            'subtitle_tracks.*.id' => ['required_with:subtitle_tracks', 'string', 'uuid'],
            'subtitle_tracks.*.name' => ['sometimes', 'string', 'max:255'],
            'subtitle_tracks.*.enabled' => ['sometimes', 'boolean'],
            'subtitle_tracks.*.style' => ['sometimes', 'array'],
            'subtitle_tracks.*.style.font_size' => ['sometimes', 'integer', 'min:8', 'max:200'],
            'subtitle_tracks.*.style.font_color' => ['sometimes', 'string', 'max:20'],
            'subtitle_tracks.*.style.background_color' => ['sometimes', 'string', 'max:20'],
            'subtitle_tracks.*.style.position' => ['sometimes', 'string', 'in:top,bottom'],
            'subtitle_tracks.*.style.preset' => ['sometimes', 'string', 'max:50'],
            'subtitle_tracks.*.style.font_family' => ['sometimes', 'string', 'max:100'],
            'subtitle_tracks.*.style.stroke_color' => ['sometimes', 'string', 'max:20'],
            'subtitle_tracks.*.style.stroke_width' => ['sometimes', 'numeric', 'min:0', 'max:50'],
            'subtitle_tracks.*.style.highlight_color' => ['sometimes', 'nullable', 'string', 'max:20'],
            'subtitle_tracks.*.style.text_transform' => ['sometimes', 'string', 'in:none,uppercase'],
            'subtitle_tracks.*.entries' => ['sometimes', 'array'],
            'subtitle_tracks.*.entries.*.id' => ['required_with:subtitle_tracks.*.entries', 'string', 'uuid'],
            'subtitle_tracks.*.entries.*.start_ms' => ['required_with:subtitle_tracks.*.entries', 'integer', 'min:0'],
            'subtitle_tracks.*.entries.*.end_ms' => ['required_with:subtitle_tracks.*.entries', 'integer', 'min:0'],
            'subtitle_tracks.*.entries.*.text' => ['required_with:subtitle_tracks.*.entries', 'string', 'max:500'],
            'subtitle_tracks.*.entries.*.words' => ['sometimes', 'array'],
            'subtitle_tracks.*.entries.*.words.*.text' => ['required_with:subtitle_tracks.*.entries.*.words', 'string', 'max:200'],
            'subtitle_tracks.*.entries.*.words.*.start_ms' => ['required_with:subtitle_tracks.*.entries.*.words', 'integer', 'min:0'],
            'subtitle_tracks.*.entries.*.words.*.end_ms' => ['required_with:subtitle_tracks.*.entries.*.words', 'integer', 'min:0'],
        ];
    }

    /**
     * The editor owns the shape of its nested lists. The rules above guard the
     * structure and the fields the render depends on, but `validated()` would
     * otherwise drop every nested key without a rule of its own (scene names,
     * layer geometry, font settings…), silently corrupting the project.
     *
     * So each nested list is written back RAW from the request: the rules GATE
     * the payload (an invalid value rejects the whole request) but they do not
     * FILTER it. Keys without a rule survive, which is what lets the frontend
     * ship a new element field before the backend knows about it. Model-side
     * normalization (`Project::normalizeElement()`) is what gives those raw
     * arrays their defaults.
     *
     * @return array<string, mixed>
     */
    public function validated($key = null, $default = null): mixed
    {
        $data = parent::validated();

        foreach (['scenes', 'audio_tracks', 'video_tracks', 'subtitle_tracks'] as $list) {
            if ($this->has($list)) {
                $data[$list] = $this->input($list);
            }
        }

        return $key === null ? $data : data_get($data, $key, $default);
    }

    /**
     * Rules shared by everything drawn on the canvas — scene layers and
     * overlay clips are the same element model, so they validate identically.
     *
     * @return array<string, array<int, mixed>>
     */
    protected function elementRules(string $prefix): array
    {
        return [
            "{$prefix}.type" => ['sometimes', 'string', 'in:video,image,text,shape'],
            "{$prefix}.asset_id" => ["required_if:{$prefix}.type,video,image", 'integer'],
            "{$prefix}.x" => ['sometimes', 'numeric'],
            "{$prefix}.y" => ['sometimes', 'numeric'],
            "{$prefix}.width" => ['sometimes', 'numeric', 'min:0'],
            "{$prefix}.height" => ['sometimes', 'numeric', 'min:0'],
            "{$prefix}.z_index" => ['sometimes', 'integer'],
            "{$prefix}.opacity" => ['sometimes', 'numeric', 'min:0', 'max:1'],
            "{$prefix}.rotation" => ['sometimes', 'numeric'],
            "{$prefix}.text" => ["required_if:{$prefix}.type,text", 'nullable', 'string', 'max:500'],
            "{$prefix}.speed" => ['sometimes', 'numeric', 'min:'.FFmpegService::MIN_SPEED, 'max:'.FFmpegService::MAX_SPEED],
            "{$prefix}.volume" => ['sometimes', 'numeric', 'min:0', 'max:1'],
            "{$prefix}.muted" => ['sometimes', 'boolean'],
            "{$prefix}.adjustments" => ['sometimes', 'nullable', 'array'],
            "{$prefix}.adjustments.brightness" => ['sometimes', 'numeric', 'min:-1', 'max:1'],
            "{$prefix}.adjustments.contrast" => ['sometimes', 'numeric', 'min:0', 'max:2'],
            "{$prefix}.adjustments.saturation" => ['sometimes', 'numeric', 'min:0', 'max:2'],
            "{$prefix}.shape" => ['sometimes', 'string', 'in:rectangle,ellipse,line'],
            "{$prefix}.fill_color" => ['sometimes', 'nullable', 'string', 'max:20'],
            "{$prefix}.border_color" => ['sometimes', 'nullable', 'string', 'max:20'],
            "{$prefix}.border_width" => ['sometimes', 'numeric', 'min:0', 'max:1000'],
            "{$prefix}.corner_radius" => ['sometimes', 'numeric', 'min:0', 'max:10000'],
            "{$prefix}.fit" => ['sometimes', 'string', 'in:cover,contain,fill'],
            // Absolute position on the project timeline. Legacy payloads omit
            // these and the model derives them; new payloads carry them.
            "{$prefix}.start_ms" => ['sometimes', 'integer', 'min:0'],
            "{$prefix}.end_ms" => ['sometimes', 'integer', 'min:0'],
            "{$prefix}.track_id" => ['sometimes', 'string', 'max:255'],
            ...$this->keyframeRules($prefix),
        ];
    }

    /**
     * Keyframe animation tracks: a map of property path to a list of
     * keyframes. `time_ms` is element-local, so the animation travels with the
     * element when it is moved on the timeline.
     *
     * The whole map is validated by one closure rather than by dotted rule
     * paths, because property paths such as `adjustments.brightness` are
     * literal keys containing a dot — a dotted validation path could not
     * address them.
     *
     * @return array<string, array<int, mixed>>
     */
    protected function keyframeRules(string $prefix): array
    {
        return [
            "{$prefix}.keyframes" => ['sometimes', 'nullable', 'array', function (string $attribute, mixed $value, Closure $fail): void {
                if (! is_array($value)) {
                    return;
                }

                foreach ($value as $property => $track) {
                    $this->validateKeyframeTrack($attribute, (string) $property, $track, $fail);
                }
            }],
        ];
    }

    /**
     * Validate one property's keyframe track.
     */
    protected function validateKeyframeTrack(string $attribute, string $property, mixed $track, Closure $fail): void
    {
        if (! in_array($property, Project::KEYFRAMABLE_PROPERTIES, true)) {
            $fail("The {$attribute} field contains an unsupported animated property [{$property}].");

            return;
        }

        if (! is_array($track)) {
            $fail("The {$attribute}.{$property} field must be a list of keyframes.");

            return;
        }

        foreach ($track as $index => $keyframe) {
            $path = "{$attribute}.{$property}.{$index}";

            if (! is_array($keyframe)) {
                $fail("The {$path} field must be a keyframe object.");

                continue;
            }

            $timeMs = $keyframe['time_ms'] ?? null;

            if (! is_int($timeMs) || $timeMs < 0) {
                $fail("The {$path}.time_ms field must be an integer of at least 0.");
            }

            if (! is_numeric($keyframe['value'] ?? null)) {
                $fail("The {$path}.value field must be numeric.");
            }

            if (array_key_exists('easing', $keyframe) && $keyframe['easing'] !== null) {
                $this->validateKeyframeEasing("{$path}.easing", $keyframe['easing'], $fail);
            }
        }
    }

    /**
     * An easing is either a named curve or a four-number cubic bezier.
     */
    protected function validateKeyframeEasing(string $path, mixed $easing, Closure $fail): void
    {
        if (is_string($easing)) {
            if (! in_array($easing, Project::KEYFRAME_EASINGS, true)) {
                $fail("The {$path} field must be one of: ".implode(', ', Project::KEYFRAME_EASINGS).', or a cubic-bezier array.');
            }

            return;
        }

        if (is_array($easing)) {
            if (count($easing) !== 4 || array_filter($easing, 'is_numeric') !== $easing) {
                $fail("The {$path} field must be a cubic-bezier array of exactly four numbers.");
            }

            return;
        }

        $fail("The {$path} field must be an easing name or a cubic-bezier array.");
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'name.max' => 'Project name cannot exceed 255 characters.',
            'scenes.*.id.uuid' => 'Each scene must have a valid UUID.',
            'audio_tracks.*.id.uuid' => 'Each audio track must have a valid UUID.',
            'video_tracks.*.id.uuid' => 'Each video track must have a valid UUID.',
            'video_tracks.*.clips.*.id.uuid' => 'Each video clip must have a valid UUID.',
            'subtitle_tracks.*.id.uuid' => 'Each subtitle track must have a valid UUID.',
            'subtitle_tracks.*.entries.*.id.uuid' => 'Each subtitle entry must have a valid UUID.',
        ];
    }
}
