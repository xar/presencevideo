<script lang="ts">
    import { Copy, Pencil, Plus, Trash2 } from 'lucide-svelte';
    import { onDestroy, tick } from 'svelte';
    import { Button } from '@/components/ui/button';
    import { projectStore, timelineStore, selectionStore } from '@/lib/editor';
    import { getCanvasFitDimensions } from '@/lib/editor/asset-actions';
    import { collectSnapPoints } from '@/lib/editor/snapping';
    import type { Scene } from '@/types';
    import SceneCard from './SceneCard.svelte';
    import TimelinePlayhead from './TimelinePlayhead.svelte';
    import TransitionPicker from './TransitionPicker.svelte';

    const MIN_WIDTH = 48;
    const MIN_DURATION_MS = 200;
    /** Pointer travel before a press on a card turns into a reorder drag. */
    const DRAG_THRESHOLD_PX = 4;
    /** Distance from a snap candidate, in screen px, that still snaps. */
    const SNAP_THRESHOLD_PX = 6;
    /** Edge band that triggers auto-scroll while reordering. */
    const AUTO_SCROLL_EDGE_PX = 56;
    const AUTO_SCROLL_MAX_PX_PER_FRAME = 18;

    let scenes = $derived(projectStore.project?.scenes ?? []);
    let assets = $derived(projectStore.project?.assets ?? []);
    let selectedSceneId = $derived(selectionStore.selection.sceneId);
    let isPlaying = $derived(timelineStore.isPlaying);
    let playingSceneIndex = $derived(timelineStore.getCurrentSceneIndex());
    let pixelsPerMs = $derived(timelineStore.pixelsPerMs);
    let isDragOverStrip = $state(false);

    let scrollEl = $state<HTMLElement | null>(null);
    let contentEl = $state<HTMLElement | null>(null);

    // --- Resize state ------------------------------------------------------
    // The live duration lives in component state and is only written back to the
    // project store once, on pointerup. Driving the width from the store on every
    // pointermove made the card jitter (store write -> derived -> layout) and made
    // history depend on a batch guard.
    let resizeSceneId = $state<string | null>(null);
    let resizeDurationMs = $state(0);
    let resizeSnapped = $state(false);
    let resizeStartX = 0;
    let resizeStartDuration = 0;
    let resizeSceneStartMs = 0;
    let resizeSnapPoints: number[] = [];
    let resizeHandleEl: HTMLElement | null = null;
    let resizePointerId: number | null = null;

    // --- Reorder drag state ------------------------------------------------
    let dragSceneId = $state<string | null>(null);
    let dragActive = $state(false);
    let dragOffsetX = $state(0);
    /** Gap index (0..scenes.length) the dragged scene would be inserted at. */
    let dropGap = $state<number | null>(null);
    let dragFromIndex = 0;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragPointerX = 0;
    let autoScrollFrame: number | null = null;

    // --- Context menu ------------------------------------------------------
    let menu = $state<{ sceneId: string; index: number; x: number; y: number } | null>(null);
    let renamingSceneId = $state<string | null>(null);
    let renameValue = $state('');
    let renameInputEl = $state<HTMLInputElement | null>(null);

    function sceneDuration(scene: Scene): number {
        return scene.id === resizeSceneId ? resizeDurationMs : scene.duration_ms;
    }

    function getSceneWidth(scene: Scene): number {
        return Math.max(MIN_WIDTH, sceneDuration(scene) * pixelsPerMs);
    }

    let totalDuration = $derived(scenes.reduce((sum, s) => sum + sceneDuration(s), 0));
    let timelineWidth = $derived(Math.max(scenes.reduce((sum, s) => sum + getSceneWidth(s), 0), 1));

    /** Cumulative left offsets of every scene boundary, including 0 and the end. */
    let gapPositions = $derived.by((): number[] => {
        const positions = [0];
        let x = 0;
        for (const scene of scenes) {
            x += getSceneWidth(scene);
            positions.push(x);
        }
        return positions;
    });

    /** One transition handle per boundary between two adjacent scenes. */
    type SceneJunction = { scene: Scene; next: Scene; x: number };

    let junctions = $derived.by((): SceneJunction[] =>
        scenes.slice(0, -1).map((scene, i) => ({
            scene,
            next: scenes[i + 1],
            x: gapPositions[i + 1],
        })),
    );

    function addScene() {
        const scene = projectStore.addScene();
        selectionStore.selectScene(scene.id);
    }

    function selectAndSeek(sceneId: string) {
        selectionStore.selectScene(sceneId);
        const sceneIndex = scenes.findIndex((s) => s.id === sceneId);
        if (sceneIndex >= 0) {
            timelineStore.seekToScene(sceneIndex);
        }
    }

    // --- Scrubbing on empty strip space ------------------------------------
    let isScrubbing = $state(false);

    function handleTimelinePointer(e: PointerEvent) {
        if (!totalDuration || !contentEl) return;

        const rect = contentEl.getBoundingClientRect();
        const x = Math.max(0, Math.min(e.clientX - rect.left, timelineWidth));
        timelineStore.setCurrentTime(x / pixelsPerMs);
    }

    // Scrub only when the gesture starts on empty strip space — gestures that
    // start on a scene card (select, drag-reorder, resize) must not seek
    function handleTimelinePointerDown(e: PointerEvent) {
        if (e.target !== e.currentTarget || e.button !== 0) return;

        isScrubbing = true;
        // Capture the pointer so scrubbing keeps tracking outside the strip
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        handleTimelinePointer(e);
    }

    function handleTimelinePointerMove(e: PointerEvent) {
        if (isScrubbing && e.buttons === 1) {
            handleTimelinePointer(e);
        }
    }

    function handleTimelinePointerUp() {
        isScrubbing = false;
    }

    // --- Reorder by pointer ------------------------------------------------
    function handleCardPointerDown(e: PointerEvent, scene: Scene, index: number) {
        if (e.button !== 0 || resizeSceneId) return;

        closeMenu();
        dragSceneId = scene.id;
        dragFromIndex = index;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        dragPointerX = e.clientX;
        dragActive = false;
        dragOffsetX = 0;
        dropGap = null;

        window.addEventListener('pointermove', handleDragMove);
        window.addEventListener('pointerup', handleDragEnd);
        window.addEventListener('pointercancel', handleDragCancel);
    }

    function gapForPointer(clientX: number): number {
        if (!contentEl) return dragFromIndex;

        const x = clientX - contentEl.getBoundingClientRect().left;
        let best = 0;
        let bestDist = Infinity;
        for (let i = 0; i < gapPositions.length; i++) {
            const dist = Math.abs(gapPositions[i] - x);
            if (dist < bestDist) {
                bestDist = dist;
                best = i;
            }
        }
        return best;
    }

    /** Convert an insertion gap into the destination index for reorderScenes(). */
    function gapToTargetIndex(gap: number): number {
        return gap > dragFromIndex ? gap - 1 : gap;
    }

    function handleDragMove(e: PointerEvent) {
        if (!dragSceneId) return;

        dragPointerX = e.clientX;

        if (!dragActive) {
            const dx = e.clientX - dragStartX;
            const dy = e.clientY - dragStartY;
            if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
            dragActive = true;
            startAutoScroll();
        }

        e.preventDefault();
        dragOffsetX = e.clientX - dragStartX;
        dropGap = gapForPointer(e.clientX);
    }

    function handleDragEnd() {
        const sceneId = dragSceneId;
        const wasDragging = dragActive;
        const gap = dropGap;
        stopDrag();

        if (!sceneId) return;

        if (wasDragging) {
            if (gap !== null) {
                const target = gapToTargetIndex(gap);
                // A single reorderScenes() call is exactly one undo entry.
                projectStore.reorderScenes(dragFromIndex, target);
            }
            // Keep the preview on the scene the user just moved.
            selectAndSeek(sceneId);
            return;
        }

        // Below the drag threshold the gesture is a plain click: select + seek.
        selectAndSeek(sceneId);
    }

    function handleDragCancel() {
        stopDrag();
    }

    function stopDrag() {
        dragSceneId = null;
        dragActive = false;
        dragOffsetX = 0;
        dropGap = null;
        stopAutoScroll();

        window.removeEventListener('pointermove', handleDragMove);
        window.removeEventListener('pointerup', handleDragEnd);
        window.removeEventListener('pointercancel', handleDragCancel);
    }

    function startAutoScroll() {
        if (autoScrollFrame !== null) return;

        const step = () => {
            autoScrollFrame = null;
            if (!dragActive || !scrollEl) return;

            const rect = scrollEl.getBoundingClientRect();
            let delta = 0;
            if (dragPointerX < rect.left + AUTO_SCROLL_EDGE_PX) {
                const intensity = (rect.left + AUTO_SCROLL_EDGE_PX - dragPointerX) / AUTO_SCROLL_EDGE_PX;
                delta = -Math.min(1, intensity) * AUTO_SCROLL_MAX_PX_PER_FRAME;
            } else if (dragPointerX > rect.right - AUTO_SCROLL_EDGE_PX) {
                const intensity = (dragPointerX - (rect.right - AUTO_SCROLL_EDGE_PX)) / AUTO_SCROLL_EDGE_PX;
                delta = Math.min(1, intensity) * AUTO_SCROLL_MAX_PX_PER_FRAME;
            }

            if (delta !== 0) {
                scrollEl.scrollLeft += delta;
                // The content moved under the pointer, so the drop gap changes
                // even though the pointer did not.
                dropGap = gapForPointer(dragPointerX);
            }

            autoScrollFrame = requestAnimationFrame(step);
        };

        autoScrollFrame = requestAnimationFrame(step);
    }

    function stopAutoScroll() {
        if (autoScrollFrame !== null) {
            cancelAnimationFrame(autoScrollFrame);
            autoScrollFrame = null;
        }
    }

    // --- Asset drops create scenes ----------------------------------------
    function handleStripDragOver(e: DragEvent) {
        e.preventDefault();
        if (e.dataTransfer?.types.includes('application/json')) {
            e.dataTransfer.dropEffect = 'copy';
            isDragOverStrip = true;
        }
    }

    function handleStripDragLeave(e: DragEvent) {
        const relatedTarget = e.relatedTarget as HTMLElement | null;
        if (!relatedTarget || !e.currentTarget || !(e.currentTarget as HTMLElement).contains(relatedTarget)) {
            isDragOverStrip = false;
        }
    }

    function handleStripDrop(e: DragEvent) {
        e.preventDefault();
        isDragOverStrip = false;

        if (!e.dataTransfer || !projectStore.project) return;

        const data = e.dataTransfer.getData('application/json');
        if (!data) return;

        try {
            const parsed = JSON.parse(data);
            if (parsed.type !== 'asset') return;

            // Only allow video and image assets to create scenes
            if (parsed.assetType !== 'video' && parsed.assetType !== 'image') return;

            const project = projectStore.project;
            const asset = project.assets?.find(a => a.id === parsed.assetId);
            const sceneDurationMs = parsed.assetType === 'video' ? (asset?.duration_ms ?? 5000) : 5000;
            const fit = getCanvasFitDimensions(project, {
                width: parsed.width,
                height: parsed.height,
            });

            const scene = projectStore.addScene({
                name: asset?.name ?? `Scene ${scenes.length + 1}`,
                duration_ms: sceneDurationMs,
            });

            const layer = projectStore.addLayer(scene.id, {
                type: parsed.assetType,
                asset_id: parsed.assetId,
                ...fit,
            });

            selectionStore.selectLayer(scene.id, layer.id);
        } catch (err) {
            console.error('Failed to create scene from asset:', err);
        }
    }

    // --- Duration resize ---------------------------------------------------
    function handleResizeStart(e: PointerEvent, scene: Scene) {
        e.preventDefault();
        closeMenu();

        resizeSceneId = scene.id;
        resizeDurationMs = scene.duration_ms;
        resizeSnapped = false;
        resizeStartX = e.clientX;
        resizeStartDuration = scene.duration_ms;

        // Absolute timeline offset where this scene starts
        let sceneStart = 0;
        for (const s of scenes) {
            if (s.id === scene.id) break;
            sceneStart += s.duration_ms;
        }
        resizeSceneStartMs = sceneStart;

        // Snap the scene's right edge to other boundaries/clips/playhead,
        // excluding the scene's own current end so it isn't sticky.
        const originalEnd = sceneStart + scene.duration_ms;
        resizeSnapPoints = collectSnapPoints(projectStore.project, {
            playheadMs: timelineStore.currentTimeMs,
        }).filter((point) => point !== originalEnd);

        resizeHandleEl = e.currentTarget as HTMLElement;
        resizePointerId = e.pointerId;
        resizeHandleEl?.setPointerCapture?.(e.pointerId);

        window.addEventListener('pointermove', handleResizeMove);
        window.addEventListener('pointerup', handleResizeEnd);
        window.addEventListener('pointercancel', handleResizeEnd);
    }

    /**
     * Snap the dragged end to timeline landmarks (other scene boundaries, clip
     * edges, the playhead) and to round durations (whole and half seconds),
     * whichever is closest within the pixel threshold.
     */
    function snapResizeEnd(rawEnd: number): { end: number; snapped: boolean } {
        const rawDuration = rawEnd - resizeSceneStartMs;
        const candidates = [
            ...resizeSnapPoints,
            resizeSceneStartMs + Math.round(rawDuration / 1000) * 1000,
            resizeSceneStartMs + Math.round(rawDuration / 500) * 500,
        ];

        let best = rawEnd;
        let bestDistPx = Infinity;
        for (const candidate of candidates) {
            if (candidate - resizeSceneStartMs < MIN_DURATION_MS) continue;
            const distPx = Math.abs(candidate - rawEnd) * pixelsPerMs;
            if (distPx < bestDistPx) {
                bestDistPx = distPx;
                best = candidate;
            }
        }

        return bestDistPx <= SNAP_THRESHOLD_PX
            ? { end: best, snapped: true }
            : { end: rawEnd, snapped: false };
    }

    function handleResizeMove(e: PointerEvent) {
        if (!resizeSceneId) return;
        e.preventDefault();

        const deltaDuration = (e.clientX - resizeStartX) / pixelsPerMs;
        const rawEnd = resizeSceneStartMs + resizeStartDuration + deltaDuration;

        // Alt bypasses snapping for fine adjustments.
        const { end, snapped } = e.altKey ? { end: rawEnd, snapped: false } : snapResizeEnd(rawEnd);

        const duration = Math.max(MIN_DURATION_MS, Math.round(end - resizeSceneStartMs));
        resizeSnapped = snapped && duration > MIN_DURATION_MS;
        resizeDurationMs = duration;
    }

    function handleResizeEnd() {
        const sceneId = resizeSceneId;
        const duration = resizeDurationMs;

        if (resizeHandleEl && resizePointerId !== null) {
            try {
                resizeHandleEl.releasePointerCapture(resizePointerId);
            } catch {
                // Pointer already released (e.g. pointercancel); nothing to do.
            }
        }
        resizeHandleEl = null;
        resizePointerId = null;
        resizeSceneId = null;
        resizeSnapped = false;

        window.removeEventListener('pointermove', handleResizeMove);
        window.removeEventListener('pointerup', handleResizeEnd);
        window.removeEventListener('pointercancel', handleResizeEnd);

        // One store write per gesture == exactly one undo entry.
        if (sceneId && duration !== resizeStartDuration) {
            projectStore.updateScene(sceneId, { duration_ms: duration });
        }
    }

    // --- Context menu ------------------------------------------------------
    function openMenu(e: MouseEvent, scene: Scene, index: number) {
        e.preventDefault();
        e.stopPropagation();
        stopDrag();
        selectionStore.selectScene(scene.id);
        renamingSceneId = null;
        menu = {
            sceneId: scene.id,
            index,
            x: Math.min(e.clientX, window.innerWidth - 200),
            y: Math.min(e.clientY, window.innerHeight - 160),
        };
    }

    function closeMenu() {
        menu = null;
        renamingSceneId = null;
    }

    function duplicateFromMenu() {
        if (!menu) return;
        selectionStore.selectScene(menu.sceneId);
        selectionStore.duplicateSelected();
        closeMenu();
    }

    function deleteFromMenu() {
        if (!menu) return;
        selectionStore.selectScene(menu.sceneId);
        selectionStore.deleteSelected();
        closeMenu();
    }

    async function startRenameFromMenu() {
        if (!menu) return;
        const scene = scenes.find((s) => s.id === menu?.sceneId);
        renameValue = scene?.name ?? '';
        renamingSceneId = menu.sceneId;
        await tick();
        renameInputEl?.focus();
        renameInputEl?.select();
    }

    function commitRename() {
        if (renamingSceneId && renameValue.trim()) {
            projectStore.updateScene(renamingSceneId, { name: renameValue.trim() });
        }
        closeMenu();
    }

    function handleWindowKeyDown(e: KeyboardEvent) {
        if (e.key !== 'Escape') return;
        if (menu) closeMenu();
        if (dragActive) stopDrag();
    }

    onDestroy(() => {
        stopDrag();
        window.removeEventListener('pointermove', handleResizeMove);
        window.removeEventListener('pointerup', handleResizeEnd);
        window.removeEventListener('pointercancel', handleResizeEnd);
    });
