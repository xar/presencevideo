<script lang="ts">
    import { Plus, Volume2, VolumeX, Trash2, ArrowUp, ArrowDown, Scissors, Copy } from 'lucide-svelte';
    import { Button } from '@/components/ui/button';
    import { projectStore, timelineStore, selectionStore } from '@/lib/editor';
    import { cn } from '@/lib/utils';
    import type { AudioTrack as AudioTrackType, AudioClip as AudioClipType } from '@/types';
    import AudioClip from './AudioClip.svelte';
    import ContextMenu from './ContextMenu.svelte';
import type {ContextMenuItem} from './ContextMenu.svelte';
    import TimelinePlayhead from './TimelinePlayhead.svelte';

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

    // --- Selection & context menu -------------------------------------------
    let selectedTrackId = $derived(
        selectionStore.selection.type === 'audio_track' ? selectionStore.selection.audioTrackId : null,
    );

    let menu = $state<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);

    function trackMenuItems(track: AudioTrackType, index: number): ContextMenuItem[] {
        return [
            { label: track.muted ? 'Unmute track' : 'Mute track', icon: track.muted ? Volume2 : VolumeX, onSelect: () => toggleMute(track) },
            { label: 'Move up', icon: ArrowUp, disabled: index === 0, separator: true, onSelect: () => projectStore.moveAudioTrack(track.id, -1) },
            { label: 'Move down', icon: ArrowDown, disabled: index === audioTracks.length - 1, onSelect: () => projectStore.moveAudioTrack(track.id, 1) },
            { label: 'Delete track', icon: Trash2, destructive: true, separator: true, onSelect: () => { selectionStore.selectAudioTrack(track.id); selectionStore.deleteSelected(); } },
        ];
    }

    function clipMenuItems(trackId: string, clip: AudioClipType): ContextMenuItem[] {
        const playhead = timelineStore.currentTimeMs;
        const canSplit = playhead > clip.start_ms && playhead < clip.start_ms + clip.duration_ms;
        const select = () => selectionStore.selectAudioClip(trackId, clip.id);
        return [
            { label: 'Split at playhead', icon: Scissors, disabled: !canSplit, onSelect: () => { select(); selectionStore.splitSelectedAtPlayhead(); } },
            { label: 'Duplicate', icon: Copy, onSelect: () => { select(); selectionStore.duplicateSelected(); } },
            { label: 'Delete clip', icon: Trash2, destructive: true, separator: true, onSelect: () => { select(); selectionStore.deleteSelected(); } },
        ];
    }

    function openMenu(e: MouseEvent, track: AudioTrackType, index: number) {
        e.preventDefault();
        e.stopPropagation();

        const clipEl = (e.target as Element | null)?.closest<HTMLElement>('[data-clip-id]');
        const clip = clipEl ? track.clips.find((c) => c.id === clipEl.dataset.clipId) : undefined;

        if (clip) {
            selectionStore.selectAudioClip(track.id, clip.id);
            menu = { x: e.clientX, y: e.clientY, items: clipMenuItems(track.id, clip) };
        } else {
            selectionStore.selectAudioTrack(track.id);
            menu = { x: e.clientX, y: e.clientY, items: trackMenuItems(track, index) };
        }
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

    function handleDragLeave() {
        dragOverTrackId = null;
    }

    let isScrubbing = $state(false);

    function seekFromMouse(e: MouseEvent) {
        if (!totalDuration) return;

        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const x = Math.max(0, Math.min(e.clientX - rect.left, totalDuration * pixelsPerMs));
        timelineStore.setCurrentTime(x / pixelsPerMs);
    }

    // Scrub only for gestures starting on empty track space — clip drags and
    // trims passing over the track must not seek
    function handleTimelineMouseDown(e: MouseEvent) {
        if (e.target !== e.currentTarget) return;

        isScrubbing = true;
        seekFromMouse(e);
        window.addEventListener('mouseup', endScrub);
    }

    function handleTimelineMouseMove(e: MouseEvent) {
        if (isScrubbing && e.buttons === 1) {
            seekFromMouse(e);
        }
    }

    function endScrub() {
        isScrubbing = false;
        window.removeEventListener('mouseup', endScrub);
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
    {#each audioTracks as track, index (track.id)}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
            class={cn('flex h-12 border-b transition-colors', selectedTrackId === track.id && 'bg-primary/5')}
            oncontextmenu={(e) => openMenu(e, track, index)}
        >
            <div
                class={cn(
                    'flex w-32 cursor-pointer items-center gap-2 border-r bg-background px-2',
                    selectedTrackId === track.id && 'bg-primary/10 shadow-[inset_2px_0_0_0_hsl(var(--primary))]',
                )}
                role="button"
                tabindex="0"
                onclick={() => selectionStore.selectAudioTrack(track.id)}
                onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && selectionStore.selectAudioTrack(track.id)}
            >
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
                    class="absolute inset-0 cursor-pointer"
                    style:width="{totalDuration * pixelsPerMs}px"
                    onmousedown={handleTimelineMouseDown}
                    onmousemove={handleTimelineMouseMove}
                >
                    <TimelinePlayhead />
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

<ContextMenu position={menu} items={menu?.items ?? []} onClose={() => (menu = null)} />
