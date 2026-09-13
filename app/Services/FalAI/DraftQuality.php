<?php

namespace App\Services\FalAI;

/**
 * Downgrades a fal.ai model input to the cheapest resolution the model offers.
 *
 * Drafts exist so that iterating on a script, a composition or a bug does not
 * cost full-quality generations. Only resolution-shaped knobs are touched: the
 * model, prompt, duration and aspect ratio stay exactly as they were, so a draft
 * that reads well upgrades to a final by re-running the same generation without
 * the draft tier.
 */
class DraftQuality
{
    /**
     * Whether agent-queued generations default to the draft tier.
     */
    public static function enabled(): bool
    {
        return (bool) config('agent_video_templates.draft_generations.enabled', false);
    }

    /**
     * Apply the cheapest legal value of every configured ladder parameter.
     *
     * A ladder value is only applied when the model's own parsed schema exposes
     * the parameter as an enum that offers the value. A model whose schema we
     * never fetched (a catalog endpoint) exposes no parameters, so its input is
     * returned untouched rather than guessed at and rejected by fal.
     *
     * @param  array<string, mixed>  $input  The model input about to be POSTed.
     * @param  array<string, array<string, mixed>>  $parameters  The model's parsed parameter schema.
     * @param  array<string, array<int, string>>|null  $ladders  Parameter => values, cheapest first.
     * @return array<string, mixed>
     */
    public static function downgrade(array $input, array $parameters, ?array $ladders = null): array
    {
        $ladders ??= config('agent_video_templates.draft_generations.parameter_ladders', []);

        foreach ($ladders as $key => $values) {
            $options = $parameters[$key]['options'] ?? null;

            if (! is_array($options) || $options === []) {
                continue;
            }

            $cheapest = self::cheapestOption($values, array_keys($options));

            if ($cheapest !== null) {
                $input[$key] = $cheapest;
            }
        }

        return $input;
    }

    /**
     * The first ladder value the model actually offers, in the model's own spelling.
     *
     * fal endpoints are inconsistent about casing ("480p" vs "480P"), so the
     * match ignores it and the option key is returned verbatim.
     *
     * @param  array<int, string>  $ladder
     * @param  array<int, string|int>  $options
     */
    protected static function cheapestOption(array $ladder, array $options): ?string
    {
        foreach ($ladder as $value) {
            foreach ($options as $option) {
                if (strcasecmp((string) $option, $value) === 0) {
                    return (string) $option;
                }
            }
        }

        return null;
    }
}
