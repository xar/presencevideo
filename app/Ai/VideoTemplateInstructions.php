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

        return self::renderQualityPresets($config)."\n\n".self::renderVideoTemplates($config)."\n\n".self::renderLockedModelPlanRules();
    }

    /**
     * Render locked model plan instructions for the production agent.
     */
    public static function forCreatorAgent(): string
    {
        return <<<'INSTRUCTIONS'
Locked model plan enforcement:
- Treat the model plan passed by GenericAgent as locked production input.
- Do not upgrade, downgrade, substitute, or browse for different models when locked model_id values are provided.
- If a locked model_id cannot be used, stop and report the issue instead of silently choosing another model.
- If a model plan is missing, use medium or lower and avoid premium/pro/top-tier models unless the brief explicitly allows high.
- Preserve the template key, quality preset, selected model_id values, and model rationale in your tool calls and status summaries.
INSTRUCTIONS;
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
            '- When delegating to CreatorAgent, include template_key, quality_preset, aspect_ratio, duration_seconds, locked_model_plan, and scene structure.',
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
