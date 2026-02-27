<script lang="ts">
    import { onMount } from 'svelte';
    import { projectStore, timelineStore } from '@/lib/editor';
    import type { AudioClip, AudioTrack, Asset } from '@/types';

    let audioTracks = $derived(projectStore.project?.audio_tracks ?? []);
    let assets = $derived(projectStore.project?.assets ?? []);
    let currentTimeMs = $derived(timelineStore.currentTimeMs);
    let isPlaying = $derived(timelineStore.isPlaying);

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

    // Sync playback state
    function syncPlayback() {
        const allClips = getAllClips();

        for (const { track, clip } of allClips) {
            const audio = audioElements.get(clip.id);
            if (!audio) continue;

            const shouldPlay = isPlaying && !track.muted && isClipActiveAt(clip, currentTimeMs);
            const volume = track.muted ? 0 : clip.volume * track.volume;

            audio.volume = volume;

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