</script>

<svelte:window onkeydown={handleWindowKeyDown} />

<div class="flex h-24 border-b bg-muted/30">
    <div class="flex w-32 shrink-0 items-center border-r bg-background px-2">
        <span class="text-xs text-muted-foreground">Scenes</span>
    </div>
    <div
        bind:this={scrollEl}
        class="flex flex-1 items-center overflow-x-auto pr-2 py-2 transition-colors {isDragOverStrip ?
        'bg-primary/10 ring-2 ring-primary ring-inset' : ''}"
        ondragover={handleStripDragOver}
        ondragleave={handleStripDragLeave}
        ondrop={handleStripDrop}
        role="list"
    >
        <div
            bind:this={contentEl}
            class="relative flex h-16 shrink-0 {dragActive ? 'cursor-grabbing' : 'cursor-pointer'}"
            style:width="{timelineWidth}px"
            onpointerdown={handleTimelinePointerDown}
            onpointermove={handleTimelinePointerMove}
            onpointerup={handleTimelinePointerUp}
            onlostpointercapture={handleTimelinePointerUp}
            role="slider"
            aria-label="Scene timeline scrubber"
            aria-valuemin="0"
            aria-valuemax={totalDuration}
            aria-valuenow={timelineStore.currentTimeMs}
            tabindex="0"
        >
            <TimelinePlayhead />
            {#each scenes as scene, index (scene.id)}
                <div class="flex-shrink-0 border-r border-background/80 last:border-r-0" role="listitem">
                    <SceneCard
                        {scene}
                        {index}
                        {assets}
                        isSelected={scene.id === selectedSceneId}
                        isPlaying={isPlaying && index === playingSceneIndex}
                        width={getSceneWidth(scene)}
                        minWidth={MIN_WIDTH}
                        durationMs={sceneDuration(scene)}
                        isDragging={dragActive && scene.id === dragSceneId}
                        dragOffsetX={dragOffsetX}
                        isDragActive={dragActive}
                        isResizing={scene.id === resizeSceneId}
                        isSnapped={resizeSnapped}
                        onPointerDown={(e) => handleCardPointerDown(e, scene, index)}
                        onSelect={() => selectAndSeek(scene.id)}
                        onResizePointerDown={(e) => handleResizeStart(e, scene)}
                        onContextMenu={(e) => openMenu(e, scene, index)}
                    />
                </div>
            {/each}

            <!-- Drop indicator for the reorder drag -->
            {#if dragActive && dropGap !== null}
                <div
                    class="pointer-events-none absolute inset-y-0 z-40 w-0.5 -translate-x-1/2 rounded bg-primary shadow"
                    style:left="{gapPositions[dropGap] ?? 0}px"
                >
                    <div class="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 rounded-[1px] bg-primary"></div>
                    <div class="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 rounded-[1px] bg-primary"></div>
                </div>
            {/if}

            <!-- Transition handles sit on top of the scene boundaries. They are
                 hidden mid-gesture so they cannot swallow drag/resize pointers. -->
            {#if !dragActive && !resizeSceneId}
                {#each junctions as junction (junction.scene.id)}
                    <div class="absolute top-1/2 -translate-y-1/2" style:left="{junction.x}px">
                        <TransitionPicker scene={junction.scene} nextScene={junction.next} />
                    </div>
                {/each}
            {/if}
        </div>

        <Button variant="outline" size="icon" class="ml-2 h-16 w-24 flex-shrink-0" onclick={addScene}>
            <Plus class="h-6 w-6" />
        </Button>
    </div>
</div>

{#if menu}
    {@const openMenuState = menu}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="fixed inset-0 z-50"
        onpointerdown={closeMenu}
        oncontextmenu={(e) => {
            e.preventDefault();
            closeMenu();
        }}
    >
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
            class="absolute min-w-44 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
            style:left="{openMenuState.x}px"
            style:top="{openMenuState.y}px"
            onpointerdown={(e) => e.stopPropagation()}
        >
            {#if renamingSceneId}
                <input
                    bind:this={renameInputEl}
                    bind:value={renameValue}
                    class="h-8 w-full rounded-sm border bg-background px-2 text-xs outline-none focus:border-primary"
                    onkeydown={(e) => {
                        if (e.key === 'Enter') commitRename();
                        if (e.key === 'Escape') closeMenu();
                    }}
                    onblur={commitRename}
                />
            {:else}
                <button
                    type="button"
                    class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                    onclick={startRenameFromMenu}
                >
                    <Pencil class="h-3.5 w-3.5" /> Rename
                </button>
                <button
                    type="button"
                    class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                    onclick={duplicateFromMenu}
                >
                    <Copy class="h-3.5 w-3.5" /> Duplicate
                </button>
                <button
                    type="button"
                    class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs text-destructive hover:bg-destructive/10"
                    onclick={deleteFromMenu}
                >
                    <Trash2 class="h-3.5 w-3.5" /> Delete
                </button>
            {/if}
        </div>
    </div>
{/if}
