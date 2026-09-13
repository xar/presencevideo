<?php

namespace App\Http\Requests\Editor;

use App\Models\BrandKit;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreBrandKitRequest extends FormRequest
{
    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            ...static::kitRules($this->user()?->id),
        ];
    }

    /**
     * Rules for every kit field except the name, shared with the update request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public static function kitRules(?int $userId): array
    {
        $ownAsset = Rule::exists('assets', 'id')->where('user_id', $userId);
        $hexColor = ['nullable', 'string', 'regex:/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/'];

        $rules = [
            'website_url' => ['sometimes', 'nullable', 'url', 'max:2048'],
            'colors' => ['sometimes', 'array:'.implode(',', BrandKit::COLOR_ROLES)],
            'fonts' => ['sometimes', 'array:'.implode(',', BrandKit::FONT_ROLES)],
            'logos' => ['sometimes', 'array:'.implode(',', BrandKit::LOGO_VARIANTS)],
            'watermark' => ['sometimes', 'nullable', 'array:asset_id,position,opacity,size'],
            'watermark.asset_id' => ['nullable', 'integer', $ownAsset],
            'watermark.position' => ['nullable', 'string', Rule::in(BrandKit::WATERMARK_POSITIONS)],
            'watermark.opacity' => ['nullable', 'numeric', 'min:0', 'max:1'],
            'watermark.size' => ['nullable', 'numeric', 'min:0', 'max:1'],
            'intro_asset_id' => ['sometimes', 'nullable', 'integer', $ownAsset],
            'outro_asset_id' => ['sometimes', 'nullable', 'integer', $ownAsset],
            'voice' => ['sometimes', 'nullable', 'array:model_id,voice_id'],
            'voice.model_id' => ['nullable', 'string', 'max:255'],
            'voice.voice_id' => ['nullable', 'string', 'max:255'],
            'music' => ['sometimes', 'nullable', 'array:mood,asset_ids'],
            'music.mood' => ['nullable', 'string', 'max:255'],
            'music.asset_ids' => ['nullable', 'array'],
            'music.asset_ids.*' => ['integer', $ownAsset],
            'caption_preset' => ['sometimes', 'nullable', 'string', 'max:50'],
            'motion_preset' => ['sometimes', 'nullable', 'string', 'max:50'],
            'tone' => ['sometimes', 'nullable', 'string', 'max:2000'],
        ];

        foreach (BrandKit::COLOR_ROLES as $role) {
            $rules["colors.{$role}"] = $hexColor;
        }

        foreach (BrandKit::FONT_ROLES as $role) {
            $rules["fonts.{$role}"] = ['nullable', 'string', 'max:255'];
        }

        foreach (BrandKit::LOGO_VARIANTS as $variant) {
            $rules["logos.{$variant}"] = ['nullable', 'integer', $ownAsset];
        }

        return $rules;
    }
}
