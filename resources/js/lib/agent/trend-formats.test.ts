import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    TREND_CATEGORY_LABELS,
    TREND_FORMATS,
    featuredTrendFormats,
    formatDurationLabel,
    trendCategories,
    trendFormatsByCategory,
} from './trend-formats';

/**
 * The template keys the PHP config actually defines. Parsed from the config
 * rather than duplicated here: a renamed template must fail this test, which is
 * the whole point of pinning the two sides together.
 */
function configuredTemplateKeys(): string[] {
    const php = readFileSync(resolve(__dirname, '../../../../config/agent_video_templates.php'), 'utf8');
    const templates = php.slice(php.indexOf("'templates' => ["));

    return [...templates.matchAll(/^ {8}'([a-z_]+)' => \[$/gm)].map((match) => match[1]);
}

describe('trend formats', () => {
    it('parses the template keys out of the PHP config', () => {
        // Guards the regex above: a parse that silently found nothing would make
        // every templateKey assertion below vacuously pass.
        expect(configuredTemplateKeys().length).toBeGreaterThan(0);
    });

    it('only names templates that exist in agent_video_templates config', () => {
        const configured = configuredTemplateKeys();

        for (const format of TREND_FORMATS) {
            expect(configured, `${format.id} names an unknown template`).toContain(format.templateKey);
        }
    });

    it('has unique ids', () => {
        const ids = TREND_FORMATS.map((format) => format.id);

        expect(new Set(ids).size).toBe(ids.length);
    });

    it('gives every format a usable brief with a fill-in blank', () => {
        for (const format of TREND_FORMATS) {
            expect(format.prompt.length, `${format.id} prompt is too short`).toBeGreaterThan(80);
            expect(format.prompt, `${format.id} prompt has no [blank]`).toMatch(/\[[^\]]+\]/);
        }
    });

    it('describes every format with beats, platforms and a niche', () => {
        for (const format of TREND_FORMATS) {
            expect(format.beats.length, `${format.id} has too few beats`).toBeGreaterThanOrEqual(3);
            expect(format.platforms.length, `${format.id} names no platform`).toBeGreaterThan(0);
            expect(format.niches.length, `${format.id} names no niche`).toBeGreaterThan(0);
            expect(format.whyItWorks.length).toBeGreaterThan(0);
            expect(format.source).toMatch(/^https:\/\//);
        }
    });

    it('orders every duration range low to high', () => {
        for (const format of TREND_FORMATS) {
            const [min, max] = format.durationSeconds;

            expect(min, `${format.id} duration range is inverted`).toBeLessThanOrEqual(max);
            expect(min).toBeGreaterThan(0);
        }
    });

    it('labels durations as a range', () => {
        expect(formatDurationLabel({ ...TREND_FORMATS[0], durationSeconds: [15, 30] })).toBe('15-30s');
        expect(formatDurationLabel({ ...TREND_FORMATS[0], durationSeconds: [20, 20] })).toBe('20s');
    });

    it('features enough formats to fill the default grid', () => {
        expect(featuredTrendFormats().length).toBeGreaterThanOrEqual(4);
    });

    it('returns the featured set for the "all" category', () => {
        expect(trendFormatsByCategory('all')).toEqual(featuredTrendFormats());
    });

    it('only reports categories that have formats, and covers every format', () => {
        const categories = trendCategories();

        for (const category of categories) {
            expect(trendFormatsByCategory(category).length).toBeGreaterThan(0);
        }

        for (const format of TREND_FORMATS) {
            expect(categories).toContain(format.category);
            expect(TREND_CATEGORY_LABELS[format.category]).toBeTruthy();
        }
    });
});
