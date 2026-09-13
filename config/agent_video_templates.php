<?php

return [
    'default_template' => 'general_video',
    'default_quality_preset' => 'medium',

    /*
    |--------------------------------------------------------------------------
    | Preferred fal.ai models
    |--------------------------------------------------------------------------
    |
    | The house default model for each generation type. This is the single place
    | to change what the agents reach for; both GenericAgent (which locks the
    | model plan) and CreatorAgent (which executes it) are prompted from this map.
    |
    | Keys are App\Enums\GenerationType values. Each entry accepts:
    |   primary      - the model_id to use unless there is a reason not to
    |   alternatives - acceptable swaps at the same tier, in preference order
    |   note         - short rationale or "when to pick the alternative" hint
    |
    | Leave `primary` null to let the agent discover a model via list_fal_models.
    |
    */

    'preferred_models' => [
        'text_to_image' => [
            'primary' => 'openai/gpt-image-2.5/sunburst/text-to-image',
            'alternatives' => ['alibaba/qwen-image-3/text-to-image'],
            'note' => 'Sunburst for prompt adherence and legible in-image text; Qwen for stylised or non-Latin typography.',
        ],
        'text_to_video' => [
            'primary' => 'minimax/h3-max/text-to-video',
            'alternatives' => [],
            'note' => 'Use only when there is no source image; otherwise generate a still first and use image_to_video.',
        ],
        'image_to_video' => [
            'primary' => 'minimax/h3-max/image-to-video',
            'alternatives' => ['minimax/h3-max-turbo/image-to-video', 'lightricks/ltx-2.5/image-to-video/fast'],
            'note' => 'H3 Max is the house default for motion and prompt adherence; H3 Max Turbo when throughput matters more than fidelity, LTX fast only for throwaway drafts.',
        ],
        'text_to_speech' => [
            'primary' => 'fal-ai/minimax/speech-2.8-turbo',
            'alternatives' => [],
            'note' => 'Default voiceover model for all narration and dialogue.',
        ],
        'text_to_music' => [
            'primary' => 'sonilo/v1.1/text-to-music',
            'alternatives' => [],
            'note' => 'Default background music and score model.',
        ],
        'text_to_sfx' => [
            'primary' => null,
            'alternatives' => [],
            'note' => 'No house default yet. Pick the cheapest suitable model from list_fal_models.',
        ],
        'speech_to_text' => [
            'primary' => 'fal-ai/wizper',
            'alternatives' => [],
            'note' => 'Only transcription model wired up; used for subtitles.',
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Draft generations
    |--------------------------------------------------------------------------
    |
    | Agent-queued generations run at the cheapest resolution the chosen model
    | offers, so iterating on a script, a composition or a bug does not cost
    | full-quality generations. The model itself is NOT swapped: a draft is the
    | same model, same prompt and same duration as the final, only smaller, so
    | approving a draft and re-running it at full quality is a like-for-like
    | upgrade (see the regenerate_at_full_quality tool).
    |
    | `parameter_ladders` maps a model input to the values worth trying, cheapest
    | first. A ladder value is only sent when the model's own schema exposes that
    | parameter and offers the value, so a model without the knob is untouched.
    |
    */

    'draft_generations' => [
        'enabled' => env('AGENT_DRAFT_GENERATIONS', true),
        'parameter_ladders' => [
            'resolution' => ['360p', '480p', '512p', '540p', '576p', '580p', '720p', '768p'],
            'quality' => ['low', 'medium', 'standard'],
        ],
    ],

    'quality_presets' => [
        'low' => [
            'label' => 'Low / draft',
            'instruction' => 'Use the cheapest and fastest acceptable model choices for drafts, placeholders, experiments, and uncertain briefs.',
            'model_guidance' => [
                'text_to_image' => ['fal-ai/flux/schnell', 'fal-ai/flux/dev'],
                'image_to_video' => ['lowest-cost acceptable image-to-video model from list_fal_models'],
                'audio' => ['lowest-cost acceptable music, speech, or SFX model from list_fal_models'],
            ],
        ],
        'medium' => [
            'label' => 'Medium / balanced',
            'instruction' => 'Use the preferred house models listed above. This preset is the default, so the preferred model for each generation type applies as-is.',
            'model_guidance' => [
                'all' => ['the primary model from the preferred fal.ai models map'],
            ],
        ],
        'high' => [
            'label' => 'High / premium',
            'instruction' => 'Use premium models only for final hero shots, paid/client-ready work, difficult realism or motion, or when the user explicitly asks for best quality.',
            'model_guidance' => [
                'text_to_image' => ['FLUX Pro/Ultra-style models returned by list_fal_models'],
                'image_to_video' => ['Kling, Runway, Seedance, Veo-style models returned by list_fal_models'],
                'audio' => ['highest-quality suitable music, speech, or SFX model from list_fal_models'],
            ],
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Templates
    |--------------------------------------------------------------------------
    |
    | `recipe` names the deterministic TypeScript recipe (see
    | resources/js/lib/editor/model/recipes) ComposerAgent applies for the
    | template, and `brand_slots` lists which brand kit slots that recipe
    | consumes so the producer can tell the user what is missing up front.
    |
    */

    'templates' => [
        'general_video' => [
            'name' => 'General Video',
            'quality_preset' => 'medium',
            'aspect_ratio' => '9:16',
            'duration_seconds' => 20,
            'recipe' => 'tiktok-hook-body-cta',
            'brand_slots' => ['colors', 'fonts', 'logo'],
            'structure' => [
                'Clarify the goal and audience.',
                'Create a clear hook, 3-5 visual beats, and a concise ending.',
                'Delegate a locked model plan and scene-by-scene production brief to CreatorAgent.',
            ],
            'model_policy' => 'Use medium unless the user clearly requests draft speed/cost savings or premium final quality.',
        ],
        'ugc_ad' => [
            'name' => 'UGC Ad',
            'quality_preset' => 'medium',
            'aspect_ratio' => '9:16',
            'duration_seconds' => 25,
            'recipe' => 'tiktok-talking-caption',
            'brand_slots' => ['colors', 'fonts', 'logo', 'outro', 'voice'],
            'structure' => [
                'Hook with a relatable problem in the first 2 seconds.',
                'Show product or offer as the simple solution.',
                'Demonstrate 2-3 benefits with social-proof style captions.',
                'End with a direct CTA and offer reminder.',
            ],
            'model_policy' => 'Default medium for usable ad drafts. Use low for variant testing. Use high only for final polished product shots or premium client delivery.',
        ],
        'short_drama' => [
            'name' => 'Short Drama',
            'quality_preset' => 'high',
            'aspect_ratio' => '9:16',
            'duration_seconds' => 45,
            'recipe' => 'tiktok-hook-body-cta',
            'brand_slots' => ['fonts', 'music'],
            'structure' => [
                'Open with conflict or mystery immediately.',
                'Build 4-6 cinematic beats with escalating emotion.',
                'Use consistent characters, locations, and visual continuity.',
                'End with a twist, cliffhanger, or emotional payoff.',
            ],
            'model_policy' => 'Prefer high for character consistency, cinematic realism, and motion. Downgrade to medium only if the user prioritizes cost or drafts.',
        ],
        'education' => [
            'name' => 'Education',
            'quality_preset' => 'medium',
            'aspect_ratio' => '9:16',
            'duration_seconds' => 35,
            'recipe' => 'tiktok-listicle',
            'brand_slots' => ['colors', 'fonts', 'logo', 'voice'],
            'structure' => [
                'Start with the learning promise or misconception.',
                'Explain 3 concise teaching points with clear visual examples.',
                'Use readable captions and simple motion that supports comprehension.',
                'End with a recap or next action.',
            ],
            'model_policy' => 'Default medium. Use low for quick lesson drafts. Use high only when visuals require premium realism or detailed animation.',
        ],
    ],
];
