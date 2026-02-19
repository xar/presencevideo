<?php

namespace App\Http\Requests\Editor;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class StoreProjectRequest extends FormRequest
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
            'resolution_width' => ['sometimes', 'integer', 'min:100', 'max:7680'],
            'resolution_height' => ['sometimes', 'integer', 'min:100', 'max:7680'],
            'fps' => ['sometimes', 'integer', 'min:1', 'max:120'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'name.required' => 'Please provide a project name.',
            'name.max' => 'Project name cannot exceed 255 characters.',
        ];
    }
}
