import { describe, expect, it } from 'vitest';
import {
    PLAYING_DRIFT_TOLERANCE_SEC,
    SEEK_COOLDOWN_MS,
    shouldCorrectVideoDrift,
} from '../clip-effects';

const base = { playing: true, speed: 1, lastSeekAtMs: 0, nowMs: 100_000 };

describe('shouldCorrectVideoDrift', () => {
    it('tolerates normal browser drift while playing', () => {
        expect(shouldCorrectVideoDrift({ ...base, driftSec: 0.1 })).toBe(false);
        expect(shouldCorrectVideoDrift({ ...base, driftSec: PLAYING_DRIFT_TOLERANCE_SEC })).toBe(false);
    });

    it('corrects real drift while playing', () => {
        expect(shouldCorrectVideoDrift({ ...base, driftSec: 0.5 })).toBe(true);
    });

    it('scales the tolerance with playback speed', () => {
        expect(shouldCorrectVideoDrift({ ...base, driftSec: 0.4, speed: 2 })).toBe(false);
        expect(shouldCorrectVideoDrift({ ...base, driftSec: 0.6, speed: 2 })).toBe(true);
    });

    it('rate-limits corrective seeks so one slow seek cannot trigger the next', () => {
        const justSeeked = { ...base, driftSec: 1, lastSeekAtMs: 100_000 - SEEK_COOLDOWN_MS + 1 };
        expect(shouldCorrectVideoDrift(justSeeked)).toBe(false);
        expect(shouldCorrectVideoDrift({ ...justSeeked, lastSeekAtMs: 100_000 - SEEK_COOLDOWN_MS })).toBe(true);
    });

    it('is exact while paused, ignoring the cooldown', () => {
        expect(shouldCorrectVideoDrift({ ...base, playing: false, driftSec: 0.02, lastSeekAtMs: 99_999 })).toBe(true);
        expect(shouldCorrectVideoDrift({ ...base, playing: false, driftSec: 0.005 })).toBe(false);
    });
});
