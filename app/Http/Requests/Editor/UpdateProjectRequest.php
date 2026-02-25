<?php

namespace App\Http\Requests\Editor;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

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
            'video_tracks.*.clips.*.asset_id' => ['required_with:video_tracks.*.clips', 'integer'],
            'video_tracks.*.clips.*.start_ms' => ['required_with:video_tracks.*.clips', 'integer', 'min:0'],
            'video_tracks.*.clips.*.duration_ms' => ['required_with:video_tracks.*.clips', 'integer', 'min:0'],
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
        ];
    }
}
