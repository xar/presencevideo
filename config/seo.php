<?php

return [
    'site' => [
        'name' => config('app.name', 'usekeyframes.com'),
        'description' => 'Create polished videos faster with AI-assisted editing, keyframe animation, subtitles, and production-ready exports.',
        'image' => '/og-image.png',
    ],

    'programmatic_pages' => [
        'ai-video-editor' => [
            'title' => 'AI Video Editor for Fast, Polished Content',
            'description' => 'Use AI-assisted editing tools to turn raw footage into polished videos with captions, animations, and exports built for modern teams.',
            'eyebrow' => 'AI video editing',
            'headline' => 'Create polished videos faster with an AI video editor',
            'intro' => 'Usekeyframes helps creators and teams move from idea to publish-ready video with fewer repetitive editing steps.',
            'features' => [
                'Generate and refine edits with AI-assisted workflows.',
                'Add captions, text overlays, and timing-aware animations.',
                'Export lightweight videos ready for campaigns, social, and product updates.',
            ],
        ],
    ],

    'draft_programmatic_pages' => [
        'add-subtitles-to-video' => [
            'title' => 'Add Subtitles to Video With AI-Assisted Editing',
            'description' => 'Draft use-case page for creators and teams who need accurate subtitles, styled captions, timing control, and production-ready video exports.',
            'target_keyword' => 'add subtitles to video',
            'intent' => 'Task / commercial investigation',
            'status' => 'draft',
            'brief' => [
                'angle' => 'Show how subtitle work fits into the full editing workflow: transcript cleanup, readable styling, motion timing, aspect-ratio checks, and final export QA.',
                'serp_gap' => 'Top results emphasize upload-and-caption utilities; the Usekeyframes page should differentiate around creator/team workflow, keyframe-aware text treatment, and publish-ready export checks.',
                'internal_links' => [
                    '/use-cases/ai-video-editor',
                    '/blog/how-to-make-product-videos-faster',
                ],
                'cta' => 'Create a captioned video faster with Usekeyframes.',
                'sources' => [
                    'https://clideo.com/add-subtitles-to-video',
                    'https://www.canva.com/features/add-subtitles-to-video/',
                    'https://www.happyscribe.com/tools/add-subtitles-to-video',
                    'https://www.veed.io/tools/add-subtitles',
                    'https://www.adobe.com/express/feature/video/add-caption',
                ],
            ],
        ],
        'product-video-maker' => [
            'title' => 'Product Video Maker for Fast Marketing Launches',
            'description' => 'Draft use-case page for founders, marketers, and product teams that need to turn product assets, scripts, subtitles, and motion into publish-ready videos.',
            'target_keyword' => 'product video maker',
            'intent' => 'Commercial / product-led task',
            'status' => 'draft',
            'brief' => [
                'angle' => 'Position Usekeyframes for teams that already have product footage, screenshots, or launch messaging and need a faster path to polished demos, ads, and social clips with subtitles and keyframe animation.',
                'serp_gap' => 'Current results emphasize AI generation from prompts, product links, or images. Differentiate with an editing workflow that refines real product assets into controlled, brand-safe exports instead of only generating net-new clips.',
                'structure' => [
                    'Create product videos without rebuilding every edit from scratch.',
                    'Start from product footage, screenshots, scripts, or launch notes.',
                    'Use AI assistance for rough cuts, captions, and repeatable edits.',
                    'Add keyframed motion to focus attention on product moments.',
                    'Check subtitles, aspect ratios, pacing, and export settings before publishing.',
                ],
                'internal_links' => [
                    '/use-cases/ai-video-editor',
                    '/blog/how-to-make-product-videos-faster',
                ],
                'cta' => 'Turn product assets into a polished launch video with Usekeyframes.',
                'sources' => [
                    'https://www.veed.io/tools/auto-video-editor/ai-product-video-generator',
                    'https://invideo.io/make/product-video/',
                    'https://www.fotor.com/ai-video-generator/product-video/',
                    'https://vmake.ai/product-video',
                    'https://pictory.ai/ai-product-video-generator',
                ],
            ],
        ],
    ],

    'blog_posts' => [
        'how-to-make-product-videos-faster' => [
            'title' => 'How to Make Product Videos Faster',
            'description' => 'A practical workflow for planning, editing, and shipping product videos without slowing down your marketing or product team.',
            'published_at' => '2026-05-25',
            'author' => 'Usekeyframes Team',
            'excerpt' => 'A lean product video workflow that keeps quality high while reducing repetitive editing work.',
            'sections' => [
                [
                    'heading' => 'Start with a single message',
                    'body' => 'Define the product action, feature, or outcome the viewer should remember before you open the editor.',
                ],
                [
                    'heading' => 'Edit around moments, not timelines',
                    'body' => 'Trim your footage into strong moments first, then layer captions, movement, and context after the story is clear.',
                ],
                [
                    'heading' => 'Reuse a repeatable export checklist',
                    'body' => 'Keep title-safe spacing, captions, aspect ratio, compression, and thumbnail checks consistent for every publish cycle.',
                ],
            ],
        ],
    ],
];
