<?php

return [
    'default_template' => 'general_video',
    'default_quality_preset' => 'medium',

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
            'instruction' => 'Use balanced, reliable models by default for production drafts and normal user requests.',
            'model_guidance' => [
                'text_to_image' => ['openai/gpt-image-2'],
                'image_to_video' => ['fal-ai/creatify/aurora'],
                'audio' => ['balanced music, speech, or SFX model from list_fal_models'],
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

    'templates' => [
        'general_video' => [
            'name' => 'General Video',
            'quality_preset' => 'medium',
            'aspect_ratio' => '9:16',
            'duration_seconds' => 20,
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
