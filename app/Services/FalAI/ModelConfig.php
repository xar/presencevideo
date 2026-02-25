<?php

namespace App\Services\FalAI;

use App\Enums\GenerationType;

class ModelConfig
{
    /**
     * Get all available models grouped by generation type.
     *
     * @return array<string, array<string, array{id: string, name: string, description: string, parameters: array<string, mixed>, defaults: array<string, mixed>}>>
     */
    public static function all(): array
    {
        return [
            'text_to_image' => self::textToImageModels(),
            'image_to_video' => self::imageToVideoModels(),
            'text_to_music' => self::textToMusicModels(),
            'text_to_speech' => self::textToSpeechModels(),
            'text_to_sfx' => self::textToSfxModels(),
        ];
    }

    /**
     * @return array<string, array{id: string, name: string, description: string, parameters: array<string, mixed>, defaults: array<string, mixed>}>
     */
    public static function textToImageModels(): array
    {
        return [
            'flux-dev' => [
                'id' => 'fal-ai/flux/dev',
                'name' => 'FLUX.1 Dev',
                'description' => '12B parameter flow transformer. High-quality, versatile image generation.',
                'parameters' => [
                    'image_size' => [
                        'type' => 'select',
                        'label' => 'Image Size',
                        'options' => [
                            'square_hd' => 'Square HD (1024×1024)',
                            'square' => 'Square (512×512)',
                            'portrait_4_3' => 'Portrait 4:3',
                            'portrait_16_9' => 'Portrait 16:9',
                            'landscape_4_3' => 'Landscape 4:3',
                            'landscape_16_9' => 'Landscape 16:9',
                        ],
                    ],
                    'num_inference_steps' => [
                        'type' => 'slider',
                        'label' => 'Inference Steps',
                        'min' => 10,
                        'max' => 50,
                    ],
                    'guidance_scale' => [
                        'type' => 'slider',
                        'label' => 'Guidance Scale',
                        'min' => 1,
                        'max' => 20,
                        'step' => 0.5,
                    ],
                    'num_images' => [
                        'type' => 'slider',
                        'label' => 'Number of Images',
                        'min' => 1,
                        'max' => 4,
                    ],
                    'enable_safety_checker' => [
                        'type' => 'checkbox',
                        'label' => 'Enable Safety Checker',
                    ],
                ],
                'defaults' => [
                    'image_size' => 'portrait_16_9',
                    'num_inference_steps' => 28,
                    'guidance_scale' => 3.5,
                    'num_images' => 1,
                    'enable_safety_checker' => true,
                ],
            ],
            'flux-schnell' => [
                'id' => 'fal-ai/flux/schnell',
                'name' => 'FLUX.1 Schnell',
                'description' => 'Fast 1-4 step generation. Great for quick iterations.',
                'parameters' => [
                    'image_size' => [
                        'type' => 'select',
                        'label' => 'Image Size',
                        'options' => [
                            'square_hd' => 'Square HD (1024×1024)',
                            'square' => 'Square (512×512)',
                            'portrait_4_3' => 'Portrait 4:3',
                            'portrait_16_9' => 'Portrait 16:9',
                            'landscape_4_3' => 'Landscape 4:3',
                            'landscape_16_9' => 'Landscape 16:9',
                        ],
                    ],
                    'num_inference_steps' => [
                        'type' => 'slider',
                        'label' => 'Inference Steps',
                        'min' => 1,
                        'max' => 4,
                    ],
                    'num_images' => [
                        'type' => 'slider',
                        'label' => 'Number of Images',
                        'min' => 1,
                        'max' => 4,
                    ],
                ],
                'defaults' => [
                    'image_size' => 'portrait_16_9',
                    'num_inference_steps' => 4,
                    'num_images' => 1,
                ],
            ],
            'flux-pro-ultra' => [
                'id' => 'fal-ai/flux-pro/v1.1-ultra',
                'name' => 'FLUX.1 Pro Ultra',
                'description' => 'Professional-grade up to 2K resolution with improved realism.',
                'parameters' => [
                    'image_size' => [
                        'type' => 'select',
                        'label' => 'Image Size',
                        'options' => [
                            'square_hd' => 'Square HD (1024×1024)',
                            'portrait_4_3' => 'Portrait 4:3',
                            'portrait_16_9' => 'Portrait 16:9',
                            'landscape_4_3' => 'Landscape 4:3',
                            'landscape_16_9' => 'Landscape 16:9',
                        ],
                    ],
                    'aspect_ratio' => [
                        'type' => 'select',
                        'label' => 'Aspect Ratio',
                        'options' => [
                            '21:9' => 'Ultrawide (21:9)',
                            '16:9' => 'Widescreen (16:9)',
                            '4:3' => 'Standard (4:3)',
                            '1:1' => 'Square (1:1)',
                            '3:4' => 'Portrait (3:4)',
                            '9:16' => 'Vertical (9:16)',
                        ],
                    ],
                    'safety_tolerance' => [
                        'type' => 'slider',
                        'label' => 'Safety Tolerance',
                        'min' => 1,
                        'max' => 6,
                    ],
                ],
                'defaults' => [
                    'aspect_ratio' => '16:9',
                    'safety_tolerance' => 2,
                ],
            ],
            'recraft-v3' => [
                'id' => 'fal-ai/recraft-v3',
                'name' => 'Recraft V3',
                'description' => 'SOTA image generation with excellent typography and brand styles.',
                'parameters' => [
                    'image_size' => [
                        'type' => 'select',
                        'label' => 'Image Size',
                        'options' => [
                            'square_hd' => 'Square HD (1024×1024)',
                            'portrait_4_3' => 'Portrait 4:3',
                            'portrait_16_9' => 'Portrait 16:9',
                            'landscape_4_3' => 'Landscape 4:3',
                            'landscape_16_9' => 'Landscape 16:9',
                        ],
                    ],
                    'style' => [
                        'type' => 'select',
                        'label' => 'Style',
                        'options' => [
                            'any' => 'Any',
                            'realistic_image' => 'Realistic',
                            'digital_illustration' => 'Digital Illustration',
                            'vector_illustration' => 'Vector Illustration',
                            'icon' => 'Icon',
                        ],
                    ],
                ],
                'defaults' => [
                    'image_size' => 'portrait_16_9',
                    'style' => 'any',
                ],
            ],
            'stable-diffusion-35' => [
                'id' => 'fal-ai/stable-diffusion-v35-large',
                'name' => 'Stable Diffusion 3.5 Large',
                'description' => 'MMDiT text-to-image with excellent typography and prompt understanding.',
                'parameters' => [
                    'image_size' => [
                        'type' => 'select',
                        'label' => 'Image Size',
                        'options' => [
                            'square_hd' => 'Square HD (1024×1024)',
                            'portrait_4_3' => 'Portrait 4:3',
                            'portrait_16_9' => 'Portrait 16:9',
                            'landscape_4_3' => 'Landscape 4:3',
                            'landscape_16_9' => 'Landscape 16:9',
                        ],
                    ],
                    'num_inference_steps' => [
                        'type' => 'slider',
                        'label' => 'Inference Steps',
                        'min' => 10,
                        'max' => 50,
                    ],
                    'guidance_scale' => [
                        'type' => 'slider',
                        'label' => 'Guidance Scale',
                        'min' => 1,
                        'max' => 15,
                        'step' => 0.5,
                    ],
                    'negative_prompt' => [
                        'type' => 'textarea',
                        'label' => 'Negative Prompt',
                    ],
                ],
                'defaults' => [
                    'image_size' => 'portrait_16_9',
                    'num_inference_steps' => 28,
                    'guidance_scale' => 4.5,
                    'negative_prompt' => '',
                ],
            ],
        ];
    }

