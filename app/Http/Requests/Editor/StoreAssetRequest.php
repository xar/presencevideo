<?php

namespace App\Http\Requests\Editor;

use App\Enums\AssetType;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreAssetRequest extends FormRequest
{
    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'file' => ['required', 'file', 'max:512000'], // 500MB max
            'type' => ['required', Rule::enum(AssetType::class)],
            'name' => ['sometimes', 'string', 'max:255'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'file.required' => 'Please select a file to upload.',
            'file.max' => 'File size cannot exceed 500MB.',
            'type.required' => 'Please specify the asset type.',
        ];
    }
}
