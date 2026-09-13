<?php

use App\Ai\VideoTemplateInstructions;
use App\Enums\GenerationType;

it('renders every configured preferred model into both agent prompts', function () {
    $creator = VideoTemplateInstructions::forCreatorAgent();
    $generic = VideoTemplateInstructions::forGenericAgent();

    foreach (config('agent_video_templates.preferred_models') as $type => $preference) {
        if ($preference['primary'] === null) {
            continue;
        }

        expect($creator)->toContain("{$type}: {$preference['primary']}")
            ->and($generic)->toContain("{$type}: {$preference['primary']}");

        foreach ($preference['alternatives'] as $alternative) {
            expect($creator)->toContain($alternative)
                ->and($generic)->toContain($alternative);
        }
    }
});

it('keys the preferred model map by known generation types', function () {
    $types = array_column(GenerationType::cases(), 'value');

    foreach (array_keys(config('agent_video_templates.preferred_models')) as $type) {
        expect($types)->toContain($type);
    }
});

it('omits generation types that have no preference from the prompt', function () {
    config()->set('agent_video_templates.preferred_models', [
        'text_to_image' => ['primary' => 'acme/painter', 'alternatives' => [], 'note' => null],
        'text_to_sfx' => ['primary' => null, 'alternatives' => [], 'note' => 'none yet'],
    ]);

    expect(VideoTemplateInstructions::forCreatorAgent())
        ->toContain('text_to_image: acme/painter')
        ->not->toContain('text_to_sfx');
});
