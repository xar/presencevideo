/**
 * The wire between the headless render page and the Node driver that owns it.
 *
 * The finished MP4 is handed back in base64 chunks through a Puppeteer binding
 * rather than through a Chrome download or a single `page.evaluate` return
 * value. A whole-blob return serialises tens of megabytes into one CDP JSON
 * message and holds it three times over (page, protocol, Node); a Chrome
 * download depends on a download-state machine that differs between Chrome
 * versions and headless modes. Chunking is bounded in memory, deterministic,
 * and costs only the ~33% base64 overhead over a local pipe -- negligible
 * beside the encode itself.
 *
 * These helpers are pure so the chunking maths is unit-tested rather than
 * discovered on a 200 MB render.
 */

/** Bytes read from the blob per binding call. */
export const CHUNK_BYTES = 4 * 1024 * 1024;

export type HeadlessRenderSummary = {
    frameCount: number;
    durationMs: number;
    hasAudio: boolean;
    warnings: string[];
    bytes: number;
};

export type HeadlessProgress = {
    phase: string;
    percent: number;
    frameIndex: number;
    totalFrames: number;
};

/**
 * Byte ranges covering `totalBytes`, each at most `chunkBytes` long.
 *
 * Returns an empty list for an empty blob rather than one zero-length range:
 * an empty chunk would make the driver create the output file and then declare
 * a zero-byte MP4 a success.
 */
export function chunkRanges(
    totalBytes: number,
    chunkBytes: number = CHUNK_BYTES,
): Array<{ start: number; end: number }> {
    if (!Number.isFinite(totalBytes) || totalBytes <= 0) {
        return [];
    }

    const size = Math.max(1, Math.floor(chunkBytes));
    const ranges: Array<{ start: number; end: number }> = [];

    for (let start = 0; start < totalBytes; start += size) {
        ranges.push({ start, end: Math.min(start + size, totalBytes) });
    }

    return ranges;
}

/**
 * Base64-encode bytes without spreading them into an argument list.
 *
 * `String.fromCharCode(...bytes)` overflows the call stack somewhere around a
 * hundred kilobytes, which is well under one chunk, so the conversion walks a
 * small window at a time.
 */
export function bytesToBase64(bytes: Uint8Array): string {
    const window = 0x8000;
    let binary = '';

    for (let offset = 0; offset < bytes.length; offset += window) {
        binary += String.fromCharCode(
            ...bytes.subarray(offset, offset + window),
        );
    }

    return btoa(binary);
}

/**
 * Read the project payload the controller embedded in the page.
 *
 * Throws rather than returning null: a render page with no payload is a
 * deployment fault, and failing loudly here is what stops the driver from
 * waiting out its whole timeout on a blank page.
 */
export function readEmbeddedPayload<T>(
    document: Document,
    elementId = 'headless-render-payload',
): T {
    const element = document.getElementById(elementId);

    if (!element || !element.textContent) {
        throw new Error(
            'The headless render page carries no project payload. The render route did not render as expected.',
        );
    }

    return JSON.parse(element.textContent) as T;
}
