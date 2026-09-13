import { exportProjectVideo } from '@/lib/editor/local-export';
import { normalizeProject } from '@/lib/editor/normalize';
import type { Project } from '@/types/editor';
import {
    CHUNK_BYTES,
    bytesToBase64,
    chunkRanges,
    readEmbeddedPayload,
} from './protocol';
import type { HeadlessProgress, HeadlessRenderSummary } from './protocol';

/**
 * The server-side compositor.
 *
 * There is deliberately no rendering code in this file. The server render is
 * the browser export -- `exportProjectVideo()`, which is `resolveFrame()` plus
 * `drawFrame()` plus `planProjectAudio()` -- driven by Puppeteer instead of by
 * a click, so a server render and a browser export cannot disagree about a
 * pixel or a decibel. Everything here is transport: read the payload, run the
 * export, hand the bytes back.
 *
 * The driver calls `window.__headlessRender()` and awaits it. Progress and the
 * MP4 bytes travel the other way through bindings Puppeteer installed before
 * navigation.
 */

type HeadlessPayload = {
    project: Project;
};

declare global {
    interface Window {
        /** Installed by this module; called by the Node driver. */
        __headlessRender?: () => Promise<HeadlessRenderSummary>;
        /** Installed by the Node driver before navigation. */
        __headlessProgress?: (progress: HeadlessProgress) => Promise<void>;
        __headlessChunk?: (base64: string) => Promise<void>;
    }
}

async function runHeadlessRender(): Promise<HeadlessRenderSummary> {
    const payload = readEmbeddedPayload<HeadlessPayload>(document);
    const project = normalizeProject(payload.project);

    const result = await exportProjectVideo(project, {
        onProgress: (progress) => {
            // Fire-and-forget: awaiting the binding inside the frame loop would
            // add a protocol round trip to every single frame.
            void window.__headlessProgress?.({
                phase: progress.phase,
                percent: progress.percent,
                frameIndex: progress.frameIndex,
                totalFrames: progress.totalFrames,
            });
        },
    });

    await sendBlob(result.blob);

    return {
        frameCount: result.frameCount,
        durationMs: result.durationMs,
        hasAudio: result.hasAudio,
        warnings: result.warnings,
        bytes: result.blob.size,
    };
}

/**
 * Stream the finished MP4 to the driver one bounded chunk at a time.
 *
 * Each call is awaited so Node has written the chunk before the next is
 * encoded: the binding is the backpressure, and without it a long render
 * queues the entire file in the protocol layer.
 */
async function sendBlob(blob: Blob): Promise<void> {
    const send = window.__headlessChunk;

    if (!send) {
        throw new Error(
            'The headless render driver installed no output binding, so there is nowhere to put the finished video.',
        );
    }

    for (const range of chunkRanges(blob.size, CHUNK_BYTES)) {
        const bytes = new Uint8Array(
            await blob.slice(range.start, range.end).arrayBuffer(),
        );

        await send(bytesToBase64(bytes));
    }
}

window.__headlessRender = runHeadlessRender;
