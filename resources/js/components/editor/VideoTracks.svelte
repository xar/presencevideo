<script lang="ts">
    import { Plus, Eye, EyeOff } from 'lucide-svelte';
    import { Button } from '@/components/ui/button';
    import { projectStore, timelineStore, selectionStore } from '@/lib/editor';
    import type { VideoTrack as VideoTrackType, VideoClip as VideoClipType, Asset } from '@/types';
    import VideoClip from './VideoClip.svelte';

    let videoTracks = $derived(projectStore.project?.video_tracks ?? []);
    let totalDuration = $derived(timelineStore.getTotalDuration());
    let pixelsPerMs = $derived(timelineStore.pixelsPerMs);
    let assets = $derived(projectStore.project?.assets ?? []);

    function addTrack() {
        projectStore.addVideoTrack();
    }

    function toggleVisibility(track: VideoTrackType) {
        projectStore.updateVideoTrack(track.id, { visible: !(track.visible ?? true) });
    }

    function handleClipClick(trackId: string, clip: VideoClipType) {
        selectionStore.selectVideoClip(trackId, clip.id);
    }

    function handleClipUpdate(trackId: string, clipId: string, updates: Partial<VideoClipType>) {
        projectStore.updateVideoClip(trackId, clipId, updates);
    }

    function handleDragOver(e: DragEvent) {
        e.preventDefault();
        if (e.dataTransfer) {
            e.dataTransfer.dropEffect = 'copy';
        }
    }

    function handleDrop(trackId: string, e: DragEvent) {
        e.preventDefault();

        if (!e.dataTransfer) return;

        const data = e.dataTransfer.getData('application/json');
        if (!data) return;

        try {
            const parsed = JSON.parse(data);
            if (parsed.type !== 'asset' || parsed.assetType !== 'video') return;

            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const dropX = e.clientX - rect.left;
            const startMs = Math.max(0, Math.round(dropX / pixelsPerMs));

            const project = projectStore.project;
            if (!project) return;

            const asset = assets.find((a: Asset) => a.id === parsed.assetId);
            const assetDuration = asset?.duration_ms ?? 5000;

            // Default PIP size: 25% of canvas
            const width = Math.round(project.resolution_width * 0.25);
            const height = Math.round(project.resolution_height * 0.25);

            // Default position: bottom-right corner with padding
            const x = project.resolution_width - width - 32;
            const y = project.resolution_height - height - 32;

            const clip = projectStore.addVideoClip(trackId, {
                asset_id: parsed.assetId,
                start_ms: startMs,
                duration_ms: assetDuration,
                x,
                y,
                width,
                height,
            });

            selectionStore.selectVideoClip(trackId, clip.id);
        } catch (err) {
            console.error('Failed to handle video track drop:', err);
        }
    }
</script>

<div class="flex flex-col border-t bg-muted/20">
    {#each videoTracks as track (track.id)}
        <div class="flex h-12 border-b">
            <div class="flex w-32 items-center gap-2 border-r bg-background px-2">
                <Button
                    variant="ghost"
                    size="icon"
                    class="h-6 w-6"
                    onclick={() => toggleVisibility(track)}
                >
                    {#if track.visible ?? true}
                        <Eye class="h-3 w-3" />
                    {:else}
                        <EyeOff class="h-3 w-3" />
                    {/if}
                </Button>
                <span class="text-xs truncate flex-1">{track.name}</span>
            </div>

            <div
                class="relative flex-1 overflow-hidden"
                ondragover={handleDragOver}
                ondrop={(e) => handleDrop(track.id, e)}
            >
                <div
                    class="absolute inset-0"
                    style:width="{totalDuration * pixelsPerMs}px"
                >
                    {#each track.clips as clip (clip.id)}
                        <VideoClip
                            {clip}
                            {pixelsPerMs}
                            isSelected={selectionStore.selection.videoClipId === clip.id}
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
            Add Video Track
        </Button>
    </div>
</div>
