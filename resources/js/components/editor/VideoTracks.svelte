<script lang="ts">
    import { Plus, Eye, EyeOff, Type, Shapes, Square, Circle, Minus, Trash2, ArrowUp, ArrowDown, Scissors, Copy } from 'lucide-svelte';
    import { Button } from '@/components/ui/button';
    import {
        DropdownMenu,
        DropdownMenuContent,
        DropdownMenuItem,
        DropdownMenuTrigger,
    } from '@/components/ui/dropdown-menu';
    import { projectStore, timelineStore, selectionStore } from '@/lib/editor';
    import type { GesturePoint } from '@/lib/editor/usePointerGesture.svelte';
    import { cn } from '@/lib/utils';
    import type { VideoTrack as VideoTrackType, VideoClip as VideoClipType, Asset, ShapeKind } from '@/types';
    import ContextMenu from './ContextMenu.svelte';
import type {ContextMenuItem} from './ContextMenu.svelte';
    import TimelinePlayhead from './TimelinePlayhead.svelte';
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

    function addTextOverlay(trackId: string) {
        const project = projectStore.project;
        if (!project) return;

        const clip = projectStore.addVideoClip(trackId, {
            type: 'text',
            text: 'Text Overlay',
            start_ms: timelineStore.currentTimeMs,
            duration_ms: 3000,
            x: Math.round(project.resolution_width * 0.25),
            y: Math.round(project.resolution_height * 0.75),
            width: Math.round(project.resolution_width * 0.5),
            height: 96,
            font_size: 48,
            font_color: '#ffffff',
            font_weight: 'bold',
            background_color: '#00000080',
        });

        selectionStore.selectVideoClip(trackId, clip.id);
    }

    const SHAPE_OPTIONS: Array<{ shape: ShapeKind; label: string; icon: typeof Square }> = [
        { shape: 'rectangle', label: 'Rectangle', icon: Square },
        { shape: 'ellipse', label: 'Ellipse', icon: Circle },
        { shape: 'line', label: 'Line', icon: Minus },
    ];

    /** Centred shape clip at the playhead, sized like the toolbar's scene shapes. */
    function addShapeClip(trackId: string, shape: ShapeKind) {
        const project = projectStore.project;
        if (!project) return;

        const width = Math.round(project.resolution_width * 0.4);
        const height = shape === 'line' ? 8 : Math.round(project.resolution_height * 0.25);

        const clip = projectStore.addVideoClip(trackId, {
            type: 'shape',
            shape,
            fill_color: '#ffffff',
            border_width: 0,
            border_color: '#000000',
            corner_radius: 0,
            start_ms: timelineStore.currentTimeMs,
            duration_ms: 3000,
            x: Math.round((project.resolution_width - width) / 2),
            y: Math.round((project.resolution_height - height) / 2),
            width,
            height,
        });

        selectionStore.selectVideoClip(trackId, clip.id);
    }

    // --- Selection & context menu -------------------------------------------
    let selectedTrackId = $derived(
        selectionStore.selection.type === 'video_track' ? selectionStore.selection.videoTrackId : null,
    );

    let menu = $state<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);

    function trackMenuItems(track: VideoTrackType, index: number): ContextMenuItem[] {
        const visible = track.visible ?? true;
        return [
            { label: visible ? 'Hide track' : 'Show track', icon: visible ? EyeOff : Eye, onSelect: () => toggleVisibility(track) },
            { label: 'Add text overlay', icon: Type, onSelect: () => addTextOverlay(track.id) },
            { label: 'Move up', icon: ArrowUp, disabled: index === 0, separator: true, onSelect: () => projectStore.moveVideoTrack(track.id, -1) },
            { label: 'Move down', icon: ArrowDown, disabled: index === videoTracks.length - 1, onSelect: () => projectStore.moveVideoTrack(track.id, 1) },
            { label: 'Delete track', icon: Trash2, destructive: true, separator: true, onSelect: () => { selectionStore.selectVideoTrack(track.id); selectionStore.deleteSelected(); } },
        ];
    }

    function clipMenuItems(trackId: string, clip: VideoClipType): ContextMenuItem[] {
        const playhead = timelineStore.currentTimeMs;
        const canSplit = playhead > clip.start_ms && playhead < clip.start_ms + clip.duration_ms;
        const select = () => selectionStore.selectVideoClip(trackId, clip.id);
        return [
            { label: 'Split at playhead', icon: Scissors, disabled: !canSplit, onSelect: () => { select(); selectionStore.splitSelectedAtPlayhead(); } },
            { label: 'Duplicate', icon: Copy, onSelect: () => { select(); selectionStore.duplicateSelected(); } },
            { label: 'Delete clip', icon: Trash2, destructive: true, separator: true, onSelect: () => { select(); selectionStore.deleteSelected(); } },
        ];
    }

    /** One handler per row: a press on a clip opens the clip menu, anywhere else the track menu. */
    function openMenu(e: MouseEvent, track: VideoTrackType, index: number) {
        e.preventDefault();
        e.stopPropagation();

        const clipEl = (e.target as Element | null)?.closest<HTMLElement>('[data-clip-id]');
        const clip = clipEl ? track.clips.find((c) => c.id === clipEl.dataset.clipId) : undefined;

        if (clip) {
            selectionStore.selectVideoClip(track.id, clip.id);
            menu = { x: e.clientX, y: e.clientY, items: clipMenuItems(track.id, clip) };
        } else {
            selectionStore.selectVideoTrack(track.id);
            menu = { x: e.clientX, y: e.clientY, items: trackMenuItems(track, index) };
        }
    }

    function handleClipClick(trackId: string, clip: VideoClipType) {
        selectionStore.selectVideoClip(trackId, clip.id);
    }

    function handleClipUpdate(trackId: string, clipId: string, updates: Partial<VideoClipType>) {
        projectStore.updateVideoClip(trackId, clipId, updates);
    }

    // Cross-track drag: while a clip body is dragged, hit-test the pointer's Y
    // against the track rows and highlight the row it would land on.
    let tracksEl = $state<HTMLElement | null>(null);
    let dropTargetTrackId = $state<string | null>(null);

    function trackIdAtPoint(clientY: number): string | null {
        if (!tracksEl) return null;

        for (const row of tracksEl.querySelectorAll<HTMLElement>('[data-track-id]')) {
            const rect = row.getBoundingClientRect();
            if (clientY >= rect.top && clientY < rect.bottom) {
                return row.dataset.trackId ?? null;
            }
        }

        return null;
    }

    function handleClipDragMove(sourceTrackId: string, point: GesturePoint) {
        const target = trackIdAtPoint(point.clientY);
        dropTargetTrackId = target && target !== sourceTrackId ? target : null;
    }

    function handleClipDragEnd(sourceTrackId: string, clipId: string, point: GesturePoint | null) {
        const target = point ? trackIdAtPoint(point.clientY) : null;
        dropTargetTrackId = null;

        if (!target || target === sourceTrackId) return;

        if (projectStore.moveVideoClip(sourceTrackId, clipId, target)) {
            selectionStore.selectVideoClip(target, clipId);
        }
    }

    function handleDragOver(e: DragEvent) {
        e.preventDefault();
        if (e.dataTransfer) {
            e.dataTransfer.dropEffect = 'copy';
        }
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

    function handleDrop(trackId: string, e: DragEvent) {
        e.preventDefault();

        if (!e.dataTransfer) return;

        const data = e.dataTransfer.getData('application/json');
        if (!data) return;

        try {
            const parsed = JSON.parse(data);
            if (parsed.type !== 'asset') return;
            if (parsed.assetType !== 'video' && parsed.assetType !== 'image') return;

            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const dropX = e.clientX - rect.left;
            const startMs = Math.max(0, Math.round(dropX / pixelsPerMs));

            const project = projectStore.project;
            if (!project) return;

            const asset = assets.find((a: Asset) => a.id === parsed.assetId);
            const isImage = parsed.assetType === 'image';
            // Stills have no intrinsic length; give them a few seconds to trim.
            const assetDuration = isImage ? 5000 : (asset?.duration_ms ?? 5000);

            // Default PIP size: 25% of canvas, keeping the source aspect for stills.
            let width = Math.round(project.resolution_width * 0.25);
            let height = Math.round(project.resolution_height * 0.25);
            if (isImage && asset?.width && asset?.height) {
                height = Math.max(1, Math.round((width * asset.height) / asset.width));
            }

            // Default position: bottom-right corner with padding
            const x = project.resolution_width - width - 32;
            const y = project.resolution_height - height - 32;

            const clip = projectStore.addVideoClip(trackId, {
                type: isImage ? 'image' : 'video',
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

<div class="flex flex-col border-t bg-muted/20" bind:this={tracksEl}>
    {#each videoTracks as track, index (track.id)}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
            class={cn(
                'flex h-12 border-b transition-colors',
                dropTargetTrackId === track.id && 'bg-primary/15',
                selectedTrackId === track.id && 'bg-primary/5',
            )}
            data-track-id={track.id}
            oncontextmenu={(e) => openMenu(e, track, index)}
        >
            <div
                class={cn(
                    'flex w-32 cursor-pointer items-center gap-1 border-r bg-background px-2',
                    selectedTrackId === track.id && 'bg-primary/10 shadow-[inset_2px_0_0_0_hsl(var(--primary))]',
                )}
                role="button"
                tabindex="0"
                onclick={() => selectionStore.selectVideoTrack(track.id)}
                onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && selectionStore.selectVideoTrack(track.id)}
            >
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
                <Button
                    variant="ghost"
                    size="icon"
                    class="h-6 w-6"
                    title="Add text overlay at playhead"
                    onclick={() => addTextOverlay(track.id)}
                >
                    <Type class="h-3 w-3" />
                </Button>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        {#snippet children(menuProps)}
                            <Button
                                variant="ghost"
                                size="icon"
                                class="h-6 w-6"
                                title="Add shape at playhead"
                                onclick={menuProps.onclick}
                                aria-expanded={menuProps['aria-expanded']}
                                data-state={menuProps['data-state']}
                            >
                                <Shapes class="h-3 w-3" />
                            </Button>
                        {/snippet}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                        {#each SHAPE_OPTIONS as option (option.shape)}
                            {@const Icon = option.icon}
                            <DropdownMenuItem asChild>
                                {#snippet children(props)}
                                    <button class={props.class} onclick={(e) => { props.onClick?.(e); addShapeClip(track.id, option.shape); }}>
                                        <Icon class="h-4 w-4" />
                                        {option.label}
                                    </button>
                                {/snippet}
                            </DropdownMenuItem>
                        {/each}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            <div
                class="relative flex-1 overflow-hidden"
                ondragover={handleDragOver}
                ondrop={(e) => handleDrop(track.id, e)}
                role="listbox"
                aria-label="{track.name} clips"
                tabindex="0"
            >
                <div
                    class="absolute inset-0 cursor-pointer"
                    style:width="{totalDuration * pixelsPerMs}px"
                    onmousedown={handleTimelineMouseDown}
                    onmousemove={handleTimelineMouseMove}
                    role="presentation"
                >
                    <TimelinePlayhead />
                    {#each track.clips as clip (clip.id)}
                        <VideoClip
                            {clip}
                            {pixelsPerMs}
                            isSelected={selectionStore.selection.videoClipId === clip.id}
                            onclick={() => handleClipClick(track.id, clip)}
                            onUpdate={(updates) => handleClipUpdate(track.id, clip.id, updates)}
                            onDragMove={(point) => handleClipDragMove(track.id, point)}
                            onDragEnd={(point) => handleClipDragEnd(track.id, clip.id, point)}
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

<ContextMenu position={menu} items={menu?.items ?? []} onClose={() => (menu = null)} />