    /**
     * @return array<string, array{id: string, name: string, description: string, parameters: array<string, mixed>, defaults: array<string, mixed>}>
     */
    public static function imageToVideoModels(): array
    {
        return [
            'minimax-video' => [
                'id' => 'fal-ai/minimax-video/image-to-video',
                'name' => 'MiniMax Video',
                'description' => 'High-quality video generation with natural motion.',
                'parameters' => [
                    'prompt_optimizer' => [
                        'type' => 'checkbox',
                        'label' => 'Optimize Prompt',
                    ],
                ],
                'defaults' => [
                    'prompt_optimizer' => true,
                ],
            ],
            'kling-standard' => [
                'id' => 'fal-ai/kling-video/v1/standard/image-to-video',
                'name' => 'Kling 1.0 Standard',
                'description' => 'Reliable video generation with good motion quality.',
                'parameters' => [
                    'duration' => [
                        'type' => 'select',
                        'label' => 'Duration',
                        'options' => [
                            '5' => '5 seconds',
                            '10' => '10 seconds',
                        ],
                    ],
                    'aspect_ratio' => [
                        'type' => 'select',
                        'label' => 'Aspect Ratio',
                        'options' => [
                            '16:9' => 'Widescreen (16:9)',
                            '9:16' => 'Vertical (9:16)',
                            '1:1' => 'Square (1:1)',
                        ],
                    ],
                ],
                'defaults' => [
                    'duration' => '5',
                    'aspect_ratio' => '16:9',
                ],
            ],
            'kling-pro' => [
                'id' => 'fal-ai/kling-video/v1/pro/image-to-video',
                'name' => 'Kling 1.0 Pro',
                'description' => 'Higher quality with more detailed motion.',
                'parameters' => [
                    'duration' => [
                        'type' => 'select',
                        'label' => 'Duration',
                        'options' => [
                            '5' => '5 seconds',
                            '10' => '10 seconds',
                        ],
                    ],
                    'aspect_ratio' => [
                        'type' => 'select',
                        'label' => 'Aspect Ratio',
                        'options' => [
                            '16:9' => 'Widescreen (16:9)',
                            '9:16' => 'Vertical (9:16)',
                            '1:1' => 'Square (1:1)',
                        ],
                    ],
                ],
                'defaults' => [
                    'duration' => '5',
                    'aspect_ratio' => '16:9',
                ],
            ],
            'luma-dream-machine' => [
                'id' => 'fal-ai/luma-dream-machine/image-to-video',
                'name' => 'Luma Dream Machine',
                'description' => 'Dreamlike video generation with smooth transitions.',
                'parameters' => [
                    'aspect_ratio' => [
                        'type' => 'select',
                        'label' => 'Aspect Ratio',
                        'options' => [
                            '16:9' => 'Widescreen (16:9)',
                            '9:16' => 'Vertical (9:16)',
                            '1:1' => 'Square (1:1)',
                            '4:3' => 'Standard (4:3)',
                            '3:4' => 'Portrait (3:4)',
                            '21:9' => 'Ultrawide (21:9)',
                        ],
                    ],
                    'loop' => [
                        'type' => 'checkbox',
                        'label' => 'Create Loop',
                    ],
                ],
                'defaults' => [
                    'aspect_ratio' => '16:9',
                    'loop' => false,
                ],
            ],
            'wan-i2v' => [
                'id' => 'fal-ai/wan/v2.1/image-to-video',
                'name' => 'Wan 2.1 Image to Video',
                'description' => 'Advanced video generation with high fidelity.',
                'parameters' => [
                    'resolution' => [
                        'type' => 'select',
                        'label' => 'Resolution',
                        'options' => [
                            '480p' => '480p',
                            '720p' => '720p',
                        ],
                    ],
                    'num_frames' => [
                        'type' => 'slider',
                        'label' => 'Number of Frames',
                        'min' => 24,
                        'max' => 81,
                    ],
                ],
                'defaults' => [
                    'resolution' => '480p',
                    'num_frames' => 81,
                ],
            ],
        ];
    }

