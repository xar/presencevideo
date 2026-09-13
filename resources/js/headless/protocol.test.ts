import { describe, expect, it } from 'vitest';
import {
    CHUNK_BYTES,
    bytesToBase64,
    chunkRanges,
    readEmbeddedPayload,
} from './protocol';

describe('chunkRanges', () => {
    it('covers the whole blob exactly once, with no gaps or overlaps', () => {
        const ranges = chunkRanges(10, 4);

        expect(ranges).toEqual([
            { start: 0, end: 4 },
            { start: 4, end: 8 },
            { start: 8, end: 10 },
        ]);
    });

    it('emits no range for an empty blob', () => {
        // An empty chunk would have the driver create the output file and then
        // call a zero-byte MP4 a successful render.
        expect(chunkRanges(0)).toEqual([]);
        expect(chunkRanges(Number.NaN)).toEqual([]);
        expect(chunkRanges(-1)).toEqual([]);
    });

    it('keeps every chunk within the bound so a long render cannot spike memory', () => {
        const total = 97 * 1024 * 1024;

        for (const range of chunkRanges(total)) {
            expect(range.end - range.start).toBeLessThanOrEqual(CHUNK_BYTES);
        }

        expect(chunkRanges(total).at(-1)?.end).toBe(total);
    });
});

describe('bytesToBase64', () => {
    it('round-trips bytes larger than the call-stack limit of a spread', () => {
        // String.fromCharCode(...bytes) overflows well under one chunk; the
        // windowed loop is the reason a 4 MB chunk does not crash the page.
        const bytes = new Uint8Array(300_000);
        for (let i = 0; i < bytes.length; i++) {
            bytes[i] = i % 256;
        }

        const decoded = Uint8Array.from(atob(bytesToBase64(bytes)), (c) =>
            c.charCodeAt(0),
        );

        expect(decoded).toEqual(bytes);
    });

    it('encodes an empty buffer to an empty string', () => {
        expect(bytesToBase64(new Uint8Array())).toBe('');
    });
});

describe('readEmbeddedPayload', () => {
    it('reads the project the controller embedded', () => {
        const element = document.createElement('script');
        element.type = 'application/json';
        element.id = 'headless-render-payload';
        element.textContent = JSON.stringify({ project: { id: 7 } });
        document.body.append(element);

        expect(
            readEmbeddedPayload<{ project: { id: number } }>(document),
        ).toEqual({
            project: { id: 7 },
        });

        element.remove();
    });

    it('throws rather than rendering a blank page for a whole timeout', () => {
        expect(() => readEmbeddedPayload(document)).toThrow(
            /no project payload/,
        );
    });
});
