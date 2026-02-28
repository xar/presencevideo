<script lang="ts">
    import { projectStore, timelineStore, selectionStore } from '@/lib/editor';
    import { cn } from '@/lib/utils';
    import type { Layer, TextLayer, ImageLayer, VideoLayer } from '@/types';

    let {
        layer,
        scale = 1,
        isSelected = false,
        onclick,
        onUpdate,
    }: {
        layer: Layer;
        scale?: number;
        isSelected?: boolean;
        onclick?: (e: MouseEvent) => void;
        onUpdate?: (updates: Partial<Layer>) => void;
    } = $props();

    let videoEl: HTMLVideoElement | undefined = $state();
    let videoReady = $state(false);
    let isPlaying = $derived(timelineStore.isPlaying);
    let currentTimeMs = $derived(timelineStore.currentTimeMs);

    // Track video metadata loading
    $effect(() => {
        if (!videoEl) {
            videoReady = false;
            return;
        }

        // Reset ready state when video element changes
        videoReady = false;

        if (videoEl.readyState >= 1) {
            videoReady = true;
            return;
        }

        const handleLoaded = () => {
            videoReady = true;
        };

        videoEl.addEventListener('loadedmetadata', handleLoaded);
        return () => {
            videoEl?.removeEventListener('loadedmetadata', handleLoaded);
        };
    });

    // Calculate time within the current scene based on timeline position
    let sceneTimeMs = $derived.by(() => {
        const project = projectStore.project;
        if (!project?.scenes?.length) return 0;

        // Use timeline's current scene during playback for accurate sync
        const currentScene = isPlaying
            ? timelineStore.getCurrentScene()
            : selectionStore.getSelectedScene();
        if (!currentScene) return 0;

        let accumulated = 0;
        for (const scene of project.scenes) {
            if (scene.id === currentScene.id) {
                return Math.max(0, currentTimeMs - accumulated);
            }
            accumulated += scene.duration_ms;
        }
        return 0;
    });

    // Sync video playback with timeline
    $effect(() => {
        if (!videoEl || layer.type !== 'video' || !videoReady) return;

        // Access reactive values to ensure effect re-runs
        const playing = isPlaying;
        const sceneTime = sceneTimeMs;

        const videoLayer = layer as VideoLayer;
        const trimStart = videoLayer.trim_start_ms ?? 0;
        const videoDuration = videoEl.duration || 0;

        // Calculate target time and clamp to video duration
        let targetTime = (sceneTime + trimStart) / 1000;
        if (videoDuration > 0) {
            targetTime = Math.min(targetTime, videoDuration - 0.01);
        }

        // When not playing, sync video to target time
        if (!playing) {
            if (Math.abs(videoEl.currentTime - targetTime) > 0.05) {
                videoEl.currentTime = targetTime;
            }
            if (!videoEl.paused) {
                videoEl.pause();
            }
            return;
        }

        // When playing, start video and let it play naturally
        // Only seek if significantly out of sync
        if (Math.abs(videoEl.currentTime - targetTime) > 0.3) {
            videoEl.currentTime = targetTime;
        }

        if (videoEl.paused) {
            videoEl.play().catch((err) => {
                console.warn('Video play failed:', err);
            });
        }
    });

    let isDragging = $state(false);
    let isResizing = $state<string | null>(null);
    let dragStart = $state({ x: 0, y: 0, layerX: 0, layerY: 0, layerW: 0, layerH: 0 });

    function handleMouseDown(e: MouseEvent) {
        if (e.button !== 0 || isResizing) return;
        e.stopPropagation();

        isDragging = true;
        dragStart = {
            x: e.clientX,
            y: e.clientY,
            layerX: layer.x,
            layerY: layer.y,
            layerW: layer.width,
            layerH: layer.height,
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    }

    function handleMouseMove(e: MouseEvent) {
        if (isDragging) {
            const deltaX = (e.clientX - dragStart.x) / scale;
            const deltaY = (e.clientY - dragStart.y) / scale;

            onUpdate?.({
                x: Math.round(dragStart.layerX + deltaX),
                y: Math.round(dragStart.layerY + deltaY),
            });
        } else if (isResizing) {
            const deltaX = (e.clientX - dragStart.x) / scale;
            const deltaY = (e.clientY - dragStart.y) / scale;

            let newX = dragStart.layerX;
            let newY = dragStart.layerY;
            let newW = dragStart.layerW;
            let newH = dragStart.layerH;

            if (isResizing.includes('left')) {
                newX = dragStart.layerX + deltaX;
                newW = dragStart.layerW - deltaX;
            }
            if (isResizing.includes('right')) {
                newW = dragStart.layerW + deltaX;
            }
            if (isResizing.includes('top')) {
                newY = dragStart.layerY + deltaY;
                newH = dragStart.layerH - deltaY;
            }
            if (isResizing.includes('bottom')) {
                newH = dragStart.layerH + deltaY;
            }

            // Minimum size
            if (newW < 20) {
                if (isResizing.includes('left')) {
                    newX = dragStart.layerX + dragStart.layerW - 20;
                }
                newW = 20;
            }
            if (newH < 20) {
                if (isResizing.includes('top')) {
                    newY = dragStart.layerY + dragStart.layerH - 20;
                }
                newH = 20;
            }

            onUpdate?.({
                x: Math.round(newX),
                y: Math.round(newY),
                width: Math.round(newW),
                height: Math.round(newH),
            });
        }
    }

    function handleMouseUp() {
        isDragging = false;
        isResizing = null;
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
    }

    function handleResizeStart(corner: string, e: MouseEvent) {
        e.stopPropagation();
        e.preventDefault();

        isResizing = corner;
        dragStart = {
            x: e.clientX,
            y: e.clientY,
            layerX: layer.x,
            layerY: layer.y,
            layerW: layer.width,
            layerH: layer.height,
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    }

    function getAssetUrl(assetId: number): string | null {
        const assets = projectStore.project?.assets ?? [];
        const asset = assets.find((a) => a.id === assetId);
        return asset?.url ?? null;
    }
</script>

<div
    class={cn(
        'absolute cursor-move',
        isSelected && 'ring-2 ring-primary ring-offset-1'
    )}
    style:left="{layer.x * scale}px"
    style:top="{layer.y * scale}px"
    style:width="{layer.width * scale}px"
    style:height="{layer.height * scale}px"
    style:transform="rotate({layer.rotation ?? 0}deg)"
    style:opacity={layer.opacity ?? 1}
    onmousedown={handleMouseDown}
    onclick={onclick}
    onkeydown={() => {}}
    role="button"
    tabindex="0"
>
    {#if layer.type === 'image'}
        {@const imageLayer = layer as ImageLayer}
        {@const url = getAssetUrl(imageLayer.asset_id)}
        {#if url}
            <img
                src={url}
                alt="Layer"
                class="h-full w-full object-cover pointer-events-none"
                draggable="false"
            />
        {:else}
            <div class="h-full w-full bg-muted flex items-center justify-center">
                <span class="text-xs text-muted-foreground">Image</span>
            </div>
        {/if}
    {:else if layer.type === 'video'}
        {@const videoLayer = layer as VideoLayer}
        {@const url = getAssetUrl(videoLayer.asset_id)}
        {#if url}
            <video
                bind:this={videoEl}
                src={url}
                class="h-full w-full object-cover pointer-events-none"
                muted
                playsinline
                preload="auto"
            ></video>
        {:else}
            <div class="h-full w-full bg-muted flex items-center justify-center">
                <span class="text-xs text-muted-foreground">Video</span>
            </div>
        {/if}
    {:else if layer.type === 'text'}
        {@const textLayer = layer as TextLayer}
        {@const strokeWidth = (textLayer.stroke_width ?? 0) * scale}
        {@const strokeColor = textLayer.stroke_color ?? '#000000'}
        <div
            class="flex h-full w-full items-center justify-center p-2 overflow-hidden"
            style:font-family={textLayer.font_family ?? 'system-ui'}
            style:font-size="{(textLayer.font_size ?? 48) * scale}px"
            style:color={textLayer.font_color ?? '#ffffff'}
            style:font-weight={textLayer.font_weight ?? 'normal'}
            style:text-align={textLayer.text_align ?? 'center'}
            style:background-color={textLayer.background_color ?? 'transparent'}
            style:padding="{(textLayer.padding ?? 0) * scale}px"
            style:-webkit-text-stroke={strokeWidth > 0 ? `${strokeWidth}px ${strokeColor}` : 'none'}
            style:paint-order={strokeWidth > 0 ? 'stroke fill' : 'normal'}
        >
            {textLayer.text}
        </div>
    {/if}

    {#if isSelected}
        <!-- Resize handles -->
        <div
            class="absolute -top-1.5 -left-1.5 h-3 w-3 rounded-full bg-primary border-2 border-background cursor-nwse-resize z-10"
            onmousedown={(e) => handleResizeStart('top-left', e)}
        ></div>
        <div
            class="absolute -top-1.5 -right-1.5 h-3 w-3 rounded-full bg-primary border-2 border-background cursor-nesw-resize z-10"
            onmousedown={(e) => handleResizeStart('top-right', e)}
        ></div>
        <div
            class="absolute -bottom-1.5 -left-1.5 h-3 w-3 rounded-full bg-primary border-2 border-background cursor-nesw-resize z-10"
            onmousedown={(e) => handleResizeStart('bottom-left', e)}
        ></div>
        <div
            class="absolute -bottom-1.5 -right-1.5 h-3 w-3 rounded-full bg-primary border-2 border-background cursor-nwse-resize z-10"
            onmousedown={(e) => handleResizeStart('bottom-right', e)}
        ></div>
        <!-- Edge handles -->
        <div
            class="absolute -top-1 left-1/2 -translate-x-1/2 h-2 w-6 rounded bg-primary border border-background cursor-ns-resize z-10"
            onmousedown={(e) => handleResizeStart('top', e)}
        ></div>
        <div
            class="absolute -bottom-1 left-1/2 -translate-x-1/2 h-2 w-6 rounded bg-primary border border-background cursor-ns-resize z-10"
            onmousedown={(e) => handleResizeStart('bottom', e)}
        ></div>
        <div
            class="absolute top-1/2 -left-1 -translate-y-1/2 h-6 w-2 rounded bg-primary border border-background cursor-ew-resize z-10"
            onmousedown={(e) => handleResizeStart('left', e)}
        ></div>
        <div
            class="absolute top-1/2 -right-1 -translate-y-1/2 h-6 w-2 rounded bg-primary border border-background cursor-ew-resize z-10"
            onmousedown={(e) => handleResizeStart('right', e)}
        ></div>
    {/if}
</div>
