import { describe, expect, it } from 'vitest';
import type { Project } from '@/types/editor';
import { resolveFrame } from '../model/resolve-frame';
import { buildTimeline } from '../model/timeline';
import { normalizeProject } from '../normalize';
import raw from './__real-project1.json';

/** Real project 1 pulled from the dev database, to catch shim gaps fixtures miss. */
const project = normalizeProject(structuredClone(raw) as unknown as Project);

describe('real project 1', () => {
    it('builds a timeline with every element placed', () => {
        const timeline = buildTimeline(project);
        expect(timeline.durationMs).toBeGreaterThan(0);
        expect(timeline.elements.length).toBeGreaterThan(0);
        console.log('duration', timeline.durationMs, 'elements', timeline.elements.length);
    });

    it('resolves a non-empty frame at the playhead in the screenshot (1.35s)', () => {
        const frame = resolveFrame(project, 1350);
        console.log(
            'at 1350ms ->',
            JSON.stringify(
                frame.primary.elements.map((e) => ({
                    kind: e.kind,
                    z: e.zIndex,
                    url: 'url' in e ? e.url : null,
                    src: 'sourceTimeSec' in e ? e.sourceTimeSec : null,
                    box: [e.x, e.y, e.width, e.height],
                    op: e.opacity,
                })),
                null,
                1,
            ),
        );
        expect(frame.primary.elements.length).toBeGreaterThan(0);
    });

    it('resolves a non-empty frame in every scene', () => {
        for (const t of [0, 1350, 2500, 6000, 9000, 11000, 13000]) {
            const frame = resolveFrame(project, t);
            expect(frame.primary.elements.length, `t=${t}`).toBeGreaterThan(0);
        }
    });

    it('gives every media element a resolvable url', () => {
        const frame = resolveFrame(project, 1350);
        for (const element of frame.primary.elements) {
            if (element.kind === 'video' || element.kind === 'image') {
                expect(element.url, `${element.kind} ${element.id}`).toBeTruthy();
            }
        }
    });
});

describe('real project 1 lint', () => {
    it('lints without throwing under every profile', async () => {
        const { lintProject } = await import('../model/lint');
        for (const profile of ['tiktok', 'reels', 'shorts', 'generic'] as const) {
            const report = lintProject(project, { profile });
            expect(report.score).toBeGreaterThanOrEqual(0);
            expect(report.score).toBeLessThanOrEqual(100);
        }
    });
});
