<?php

namespace App\Ai;

class VideoTemplateInstructions
{
    /**
     * Render template and model preset instructions for the orchestration agent.
     */
    public static function forGenericAgent(): string
    {
        $config = config('agent_video_templates');

        return self::renderPreferredModels($config)."\n\n".self::renderDraftGenerations($config)."\n\n".self::renderQualityPresets($config)."\n\n".self::renderVideoTemplates($config)."\n\n".self::renderRecipeMap($config)."\n\n".self::renderLockedModelPlanRules();
    }

    /**
     * Template pacing and recipe hints for the scriptwriter.
     */
    public static function forScriptAgent(): string
    {
        $config = config('agent_video_templates');
        $lines = ['Template pacing (use the template the brief names; default '.($config['default_template'] ?? 'general_video').'):'];

        foreach ($config['templates'] ?? [] as $key => $template) {
            $lines[] = "- {$key} ({$template['name']}): ~{$template['duration_seconds']}s, recipe ".($template['recipe'] ?? 'none').'. '.implode(' ', $template['structure'] ?? []);
        }

        return implode("\n", $lines);
    }

    /**
     * Recipe and brand slot map for the compositor.
     */
    public static function forComposerAgent(): string
    {
        return self::renderRecipeMap(config('agent_video_templates'));
    }

    /**
     * @param  array<string, mixed>  $config
     */
    protected static function renderRecipeMap(array $config): string
    {
        $lines = [
            'Template to recipe map:',
            '- Apply the recipe named for the template unless the brief names another recipe from list_video_recipes.',
            '- brand_slots lists the brand kit slots the recipe consumes; a kit missing one of them still works, the slot is simply skipped.',
        ];

        foreach ($config['templates'] ?? [] as $key => $template) {
            $lines[] = "- {$key}: recipe ".($template['recipe'] ?? 'none').', brand_slots '.implode(', ', $template['brand_slots'] ?? []).'.';
        }

        return implode("\n", $lines);
    }

    /**
     * Render locked model plan instructions for the production agent.
     */
    public static function forCreatorAgent(): string
    {
        $instructions = <<<'INSTRUCTIONS'
Locked model plan enforcement:
- Treat the model plan passed by GenericAgent as locked production input.
- Do not upgrade, downgrade, substitute, or browse for different models when locked model_id values are provided.
- If a locked model_id cannot be used, stop and report the issue instead of silently choosing another model.
- If a model plan is missing, use medium or lower and avoid premium/pro/top-tier models unless the brief explicitly allows high.
- Preserve the template key, quality preset, selected model_id values, and model rationale in your tool calls and status summaries.
INSTRUCTIONS;

        $config = config('agent_video_templates');

        return $instructions."\n\n".self::renderPreferredModels($config)."\n\n".self::renderDraftGenerations($config);
    }

    /**
     * Render the house default model per generation type.
     *
     * @param  array<string, mixed>  $config
     */
    protected static function renderPreferredModels(array $config): string
    {
        $entries = array_filter(
            $config['preferred_models'] ?? [],
            fn (array $preference) => ($preference['primary'] ?? null) !== null || ($preference['alternatives'] ?? []) !== [],
        );

        if ($entries === []) {
            return '';
        }

        $lines = [
            'Preferred fal.ai models (house defaults):',
            '- Use the primary model for each generation type unless the brief locks a different model_id, the user names a model, or the quality preset is low/high and the preset guidance clearly points elsewhere.',
            '- Alternatives are acceptable swaps at the same tier; pick one only for the reason given in its note, and say why.',
            '- These are pre-approved, so you do not need list_fal_models before using them. Call list_fal_models only when no preference covers the generation type or the preferred model is rejected.',
        ];

        foreach ($entries as $type => $preference) {
            $line = "- {$type}: ".($preference['primary'] ?? 'no default, discover via list_fal_models');

            if (($preference['alternatives'] ?? []) !== []) {
                $line .= ' (alternatives: '.implode(', ', $preference['alternatives']).')';
            }

            $lines[] = $line;

            if (($preference['note'] ?? null) !== null) {
                $lines[] = '  '.$preference['note'];
            }
        }

        return implode("\n", $lines);
    }

