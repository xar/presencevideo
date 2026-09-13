import { describe, expect, it } from 'vitest';
import {
    browserExportPercent,
    browserExportPhaseLabel,
    decideExportPath,
} from '../export-path';
import type { LocalExportProgress } from '../local-export';

const supported = { supported: true, reason: null };

function progress(partial: Partial<LocalExportProgress>): LocalExportProgress {
    return {
        phase: 'video',
        frameIndex: 0,
        totalFrames: 0,
        percent: 0,
        ...partial,
    };
}

describe('decideExportPath', () => {
    it('defaults to the browser when the flag is on and the browser can encode', () => {
        const choice = decideExportPath({
            featureEnabled: true,
            support: supported,
        });

        expect(choice.defaultPath).toBe('browser');
        expect(choice.browserAvailable).toBe(true);
        expect(choice.browserUnavailableReason).toBeNull();
        expect(choice.canChoose).toBe(true);
    });

    it('falls back to the server when the feature flag is off', () => {
        const choice = decideExportPath({
            featureEnabled: false,
            support: supported,
        });

        expect(choice.defaultPath).toBe('server');
        expect(choice.browserAvailable).toBe(false);
        expect(choice.canChoose).toBe(false);
        expect(choice.browserUnavailableReason).toMatch(/turned off/i);
    });

    it('falls back to the server and repeats the capability reason verbatim', () => {
        const choice = decideExportPath({
            featureEnabled: true,
            support: { supported: false, reason: 'No WebCodecs here.' },
        });

        expect(choice.defaultPath).toBe('server');
        expect(choice.browserAvailable).toBe(false);
        expect(choice.browserUnavailableReason).toBe('No WebCodecs here.');
    });

    it('still explains itself when support reports no reason', () => {
        const choice = decideExportPath({
            featureEnabled: true,
            support: { supported: false, reason: null },
        });

        expect(choice.defaultPath).toBe('server');
        expect(choice.browserUnavailableReason).toBeTruthy();
    });

    it('never offers the browser path as a choice when it is unavailable', () => {
        for (const featureEnabled of [true, false]) {
            for (const isSupported of [true, false]) {
                const choice = decideExportPath({
                    featureEnabled,
                    support: { supported: isSupported, reason: null },
                });

                expect(choice.canChoose).toBe(choice.browserAvailable);
                expect(choice.defaultPath).toBe(
                    choice.browserAvailable ? 'browser' : 'server',
                );
            }
        }
    });
});

describe('browserExportPhaseLabel', () => {
    it('names each phase', () => {
        expect(browserExportPhaseLabel(null)).toMatch(/preparing/i);
        expect(browserExportPhaseLabel(progress({ phase: 'audio' }))).toMatch(
            /audio/i,
        );
        expect(
            browserExportPhaseLabel(progress({ phase: 'finalizing' })),
        ).toMatch(/finaliz/i);
    });

    it('counts frames while rendering video', () => {
        expect(
            browserExportPhaseLabel(
                progress({ phase: 'video', frameIndex: 12, totalFrames: 300 }),
            ),
        ).toBe('Rendering frame 12 of 300');
    });

    it('does not print a divide-by-zero frame count', () => {
        expect(
            browserExportPhaseLabel(
                progress({ phase: 'video', totalFrames: 0 }),
            ),
        ).toBe('Rendering frames...');
    });
});

describe('browserExportPercent', () => {
    it('clamps and rounds', () => {
        expect(browserExportPercent(null)).toBe(0);
        expect(browserExportPercent(progress({ percent: 41.6 }))).toBe(42);
        expect(browserExportPercent(progress({ percent: -5 }))).toBe(0);
        expect(browserExportPercent(progress({ percent: 140 }))).toBe(100);
    });
});