    /**
     * @return array<string, array{id: string, name: string, description: string, parameters: array<string, mixed>, defaults: array<string, mixed>}>
     */
    public static function textToMusicModels(): array
    {
        return [
            'stable-audio' => [
                'id' => 'fal-ai/stable-audio',
                'name' => 'Stable Audio',
                'description' => 'Generate music and sound effects from text descriptions.',
                'parameters' => [
                    'seconds_total' => [
                        'type' => 'slider',
                        'label' => 'Duration (seconds)',
                        'min' => 5,
                        'max' => 180,
                    ],
                    'steps' => [
                        'type' => 'slider',
                        'label' => 'Quality Steps',
                        'min' => 50,
                        'max' => 200,
                    ],
                ],
                'defaults' => [
                    'seconds_total' => 30,
                    'steps' => 100,
                ],
            ],
            'musicgen' => [
                'id' => 'fal-ai/musicgen',
                'name' => 'MusicGen',
                'description' => 'Meta\'s music generation model. Great for melodies.',
                'parameters' => [
                    'duration_seconds' => [
                        'type' => 'slider',
                        'label' => 'Duration (seconds)',
                        'min' => 5,
                        'max' => 30,
                    ],
                ],
                'defaults' => [
                    'duration_seconds' => 15,
                ],
            ],
        ];
    }

