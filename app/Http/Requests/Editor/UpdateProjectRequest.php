<?php

namespace App\Http\Requests\Editor;

use App\Enums\TransitionType;
use App\Services\FFmpegService;
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
            'scenes.*.duration_ms' => ['required_with:scenes', 'integer', 'min:0'],
            'scenes.*.layers' => ['sometimes', 'array'],
            ...$this->elementRules('scenes.*.layers.*'),
            'scenes.*.transition' => ['sometimes', 'nullable', 'array'],
            'scenes.*.transition.type' => ['required_with:scenes.*.transition', 'string', Rule::in(TransitionType::values())],
            'scenes.*.transition.duration_ms' => ['required_with:scenes.*.transition', 'integer', 'min:1', 'max:'.FFmpegService::MAX_TRANSITION_MS],
            'audio_tracks' => ['sometimes', 'array'],
            'audio_tracks.*.id' => ['required_with:audio_tracks', 'string', 'uuid'],
            'audio_tracks.*.name' => ['required_with:audio_tracks', 'string', 'max:255'],
            'audio_tracks.*.volume' => ['sometimes', 'numeric', 'min:0', 'max:2'],
            'audio_tracks.*.clips' => ['sometimes', 'array'],
            'video_tracks' => ['sometimes', 'array'],
            'video_tracks.*.id' => ['required_with:video_tracks', 'string', 'uuid'],
            'video_tracks.*.name' => ['required_with:video_tracks', 'string', 'max:255'],
            'video_tracks.*.visible' => ['sometimes', 'boolean'],
            'video_tracks.*.clips' => ['sometimes', 'array'],
            'video_tracks.*.clips.*.id' => ['required_with:video_tracks.*.clips', 'string', 'uuid'],
            'video_tracks.*.clips.*.start_ms' => ['required_with:video_tracks.*.clips', 'integer', 'min:0'],
            'video_tracks.*.clips.*.duration_ms' => ['required_with:video_tracks.*.clips', 'integer', 'min:0'],
            ...$this->elementRules('video_tracks.*.clips.*'),
            'subtitle_tracks' => ['sometimes', 'array'],
            'subtitle_tracks.*.id' => ['required_with:subtitle_tracks', 'string', 'uuid'],
            'subtitle_tracks.*.name' => ['required_with:subtitle_tracks', 'string', 'max:255'],
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
        ];
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