    /**
     * Explain the draft tier: what it changes, and how to get the full version.
     *
     * Quality presets choose a MODEL; the draft tier only caps the resolution of
     * whichever model was chosen, so the two are independent and the agent has
     * to be told not to confuse them.
     *
     * @param  array<string, mixed>  $config
     */
    protected static function renderDraftGenerations(array $config): string
    {
        if (! ($config['draft_generations']['enabled'] ?? false)) {
            return 'Draft generations: disabled. Every generation runs at the model\'s full quality, so queue deliberately.';
        }

        return implode("\n", [
            'Draft generations (enabled):',
            '- Every generation queued through generate_fal_asset is a DRAFT by default: the same model, prompt, duration and aspect ratio, run at the cheapest resolution that model offers.',
            '- This is independent of the quality preset. The preset picks the model; the draft tier only caps its resolution, so a draft is a faithful cheap preview of the final shot.',
            '- Treat drafts as the normal way to iterate: scripts, compositions and fixes all cost a fraction this way.',
            '- Show drafts to the user and ask which shots are keepers. Once a shot is approved, call regenerate_at_full_quality with its generation_id to get the full-resolution version, then swap in the new output_asset_id.',
            '- Pass quality_tier="final" to generate_fal_asset only when the user explicitly asks for full quality up front.',
        ]);
    }

    /**
     * @param  array<string, mixed>  $config
     */
    protected static function renderQualityPresets(array $config): string
    {
        $defaultPreset = $config['default_quality_preset'] ?? 'medium';
        $lines = [
            'Model quality preset system:',
            "- Default quality preset: {$defaultPreset}.",
            '- Always choose a quality preset before choosing concrete model_id values.',
        ];

        foreach ($config['quality_presets'] ?? [] as $key => $preset) {
            $lines[] = "- {$key} ({$preset['label']}): {$preset['instruction']}";

            foreach ($preset['model_guidance'] ?? [] as $category => $models) {
                $lines[] = "  - {$category}: ".implode(', ', $models);
            }
        }

        return implode("\n", $lines);
    }

    /**
     * @param  array<string, mixed>  $config
     */
    protected static function renderVideoTemplates(array $config): string
    {
        $defaultTemplate = $config['default_template'] ?? 'general_video';
        $lines = [
            'Video template system:',
            "- Default template: {$defaultTemplate}.",
            '- Infer the best template from the user request when obvious; otherwise ask one concise question or use the default.',
            '- When delegating to CreatorAgent, include template_key, quality_preset, aspect_ratio, duration_seconds, locked_model_plan, and the beats.',
            '- When delegating to ComposerAgent, include template_key (it maps to a recipe), brand_kit_id, and the beats with their asset ids.',
        ];

        foreach ($config['templates'] ?? [] as $key => $template) {
            $lines[] = "- {$key} ({$template['name']}): {$template['aspect_ratio']}, ~{$template['duration_seconds']}s, preset {$template['quality_preset']}.";
            $lines[] = "  Model policy: {$template['model_policy']}";
            $lines[] = '  Structure: '.implode(' ', $template['structure'] ?? []);
        }

        return implode("\n", $lines);
    }

    protected static function renderLockedModelPlanRules(): string
    {
        return <<<'INSTRUCTIONS'
Locked model plan handoff:
- GenericAgent owns all template and model selection decisions.
- Before delegating production, decide the template_key and quality_preset, then select concrete model_id values or explicitly mark acceptable model_id values by asset type.
- Pass the model plan as locked_model_plan in the CreatorAgent brief. CreatorAgent must not change models.
- Include a short rationale, for example: "quality_preset=medium because this is a production draft; avoid premium models until final approval".
- If model choice matters and you have not selected a model, call list_fal_models first. If choice does not matter, still pass quality_preset and state that CreatorAgent must stay within that preset.
INSTRUCTIONS;
    }
}
