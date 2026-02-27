<script lang="ts">
    import { Plus, Volume2, VolumeX } from 'lucide-svelte';
    import { Button } from '@/components/ui/button';
    import { projectStore, timelineStore, selectionStore } from '@/lib/editor';
    import type { AudioTrack as AudioTrackType, AudioClip as AudioClipType } from '@/types';
    import AudioClip from './AudioClip.svelte';

    let audioTracks = $derived(projectStore.project?.audio_tracks ?? []);
    let assets = $derived(projectStore.project?.assets ?? []);
    let totalDuration = $derived(timelineStore.getTotalDuration());
    let pixelsPerMs = $derived(timelineStore.pixelsPerMs);
    let dragOverTrackId = $state<string | null>(null);

    function addTrack() {
        projectStore.addAudioTrack();
    }

    function toggleMute(track: AudioTrackType) {
        projectStore.updateAudioTrack(track.id, { muted: !track.muted });
    }

    function handleClipClick(trackId: string, clip: AudioClipType) {
        selectionStore.selectAudioClip(trackId, clip.id);
    }

    function handleClipUpdate(trackId: string, clipId: string, updates: Partial<AudioClipType>) {
        projectStore.updateAudioClip(trackId, clipId, updates);
    }

    function handleDragOver(e: DragEvent, trackId: string) {
        e.preventDefault();
        if (e.dataTransfer?.types.includes('application/json')) {
            e.dataTransfer.dropEffect = 'copy';
            dragOverTrackId = trackId;
        }
    }

    function handleDragLeave(e: DragEvent) {
        dragOverTrackId = null;
    }

    function handleDrop(e: DragEvent, track: AudioTrackType) {
        e.preventDefault();
        dragOverTrackId = null;

        if (!e.dataTransfer) return;

        const data = e.dataTransfer.getData('application/json');
        if (!data) return;

        try {
            const parsed = JSON.parse(data);
            if (parsed.type !== 'asset' || parsed.assetType !== 'audio') return;

            // Find the asset to get duration
            const asset = assets.find(a => a.id === parsed.assetId);

            // Calculate drop position in milliseconds
            const trackRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const dropX = e.clientX - trackRect.left;
            const startMs = Math.max(0, Math.round(dropX / pixelsPerMs));

            const clip = projectStore.addAudioClip(track.id, {
                asset_id: parsed.assetId,
                start_ms: startMs,
                duration_ms: asset?.duration_ms ?? 5000,
                volume: 1.0,
            });

            selectionStore.selectAudioClip(track.id, clip.id);
        } catch (err) {
            console.error('Failed to add audio clip:', err);
        }
    }
</script>

<div class="flex flex-col border-t bg-muted/20">
    {#each audioTracks as track (track.id)}
        <div class="flex h-12 border-b">
            <div class="flex w-32 items-center gap-2 border-r bg-background px-2">
                <Button
                    variant="ghost"
                    size="icon"
                    class="h-6 w-6"
                    onclick={() => toggleMute(track)}
                >
                    {#if track.muted}
                        <VolumeX class="h-3 w-3" />
                    {:else}
                        <Volume2 class="h-3 w-3" />
                    {/if}
                </Button>
                <span class="text-xs truncate flex-1">{track.name}</span>
            </div>

            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
                class="relative flex-1 overflow-hidden transition-colors {dragOverTrackId === track.id ? 'bg-primary/10 ring-2 ring-inset ring-primary' : ''}"
                ondragover={(e) => handleDragOver(e, track.id)}
                ondragleave={handleDragLeave}
                ondrop={(e) => handleDrop(e, track)}
            >
                <div
                    class="absolute inset-0"
                    style:width="{totalDuration * pixelsPerMs}px"
                >
                    {#each track.clips as clip (clip.id)}
                        <AudioClip
                            {clip}
                            {pixelsPerMs}
                            isSelected={selectionStore.selection.audioClipId === clip.id}
                            onclick={() => handleClipClick(track.id, clip)}
                            onUpdate={(updates) => handleClipUpdate(track.id, clip.id, updates)}
                        />
                    {/each}
                </div>
            </div>
        </div>
    {/each}

    <div class="flex h-8 items-center px-2">
        <Button variant="ghost" size="sm" class="h-6 text-xs" onclick={addTrack}>
            <Plus class="mr-1 h-3 w-3" />
            Add Audio Track
        </Button>
    </div>
</div>
