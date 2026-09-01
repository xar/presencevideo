<script lang="ts">
    import { onMount } from 'svelte';
    import { projectStore, timelineStore } from '@/lib/editor';
    import type { AudioClip, AudioTrack, Asset } from '@/types';

    let audioTracks = $derived(projectStore.project?.audio_tracks ?? []);
    let assets = $derived(projectStore.project?.assets ?? []);
    let currentTimeMs = $derived(timelineStore.currentTimeMs);
    let isPlaying = $derived(timelineStore.isPlaying);
    let playbackRate = $derived(timelineStore.playbackRate);

    // Store audio elements outside of reactive state to avoid loops
    const audioElements = new Map<string, HTMLAudioElement>();
    let lastSyncTime = 0;

    // Get asset URL for an audio clip
    function getAssetUrl(assetId: number): string | null {
        const asset = assets.find((a) => a.id === assetId);
        return asset?.url ?? null;
    }

    // Get all clips with their track info
    function getAllClips(): Array<{ track: AudioTrack; clip: AudioClip }> {
        const result: Array<{ track: AudioTrack; clip: AudioClip }> = [];
        for (const track of audioTracks) {
            for (const clip of track.clips) {
                result.push({ track, clip });
            }
        }
        return result;
    }

    // Check if a clip should be playing at a given time
    function isClipActiveAt(clip: AudioClip, timeMs: number): boolean {
        const clipEnd = clip.start_ms + clip.duration_ms;
        return timeMs >= clip.start_ms && timeMs < clipEnd;
    }

    // Ensure audio elements exist for all clips
    function ensureAudioElements() {
        const allClips = getAllClips();
        const neededIds = new Set(allClips.map((c) => c.clip.id));

        // Remove stale elements
        for (const [clipId, audio] of audioElements) {
            if (!neededIds.has(clipId)) {
                audio.pause();
                audio.src = '';
                audioElements.delete(clipId);
            }
        }

        // Create missing elements
        for (const { clip } of allClips) {
            if (!audioElements.has(clip.id)) {
                const url = getAssetUrl(clip.asset_id);
                if (url) {
                    const audio = new Audio(url);
                    audio.preload = 'auto';
                    audioElements.set(clip.id, audio);
                }
            }
        }
    }

    function finiteNumber(value: unknown, fallback: number): number {
        const number = Number(value);

        return Number.isFinite(number) ? number : fallback;
    }

    function mediaVolume(...values: unknown[]): number {
        const volume = values.reduce<number>(
            (total, value) => total * finiteNumber(value, 1),
            1,
        );

        return Math.min(1, Math.max(0, volume));
    }

    /**
     * Linear fade envelope for a clip at an absolute timeline position.
     * Returns a 0..1 multiplier applied on top of the clip and track volume.
     */
    function fadeMultiplier(clip: AudioClip, timeMs: number): number {
        const fadeIn = Math.max(0, finiteNumber(clip.fade_in_ms, 0));
        const fadeOut = Math.max(0, finiteNumber(clip.fade_out_ms, 0));
        if (fadeIn === 0 && fadeOut === 0) return 1;

        const elapsed = timeMs - clip.start_ms;
        const remaining = clip.start_ms + clip.duration_ms - timeMs;

        let multiplier = 1;
        if (fadeIn > 0) {
            multiplier = Math.min(multiplier, elapsed / fadeIn);
        }
        if (fadeOut > 0) {
            multiplier = Math.min(multiplier, remaining / fadeOut);
        }

        return Math.min(1, Math.max(0, multiplier));
    }

    // Sync playback state
    function syncPlayback() {
        const allClips = getAllClips();
        let anchored = false;

        for (const { track, clip } of allClips) {
            const audio = audioElements.get(clip.id);
            if (!audio) continue;

            const shouldPlay = isPlaying && !track.muted && isClipActiveAt(clip, currentTimeMs);
            const volume = track.muted
                ? 0
                : mediaVolume(clip.volume, track.volume, fadeMultiplier(clip, currentTimeMs));

            audio.volume = volume;

            if (audio.playbackRate !== playbackRate) {
                audio.playbackRate = playbackRate;
            }

            if (shouldPlay) {
                // Calculate position within clip
                const clipTime = currentTimeMs - clip.start_ms;
                const trimStart = clip.trim_start_ms ?? 0;
                const targetTime = (clipTime + trimStart) / 1000;

                // Only seek if significantly out of sync (>200ms)
                if (Math.abs(audio.currentTime - targetTime) > 0.2) {
                    audio.currentTime = targetTime;
                }

                if (audio.paused) {
                    audio.play().catch(() => {});
                }

                // Re-anchor the timeline clock to the first actively playing
                // audio element to reduce drift. Only nudge for small, plausible
                // deviations (40-200ms); larger gaps are handled by seeking audio.
                // Skipped at non-1x rates: the implied-position math assumes the
                // element and clock advance at the same speed as wall time.
                if (!anchored && isPlaying && playbackRate === 1 && !audio.paused) {
                    const impliedMs = clip.start_ms + (audio.currentTime * 1000 - trimStart);
                    const driftMs = impliedMs - currentTimeMs;
                    if (Number.isFinite(impliedMs) && Math.abs(driftMs) > 40 && Math.abs(driftMs) < 200) {
                        timelineStore.syncToClock(impliedMs);
                        anchored = true;
                    }
                }
            } else {
                if (!audio.paused) {
                    audio.pause();
                }
            }
        }
    }

    // Handle seek (when time jumps significantly)
    function handleSeek() {
        const timeDiff = Math.abs(currentTimeMs - lastSyncTime);
        if (timeDiff > 100) {
            // Force resync on seek
            for (const { track, clip } of getAllClips()) {
                const audio = audioElements.get(clip.id);
                if (!audio) continue;

                if (isClipActiveAt(clip, currentTimeMs)) {
                    const clipTime = currentTimeMs - clip.start_ms;
                    const trimStart = clip.trim_start_ms ?? 0;
                    audio.currentTime = (clipTime + trimStart) / 1000;
                }
            }
        }
        lastSyncTime = currentTimeMs;
    }

    // Effect for managing audio elements when tracks change
    $effect(() => {
        // Read dependencies
        const _ = audioTracks;
        const __ = assets;

        // Update elements (doesn't write to state)
        ensureAudioElements();
    });

    // Effect for playback sync
    $effect(() => {
        // Read dependencies
        const _ = isPlaying;
        const __ = currentTimeMs;
        const ___ = audioTracks;

        handleSeek();
        syncPlayback();
    });

    // Cleanup on unmount
    onMount(() => {
        return () => {
            for (const [, audio] of audioElements) {
                audio.pause();
                audio.src = '';
            }
            audioElements.clear();
        };
    });
</script>

<!-- This component has no visual output - it just manages audio playback -->