    /**
     * @return array<string, array{id: string, name: string, description: string, parameters: array<string, mixed>, defaults: array<string, mixed>}>
     */
    public static function textToSpeechModels(): array
    {
        return [
            'f5-tts' => [
                'id' => 'fal-ai/f5-tts',
                'name' => 'F5-TTS',
                'description' => 'High-quality text-to-speech with natural prosody.',
                'parameters' => [
                    'ref_audio_url' => [
                        'type' => 'audio_upload',
                        'label' => 'Voice Reference (optional)',
                    ],
                ],
                'defaults' => [
                    'ref_audio_url' => null,
                ],
            ],
            'kokoro' => [
                'id' => 'fal-ai/kokoro/american-english',
                'name' => 'Kokoro (American English)',
                'description' => 'Natural American English speech synthesis.',
                'parameters' => [
                    'voice' => [
                        'type' => 'select',
                        'label' => 'Voice',
                        'options' => [
                            'af_bella' => 'Bella (Female)',
                            'af_nicole' => 'Nicole (Female)',
                            'af_sarah' => 'Sarah (Female)',
                            'af_sky' => 'Sky (Female)',
                            'am_adam' => 'Adam (Male)',
                            'am_michael' => 'Michael (Male)',
                        ],
                    ],
                    'speed' => [
                        'type' => 'slider',
                        'label' => 'Speed',
                        'min' => 0.5,
                        'max' => 2.0,
                        'step' => 0.1,
                    ],
                ],
                'defaults' => [
                    'voice' => 'af_bella',
                    'speed' => 1.0,
                ],
            ],
            'playht-tts' => [
                'id' => 'fal-ai/playht/tts/v3',
                'name' => 'PlayHT TTS v3',
                'description' => 'Expressive text-to-speech with emotion control.',
                'parameters' => [
                    'voice' => [
                        'type' => 'text',
                        'label' => 'Voice ID',
                    ],
                    'speed' => [
                        'type' => 'slider',
                        'label' => 'Speed',
                        'min' => 0.5,
                        'max' => 2.0,
                        'step' => 0.1,
                    ],
                    'temperature' => [
                        'type' => 'slider',
                        'label' => 'Temperature',
                        'min' => 0,
                        'max' => 2,
                        'step' => 0.1,
                    ],
                ],
                'defaults' => [
                    'speed' => 1.0,
                    'temperature' => 1.0,
                ],
            ],
        ];
    }

    /**
     * @return array<string, array{id: string, name: string, description: string, parameters: array<string, mixed>, defaults: array<string, mixed>}>
     */
    public static function textToSfxModels(): array
    {
        return [
            'stable-audio-sfx' => [
                'id' => 'fal-ai/stable-audio',
                'name' => 'Stable Audio (SFX)',
                'description' => 'Generate sound effects from text descriptions.',
                'parameters' => [
                    'seconds_total' => [
                        'type' => 'slider',
                        'label' => 'Duration (seconds)',
                        'min' => 1,
                        'max' => 30,
                    ],
                    'steps' => [
                        'type' => 'slider',
                        'label' => 'Quality Steps',
                        'min' => 50,
                        'max' => 150,
                    ],
                ],
                'defaults' => [
                    'seconds_total' => 5,
                    'steps' => 100,
                ],
            ],
            'audiogen' => [
                'id' => 'fal-ai/audiogen',
                'name' => 'AudioGen',
                'description' => 'Meta\'s audio generation for environmental sounds.',
                'parameters' => [
                    'duration_seconds' => [
                        'type' => 'slider',
                        'label' => 'Duration (seconds)',
                        'min' => 1,
                        'max' => 10,
                    ],
                ],
                'defaults' => [
                    'duration_seconds' => 5,
                ],
            ],
        ];
    }

    /**
     * @return array{id: string, name: string, description: string, parameters: array<string, mixed>, defaults: array<string, mixed>}|null
     */
    public static function getModel(GenerationType $type, string $modelKey): ?array
    {
        $models = self::all()[$type->value] ?? [];

        return $models[$modelKey] ?? null;
    }

    /**
     * @return array{id: string, name: string, description: string, parameters: array<string, mixed>, defaults: array<string, mixed>}
     */
    public static function getDefaultModel(GenerationType $type): array
    {
        $models = self::all()[$type->value] ?? [];
        $firstKey = array_key_first($models);

        return $models[$firstKey] ?? throw new \RuntimeException("No models available for {$type->value}");
    }

    /**
     * @return array<string, array{id: string, name: string, description: string}>
     */
    public static function getModelsForType(GenerationType $type): array
    {
        $models = self::all()[$type->value] ?? [];

        return array_map(fn ($model) => [
            'id' => $model['id'],
            'name' => $model['name'],
            'description' => $model['description'],
        ], $models);
    }
}
