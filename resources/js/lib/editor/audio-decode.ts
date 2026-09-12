import type { MediaProvider } from './media-provider';

/**
 * Decoding source audio into a buffer, shared by the preview engine and the
 * browser export.
 *
 * Both need exactly the same thing — a contiguous buffer for one source range —
 * and they used to carry private copies of it. Copies drift, and a drift here
 * would mean the preview and the export disagree about what a clip sounds like,
 * which is the class of bug the single-compositor work exists to remove.
 */

/**
 * The slice of an audio context this module needs.
 *
 * Structural rather than concrete so a realtime `AudioContext` and an
 * `OfflineAudioContext` both satisfy it, and so tests can pass a double.
 */
export type AudioDecodeContext = {
    createBuffer(
        numberOfChannels: number,
        length: number,
        sampleRate: number,
    ): AudioBuffer;
};

/**
 * Decode one source range into a single contiguous buffer.
 *
 * mediabunny hands back a stream of chunks carrying their own timestamps; they
 * are written at their real offsets so a gap in the source stays a gap rather
 * than pulling everything after it earlier.
 *
 * The caller owns `provider` and its lifetime: the preview holds providers
 * across many decodes, while the export acquires and releases per item.
 * Returns null — never throws — when the asset has no audio or cannot be
 * decoded, so one broken asset costs its own sound and nothing more.
 */
export async function decodeSourceRange(
    provider: MediaProvider,
    context: AudioDecodeContext,
    startSec: number,
    endSec: number,
): Promise<AudioBuffer | null> {
    try {
        const readiness = await provider.ready();

        if (!readiness.hasAudio) {
            return null;
        }

        // Source timestamps are not guaranteed to start at zero, so every
        // offset is taken against the track's own first timestamp.
        const from = readiness.firstTimestampSec + Math.max(0, startSec);
        const to = Math.max(
            from,
            readiness.firstTimestampSec + Math.max(0, endSec),
        );

        const chunks: { buffer: AudioBuffer; offsetSec: number }[] = [];
        let channels = 0;
        let sampleRate = 0;

        for await (const wrapped of provider.getAudioBuffers(from, to)) {
            chunks.push({
                buffer: wrapped.buffer,
                offsetSec: Math.max(0, wrapped.timestamp - from),
            });
            channels = Math.max(channels, wrapped.buffer.numberOfChannels);
            sampleRate = Math.max(sampleRate, wrapped.buffer.sampleRate);
        }

        if (chunks.length === 0 || channels === 0) {
            return null;
        }

        const frames = Math.max(1, Math.ceil((to - from) * sampleRate));
        const target = context.createBuffer(channels, frames, sampleRate);

        for (const chunk of chunks) {
            const offset = Math.round(chunk.offsetSec * sampleRate);

            for (let channel = 0; channel < channels; channel++) {
                // Mono sources feed every output channel, matching how the
                // render upmixes before the sum.
                const sourceChannel = Math.min(
                    channel,
                    chunk.buffer.numberOfChannels - 1,
                );
                const data = chunk.buffer.getChannelData(sourceChannel);
                const writable = Math.min(data.length, frames - offset);

                if (writable > 0) {
                    target.copyToChannel(
                        data.subarray(0, writable),
                        channel,
                        offset,
                    );
                }
            }
        }

        return target;
    } catch {
        return null;
    }
}
