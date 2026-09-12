<script lang="ts">
    import { onMount, untrack } from 'svelte';
    import { projectStore, timelineStore } from '@/lib/editor';
    import { createAudioEngine, planPreviewAudio } from '@/lib/editor/audio-engine';

    /**
     * Wiring between the editor stores and the Web Audio master clock.
     *
     * Everything that used to live here — an `HTMLAudioElement` per clip, a
     * 200ms drift seek, a per-frame `volume` write for fades, and a quarter-step
     * nudge of the rAF clock back toward whichever element happened to be
     * playing — is gone. `audio-engine.ts` owns one `AudioContext`, schedules
     * every source ahead of the playhead and hands back the audible position;
     * this component only tells it what the project contains and what the
     * transport is doing, then registers it as the timeline's clock source.
     *
     * Scene video-layer audio, silent in the preview since the canvas
     * compositor replaced the per-layer `<video>` elements, is part of the
     * engine's plan and audible again. Overlay video clips (`video_tracks`)
     * remain silent — as they always were — because the server render does not
     * mix them either (`FFmpegService::buildAudioMixFilter` covers audio tracks,
     * `buildSceneAudioFilter` covers scene video layers, and nothing covers
     * overlay clips). Preview and render therefore agree.
     */

    /**
     * How far the timeline may diverge from the audio clock before it counts as
     * a seek rather than as normal following. Comfortably above a frame at any
     * supported rate, so ordinary playback never re-anchors.
     */
    const SEEK_THRESHOLD_MS = 120;

    const engine = createAudioEngine();

    let project = $derived(projectStore.project);
    let currentTimeMs = $derived(timelineStore.currentTimeMs);
    let isPlaying = $derived(timelineStore.isPlaying);
    let playbackRate = $derived(timelineStore.playbackRate);

    // The plan is a pure function of the project, so any edit to a clip, a
    // layer's volume, a track's mute or a scene's duration rebuilds it and the
    // engine re-schedules in place.
    $effect(() => {
        engine.setPlan(planPreviewAudio(project));
    });

    $effect(() => {
        if (isPlaying) {
            void engine.play(untrack(() => currentTimeMs));
        } else {
            engine.pause();
        }
    });

    $effect(() => {
        engine.setPlaybackRate(playbackRate);
    });

    // Seek detection. While playing, the timeline FOLLOWS the engine, so the
    // two only diverge when something else moved the playhead (scrub, keyboard,
    // scene jump) — which is exactly the signal to re-anchor the audio.
    $effect(() => {
        const timelineMs = currentTimeMs;
        const engineMs = untrack(() => engine.currentTimeMs());

        if (engineMs === null || Math.abs(timelineMs - engineMs) > SEEK_THRESHOLD_MS) {
            engine.seek(timelineMs);
        }
    });

    onMount(() => {
        // Null while there is no audio, no context, or a context the autoplay
        // policy left suspended; the timeline then keeps its own rAF clock.
        timelineStore.setClockSource(() => engine.currentTimeMs());

        return () => {
            timelineStore.setClockSource(null);
            engine.dispose();
        };
    });
</script>

<!-- No visual output: this component only drives the audio engine. -->
