<?php

namespace App\Services\FalAI;

use Illuminate\Support\Facades\Cache;

class ModelRegistry
{
    protected string $platformUrl = 'https://fal.ai/api';

    protected string $modelsUrl = 'https://fal.ai/api/models/search';

    /**
     * Get all models for our supported generation types with full metadata.
     *
     * @return array<string, array<int, array{
     *     key: string,
     *     id: string,
     *     name: string,
     *     description: string,
     *     thumbnail: string|null,
     *     playground_url: string,
     *     category: string,
     *     tags: array<string>,
     *     pricing: array{base_price: float|null, price_per_unit: float|null, unit: string|null}|null,
     *     parameters: array<string, mixed>,
     *     defaults: array<string, mixed>,
     *     is_featured: bool,
     *     is_new: bool,
     * }>>
     */
    public function getAllModels(): array
    {
        return Cache::remember('fal_models_registry', 3600, function () {
            $models = [
                'text_to_image' => $this->getTextToImageModels(),
                'image_to_video' => $this->getImageToVideoModels(),
                'text_to_music' => $this->getTextToMusicModels(),
                'text_to_speech' => $this->getTextToSpeechModels(),
                'text_to_sfx' => $this->getTextToSfxModels(),
            ];

            return $models;
        });
    }

    /**
     * Force refresh the model cache.
     */
    public function refresh(): void
    {
        Cache::forget('fal_models_registry');
        $this->getAllModels();
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    protected function getTextToImageModels(): array
    {
        return [
            $this->buildModel('flux-dev', 'fal-ai/flux/dev', 'FLUX.1 Dev', [
                'description' => '12B parameter flow transformer. High-quality, versatile image generation with excellent prompt following.',
                'thumbnail' => 'https://fal.media/files/lion/zQ0PXTEzTDnlpkfKvJL6S.jpeg',
                'category' => 'text-to-image',
                'tags' => ['flux', 'high-quality', 'versatile'],
                'is_featured' => true,
                'parameters' => [
                    'image_size' => $this->sizeSelectParam(),
                    'num_inference_steps' => ['type' => 'slider', 'label' => 'Inference Steps', 'min' => 10, 'max' => 50],
                    'guidance_scale' => ['type' => 'slider', 'label' => 'Guidance Scale', 'min' => 1, 'max' => 20, 'step' => 0.5],
                    'num_images' => ['type' => 'slider', 'label' => 'Number of Images', 'min' => 1, 'max' => 4],
                    'enable_safety_checker' => ['type' => 'checkbox', 'label' => 'Safety Checker'],
                ],
                'defaults' => [
                    'image_size' => 'landscape_16_9',
                    'num_inference_steps' => 28,
                    'guidance_scale' => 3.5,
                    'num_images' => 1,
                    'enable_safety_checker' => true,
                ],
            ]),
            $this->buildModel('flux-schnell', 'fal-ai/flux/schnell', 'FLUX.1 Schnell', [
                'description' => 'Lightning fast 1-4 step generation. Perfect for quick iterations and real-time applications.',
                'thumbnail' => 'https://fal.media/files/lion/5A7qVi3eoP7TaLqsMZEI-.jpeg',
                'category' => 'text-to-image',
                'tags' => ['flux', 'fast', 'optimized'],
                'is_featured' => true,
                'is_new' => false,
                'parameters' => [
                    'image_size' => $this->sizeSelectParam(),
                    'num_inference_steps' => ['type' => 'slider', 'label' => 'Steps (1-4)', 'min' => 1, 'max' => 4],
                    'num_images' => ['type' => 'slider', 'label' => 'Number of Images', 'min' => 1, 'max' => 4],
                ],
                'defaults' => [
                    'image_size' => 'landscape_16_9',
                    'num_inference_steps' => 4,
                    'num_images' => 1,
                ],
            ]),
            $this->buildModel('flux-pro-ultra', 'fal-ai/flux-pro/v1.1-ultra', 'FLUX.1 Pro Ultra', [
                'description' => 'Professional-grade up to 2K resolution with improved photo realism. Best for production use.',
                'thumbnail' => 'https://fal.media/files/tiger/vLWaFdlbdYqyDfSYdHRHn.jpeg',
                'category' => 'text-to-image',
                'tags' => ['flux', 'pro', '2k', 'realism'],
                'is_featured' => true,
                'parameters' => [
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
                    'safety_tolerance' => ['type' => 'slider', 'label' => 'Safety Tolerance', 'min' => 1, 'max' => 6],
                ],
                'defaults' => ['aspect_ratio' => '16:9', 'safety_tolerance' => 2],
            ]),
            $this->buildModel('recraft-v3', 'fal-ai/recraft-v3', 'Recraft V3', [
                'description' => 'State-of-the-art with excellent typography, vector art, and brand style capabilities.',
                'thumbnail' => 'https://fal.media/files/kangaroo/eXJJLBpZj9VoQf3cXB22Y.jpeg',
                'category' => 'text-to-image',
                'tags' => ['recraft', 'typography', 'vector', 'sota'],
                'is_featured' => true,
                'is_new' => true,
                'parameters' => [
                    'image_size' => $this->sizeSelectParam(),
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
                'defaults' => ['image_size' => 'landscape_16_9', 'style' => 'any'],
            ]),
            $this->buildModel('stable-diffusion-35', 'fal-ai/stable-diffusion-v35-large', 'SD 3.5 Large', [
                'description' => 'Stable Diffusion 3.5 Large - MMDiT with excellent typography and prompt understanding.',
                'thumbnail' => 'https://fal.media/files/panda/n6TxFj_Lf5cXPT4YP8XdG.jpeg',
                'category' => 'text-to-image',
                'tags' => ['stable-diffusion', 'sd3.5', 'typography'],
                'parameters' => [
                    'image_size' => $this->sizeSelectParam(),
                    'num_inference_steps' => ['type' => 'slider', 'label' => 'Inference Steps', 'min' => 10, 'max' => 50],
                    'guidance_scale' => ['type' => 'slider', 'label' => 'Guidance Scale', 'min' => 1, 'max' => 15, 'step' => 0.5],
                    'negative_prompt' => ['type' => 'textarea', 'label' => 'Negative Prompt'],
                ],
                'defaults' => [
                    'image_size' => 'landscape_16_9',
                    'num_inference_steps' => 28,
                    'guidance_scale' => 4.5,
                    'negative_prompt' => '',
                ],
            ]),
            $this->buildModel('ideogram-v2', 'fal-ai/ideogram/v2', 'Ideogram V2', [
                'description' => 'Exceptional text rendering in images. Best for logos, posters, and text-heavy designs.',
                'thumbnail' => 'https://fal.media/files/koala/RG0UMv0TaNPmzXFMqgb3e.png',
                'category' => 'text-to-image',
                'tags' => ['ideogram', 'text-rendering', 'logos'],
                'is_new' => true,
                'parameters' => [
                    'aspect_ratio' => [
                        'type' => 'select',
                        'label' => 'Aspect Ratio',
                        'options' => [
                            '1:1' => 'Square (1:1)',
                            '16:9' => 'Widescreen (16:9)',
                            '9:16' => 'Portrait (9:16)',
                            '4:3' => 'Standard (4:3)',
                            '3:4' => 'Portrait (3:4)',
                        ],
                    ],
                    'style' => [
                        'type' => 'select',
                        'label' => 'Style',
                        'options' => [
                            'auto' => 'Auto',
                            'general' => 'General',
                            'realistic' => 'Realistic',
                            'design' => 'Design',
                            '3d' => '3D Render',
                            'anime' => 'Anime',
                        ],
                    ],
                    'negative_prompt' => ['type' => 'textarea', 'label' => 'Negative Prompt'],
                ],
                'defaults' => ['aspect_ratio' => '16:9', 'style' => 'auto', 'negative_prompt' => ''],
            ]),
            $this->buildModel('fast-sdxl', 'fal-ai/fast-sdxl', 'Fast SDXL', [
                'description' => 'Optimized SDXL with LoRA support. Fast and flexible with custom styles.',
                'thumbnail' => 'https://fal.media/files/elephant/UKaM3qqHxvn8HKnZbVqmj.jpeg',
                'category' => 'text-to-image',
                'tags' => ['sdxl', 'fast', 'lora'],
                'parameters' => [
                    'image_size' => $this->sizeSelectParam(),
                    'num_inference_steps' => ['type' => 'slider', 'label' => 'Inference Steps', 'min' => 10, 'max' => 50],
                    'guidance_scale' => ['type' => 'slider', 'label' => 'Guidance Scale', 'min' => 1, 'max' => 15, 'step' => 0.5],
                    'negative_prompt' => ['type' => 'textarea', 'label' => 'Negative Prompt'],
                ],
                'defaults' => [
                    'image_size' => 'landscape_16_9',
                    'num_inference_steps' => 25,
                    'guidance_scale' => 7.5,
                    'negative_prompt' => '',
                ],
            ]),
        ];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    protected function getImageToVideoModels(): array
    {
        return [
            $this->buildModel('minimax-video', 'fal-ai/minimax/video-01/image-to-video', 'MiniMax Video-01', [
                'description' => 'High-quality video generation with natural, fluid motion. Great for realistic animations.',
                'thumbnail' => 'https://fal.media/files/monkey/5E7O-8qiEIDmPD9FvlBAb.png',
                'category' => 'image-to-video',
                'tags' => ['minimax', 'natural-motion', 'high-quality'],
                'is_featured' => true,
                'parameters' => [
                    'prompt_optimizer' => ['type' => 'checkbox', 'label' => 'Optimize Prompt'],
                ],
                'defaults' => ['prompt_optimizer' => true],
            ]),
            $this->buildModel('kling-1.6-pro', 'fal-ai/kling-video/v1.6/pro/image-to-video', 'Kling 1.6 Pro', [
                'description' => 'Latest Kling model with superior motion quality and longer durations up to 10s.',
                'thumbnail' => 'https://fal.media/files/zebra/RqmTd_dXMEMWVkj7ggx07.png',
                'category' => 'image-to-video',
                'tags' => ['kling', 'pro', '10s', 'high-quality'],
                'is_featured' => true,
                'is_new' => true,
                'parameters' => [
                    'duration' => [
                        'type' => 'select',
                        'label' => 'Duration',
                        'options' => ['5' => '5 seconds', '10' => '10 seconds'],
                    ],
                    'aspect_ratio' => $this->videoAspectParam(),
                ],
                'defaults' => ['duration' => '5', 'aspect_ratio' => '16:9'],
            ]),
            $this->buildModel('kling-1.5-pro', 'fal-ai/kling-video/v1.5/pro/image-to-video', 'Kling 1.5 Pro', [
                'description' => 'Reliable video generation with excellent motion consistency.',
                'thumbnail' => 'https://fal.media/files/zebra/tWNHQJbZPfUmzj2VPRJKD.png',
                'category' => 'image-to-video',
                'tags' => ['kling', 'pro', 'reliable'],
                'is_featured' => true,
                'parameters' => [
                    'duration' => [
                        'type' => 'select',
                        'label' => 'Duration',
                        'options' => ['5' => '5 seconds', '10' => '10 seconds'],
                    ],
                    'aspect_ratio' => $this->videoAspectParam(),
                ],
                'defaults' => ['duration' => '5', 'aspect_ratio' => '16:9'],
            ]),
            $this->buildModel('luma-ray-2', 'fal-ai/luma-dream-machine/ray-2/image-to-video', 'Luma Ray 2', [
                'description' => 'Next-gen Luma model with improved realism and dynamic camera movements.',
                'thumbnail' => 'https://fal.media/files/panda/dRdfP0_9Rn6kJKOz4vZ3d.png',
                'category' => 'image-to-video',
                'tags' => ['luma', 'ray2', 'camera-motion'],
                'is_new' => true,
                'parameters' => [
                    'aspect_ratio' => $this->videoAspectParam(),
                    'loop' => ['type' => 'checkbox', 'label' => 'Create Loop'],
                ],
                'defaults' => ['aspect_ratio' => '16:9', 'loop' => false],
            ]),
            $this->buildModel('luma-dream-machine', 'fal-ai/luma-dream-machine/image-to-video', 'Luma Dream Machine', [
                'description' => 'Dreamlike video generation with smooth, cinematic transitions.',
                'thumbnail' => 'https://fal.media/files/lion/WH5lNTB5KLHa9iZQXy-l6.png',
                'category' => 'image-to-video',
                'tags' => ['luma', 'dreamlike', 'cinematic'],
                'parameters' => [
                    'aspect_ratio' => $this->videoAspectParam(),
                    'loop' => ['type' => 'checkbox', 'label' => 'Create Loop'],
                ],
                'defaults' => ['aspect_ratio' => '16:9', 'loop' => false],
            ]),
            $this->buildModel('wan-i2v', 'fal-ai/wan/v2.1/image-to-video', 'Wan 2.1', [
                'description' => 'Advanced open-source video generation with high fidelity motion.',
                'thumbnail' => 'https://fal.media/files/penguin/w5dYfihCWcO0cw2H20q39.png',
                'category' => 'image-to-video',
                'tags' => ['wan', 'open-source', 'high-fidelity'],
                'parameters' => [
                    'resolution' => [
                        'type' => 'select',
                        'label' => 'Resolution',
                        'options' => ['480p' => '480p', '720p' => '720p'],
                    ],
                ],
                'defaults' => ['resolution' => '480p'],
            ]),
            $this->buildModel('hunyuan-video', 'fal-ai/hunyuan-video/image-to-video', 'Hunyuan Video', [
                'description' => 'Tencent\'s video model with strong motion understanding and generation.',
                'thumbnail' => 'https://fal.media/files/kangaroo/VO_3B4KHfJ-NXVGPmDkrk.png',
                'category' => 'image-to-video',
                'tags' => ['hunyuan', 'tencent', 'motion'],
                'parameters' => [
                    'aspect_ratio' => $this->videoAspectParam(),
                ],
                'defaults' => ['aspect_ratio' => '16:9'],
            ]),
        ];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    protected function getTextToMusicModels(): array
    {
        return [
            $this->buildModel('stable-audio', 'fal-ai/stable-audio', 'Stable Audio', [
                'description' => 'High-quality music and audio generation from text descriptions.',
                'thumbnail' => 'https://fal.media/files/kangaroo/Yj0_HKuIb6wQ7-pvpNjmK.png',
                'category' => 'text-to-audio',
                'tags' => ['stable-audio', 'music', 'versatile'],
                'is_featured' => true,
                'parameters' => [
                    'seconds_total' => ['type' => 'slider', 'label' => 'Duration (seconds)', 'min' => 5, 'max' => 180],
                    'steps' => ['type' => 'slider', 'label' => 'Quality Steps', 'min' => 50, 'max' => 200],
                ],
                'defaults' => ['seconds_total' => 30, 'steps' => 100],
            ]),
            $this->buildModel('musicgen-large', 'fal-ai/musicgen-large', 'MusicGen Large', [
                'description' => 'Meta\'s large music generation model. Excellent for melodies and compositions.',
                'thumbnail' => 'https://fal.media/files/koala/0fJFU0bfYk8hJD0gNhVRs.png',
                'category' => 'text-to-audio',
                'tags' => ['musicgen', 'meta', 'melody'],
                'parameters' => [
                    'duration_seconds' => ['type' => 'slider', 'label' => 'Duration (seconds)', 'min' => 5, 'max' => 30],
                ],
                'defaults' => ['duration_seconds' => 15],
            ]),
            $this->buildModel('ace-step', 'fal-ai/ace-step', 'ACE-Step', [
                'description' => 'Fast music generation with singing voice synthesis capabilities.',
                'thumbnail' => 'https://fal.media/files/panda/3_NvAZrYwrJZfSxyDYPxD.png',
                'category' => 'text-to-audio',
                'tags' => ['ace', 'singing', 'voice'],
                'is_new' => true,
                'parameters' => [
                    'duration' => ['type' => 'slider', 'label' => 'Duration (seconds)', 'min' => 10, 'max' => 120],
                ],
                'defaults' => ['duration' => 30],
            ]),
        ];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    protected function getTextToSpeechModels(): array
    {
        return [
            $this->buildModel('f5-tts', 'fal-ai/f5-tts', 'F5-TTS', [
                'description' => 'High-quality TTS with natural prosody. Supports voice cloning with reference audio.',
                'thumbnail' => 'https://fal.media/files/tiger/a2aPLSE_QLsNgEz0x5dKD.png',
                'category' => 'text-to-speech',
                'tags' => ['f5', 'natural', 'voice-cloning'],
                'is_featured' => true,
                'parameters' => [
                    'ref_audio_url' => ['type' => 'text', 'label' => 'Reference Audio URL (optional)'],
                ],
                'defaults' => ['ref_audio_url' => ''],
            ]),
            $this->buildModel('kokoro-en', 'fal-ai/kokoro/american-english', 'Kokoro (English)', [
                'description' => 'Natural American English speech with multiple voice options.',
                'thumbnail' => 'https://fal.media/files/zebra/aCiP0t_qWW9XeqVU_8nKb.png',
                'category' => 'text-to-speech',
                'tags' => ['kokoro', 'english', 'natural'],
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
                    'speed' => ['type' => 'slider', 'label' => 'Speed', 'min' => 0.5, 'max' => 2.0, 'step' => 0.1],
                ],
                'defaults' => ['voice' => 'af_bella', 'speed' => 1.0],
            ]),
            $this->buildModel('playht-v3', 'fal-ai/playht/tts/v3', 'PlayHT v3', [
                'description' => 'Expressive TTS with emotion control and many voice options.',
                'thumbnail' => 'https://fal.media/files/monkey/PSCHKb-GptIONUPNZQz4j.png',
                'category' => 'text-to-speech',
                'tags' => ['playht', 'expressive', 'emotions'],
                'parameters' => [
                    'voice' => ['type' => 'text', 'label' => 'Voice ID'],
                    'speed' => ['type' => 'slider', 'label' => 'Speed', 'min' => 0.5, 'max' => 2.0, 'step' => 0.1],
                    'temperature' => ['type' => 'slider', 'label' => 'Expressiveness', 'min' => 0, 'max' => 2, 'step' => 0.1],
                ],
                'defaults' => ['voice' => '', 'speed' => 1.0, 'temperature' => 1.0],
            ]),
            $this->buildModel('mars6', 'fal-ai/mars6', 'Mars 6', [
                'description' => 'Advanced TTS with high-quality voice synthesis.',
                'thumbnail' => 'https://fal.media/files/panda/ZNTdEJpZNLqLnOHJWaFjU.png',
                'category' => 'text-to-speech',
                'tags' => ['mars6', 'advanced', 'high-quality'],
                'is_new' => true,
                'parameters' => [
                    'ref_audio_url' => ['type' => 'text', 'label' => 'Reference Audio URL'],
                ],
                'defaults' => ['ref_audio_url' => ''],
            ]),
        ];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    protected function getTextToSfxModels(): array
    {
        return [
            $this->buildModel('stable-audio-sfx', 'fal-ai/stable-audio', 'Stable Audio (SFX)', [
                'description' => 'Generate sound effects from text descriptions. Great for foley and ambient sounds.',
                'thumbnail' => 'https://fal.media/files/kangaroo/Yj0_HKuIb6wQ7-pvpNjmK.png',
                'category' => 'text-to-audio',
                'tags' => ['stable-audio', 'sfx', 'foley'],
                'is_featured' => true,
                'parameters' => [
                    'seconds_total' => ['type' => 'slider', 'label' => 'Duration (seconds)', 'min' => 1, 'max' => 30],
                    'steps' => ['type' => 'slider', 'label' => 'Quality Steps', 'min' => 50, 'max' => 150],
                ],
                'defaults' => ['seconds_total' => 5, 'steps' => 100],
            ]),
            $this->buildModel('audiogen', 'fal-ai/audiogen', 'AudioGen', [
                'description' => 'Meta\'s audio generation for environmental and ambient sounds.',
                'thumbnail' => 'https://fal.media/files/koala/0fJFU0bfYk8hJD0gNhVRs.png',
                'category' => 'text-to-audio',
                'tags' => ['audiogen', 'meta', 'environmental'],
                'parameters' => [
                    'duration_seconds' => ['type' => 'slider', 'label' => 'Duration (seconds)', 'min' => 1, 'max' => 10],
                ],
                'defaults' => ['duration_seconds' => 5],
            ]),
            $this->buildModel('mmaudio', 'fal-ai/mmaudio', 'MMAudio', [
                'description' => 'Multimodal audio generation. Can generate audio from video context.',
                'thumbnail' => 'https://fal.media/files/tiger/gqG5J9LJGx1HJ8xT_pjOa.png',
                'category' => 'text-to-audio',
                'tags' => ['mmaudio', 'multimodal', 'video-sync'],
                'is_new' => true,
                'parameters' => [
                    'duration' => ['type' => 'slider', 'label' => 'Duration (seconds)', 'min' => 1, 'max' => 15],
                ],
                'defaults' => ['duration' => 5],
            ]),
        ];
    }

    /**
     * Build a model configuration with metadata.
     *
     * @param  array<string, mixed>  $config
     * @return array<string, mixed>
     */
    protected function buildModel(string $key, string $id, string $name, array $config): array
    {
        return [
            'key' => $key,
            'id' => $id,
            'name' => $name,
            'description' => $config['description'] ?? '',
            'thumbnail' => $config['thumbnail'] ?? null,
            'playground_url' => "https://fal.ai/models/{$id}",
            'category' => $config['category'] ?? 'unknown',
            'tags' => $config['tags'] ?? [],
            'pricing' => $config['pricing'] ?? null,
            'parameters' => $config['parameters'] ?? [],
            'defaults' => $config['defaults'] ?? [],
            'is_featured' => $config['is_featured'] ?? false,
            'is_new' => $config['is_new'] ?? false,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    protected function sizeSelectParam(): array
    {
        return [
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
        ];
    }

    /**
     * @return array<string, mixed>
     */
    protected function videoAspectParam(): array
    {
        return [
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
        ];
    }
}
