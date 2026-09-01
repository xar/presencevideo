<script lang="ts">
    import { Film, Type, Image, Shapes } from 'lucide-svelte';
    import { onDestroy } from 'svelte';

    import { projectStore, timelineStore } from '@/lib/editor';
    import { cssPaintColor } from '@/lib/editor/clip-effects';
    import { getCachedFramePreviewUrl } from '@/lib/editor/media-cache';
    import { collectSnapPoints } from '@/lib/editor/snapping';
    import type { GesturePoint } from '@/lib/editor/usePointerGesture.svelte';
    import { useTimelineGesture } from '@/lib/editor/useTimelineGesture.svelte';
    import { cn } from '@/lib/utils';
    import type { VideoClip as VideoClipType } from '@/types';

    let {
        clip,
        pixelsPerMs,
        isSelected = false,
        onclick,
        onUpdate,
        onDragMove,
        onDragEnd,
    }: {
        clip: VideoClipType;
        pixelsPerMs: number;
        isSelected?: boolean;
        onclick?: () => void;
        onUpdate?: (updates: Partial<VideoClipType>) => void;
        /** Pointer position while the clip body is being dragged (not while trimming). */
        onDragMove?: (point: GesturePoint) => void;
        /** Fired on release of a body drag, inside the same undo step as the drag. */
        onDragEnd?: (point: GesturePoint | null) => void;
    } = $props();

    const gesture = useTimelineGesture({
        getSpan: () => clip,
        pixelsPerMs: () => pixelsPerMs,
        snapPoints: () =>
            collectSnapPoints(projectStore.project, {
                excludeVideoClipId: clip.id,
                playheadMs: timelineStore.currentTimeMs,
            }),
        onUpdate: (updates) => onUpdate?.(updates),
        onMove: (point, kind) => {
            if (kind === 'move') onDragMove?.(point);
        },
        onEnd: (point, kind) => {
            if (kind === 'move') onDragEnd?.(point);
        },
    });

    onDestroy(gesture.cleanup);

    let clipType = $derived(clip.type);

    let asset = $derived.by(() => {
        if (clip.type !== 'video' && clip.type !== 'image') return undefined;
        return (projectStore.project?.assets ?? []).find((a) => a.id === clip.asset_id);
    });

    let label = $derived.by(() => {
        switch (clip.type) {
            case 'text':
                return clip.text || 'Text Overlay';
            case 'shape': {
                const shape = clip.shape ?? 'rectangle';
                return shape.charAt(0).toUpperCase() + shape.slice(1);
            }
            case 'image':
                return asset?.name ?? 'Image';
            default:
                return asset?.name ?? 'Video';
        }
    });

    // Stills have no separate thumbnail; the asset itself is the preview.
    let thumbnailUrl = $derived(
        clip.type === 'image' ? (asset?.thumbnail_url ?? asset?.url ?? null) : (asset?.thumbnail_url ?? null),
    );

    function getVideoAssetUrl(): string | null {
        return clip.type === 'video' ? (asset?.url ?? null) : null;
    }

    // Filmstrip: sample evenly-spaced frames across the clip's media range.
    let clipWidthPx = $derived(clip.duration_ms * pixelsPerMs);
    let frameCount = $derived(
        clipType !== 'video' ? 0 : Math.min(10, Math.max(1, Math.floor(clipWidthPx / 80))),
    );

    let filmstripUrls = $state<(string | null)[]>([]);
    let lastFilmstripKey = '';

    // Load frames lazily. Skipped while a gesture runs (recomputes on release)
    // and keyed by asset url + frame count + trim + duration to avoid refetching
    // on every reactive tick.
    $effect(() => {
        if (gesture.active) return;
        if (clipType !== 'video') {
            filmstripUrls = [];
            return;
        }

        const url = getVideoAssetUrl();
        const n = frameCount;
        const trim = clip.type === 'video' ? (clip.trim_start_ms ?? 0) : 0;
        const duration = clip.duration_ms;

        if (!url || n <= 0) {
            filmstripUrls = [];
            lastFilmstripKey = '';
            return;
        }

        const key = `${url}:${n}:${trim}:${duration}`;
        if (key === lastFilmstripKey) return;
        lastFilmstripKey = key;

        Promise.all(
            Array.from({ length: n }, (_, i) => {
                const timeSec = (trim + ((i + 0.5) / n) * duration) / 1000;
                return getCachedFramePreviewUrl(url, timeSec).catch(() => null);
            }),
        ).then((urls) => {
            if (lastFilmstripKey === key) {
                filmstripUrls = urls;
            }
        });
    });
</script>

<div
    class={cn(
        'group absolute top-1 h-[calc(100%-8px)] rounded cursor-move overflow-hidden',
        isSelected
            ? 'ring-2 ring-primary'
            : 'ring-1 ring-border hover:ring-primary/50'
    )}
    style:left="{clip.start_ms * pixelsPerMs}px"
    style:width="{clip.duration_ms * pixelsPerMs}px"
    data-clip-id={clip.id}
    onpointerdown={gesture.startMove}
    onclick={onclick}
    onkeydown={() => {}}
    role="button"
    tabindex="0"
>
    {#if clipType === 'text'}
        <div class="absolute inset-0 bg-amber-500/85"></div>
    {:else if clipType === 'shape'}
        <div class="absolute inset-0 bg-emerald-600/80"></div>
        <div
            class="absolute top-1.5 bottom-1.5 right-2 w-8 border border-white/70"
            style:background-color={cssPaintColor(clip.type === 'shape' ? clip.fill_color : undefined)}
            style:border-radius={clip.type === 'shape' && clip.shape === 'ellipse' ? '50%' : '2px'}
        ></div>
    {:else if filmstripUrls.length > 0}
        <div class="absolute inset-0 flex bg-violet-600/80">
            {#each filmstripUrls as frameUrl, i (i)}
                <div
                    class="h-full min-w-0 flex-1 border-r border-black/20 bg-cover bg-center last:border-r-0"
                    style:background-image={frameUrl ? `url(${frameUrl})` : undefined}
                ></div>
            {/each}
        </div>
        <div class="absolute inset-0 bg-gradient-to-r from-black/40 to-transparent"></div>
    {:else if thumbnailUrl}
        <img
            src={thumbnailUrl}
            alt=""
            class="absolute inset-0 h-full w-full object-cover"
        />
        <div class="absolute inset-0 bg-gradient-to-r from-black/40 to-transparent"></div>
    {:else}
        <div class="absolute inset-0 bg-violet-600/80"></div>
    {/if}

    <div class="relative flex h-full items-center gap-1 px-2 overflow-hidden">
        {#if clipType === 'text'}
            <Type class="h-3 w-3 flex-shrink-0 text-white" />
        {:else if clipType === 'shape'}
            <Shapes class="h-3 w-3 flex-shrink-0 text-white" />
        {:else if clipType === 'image'}
            <Image class="h-3 w-3 flex-shrink-0 text-white" />
        {:else}
            <Film class="h-3 w-3 flex-shrink-0 text-white" />
        {/if}
        <span class="text-xs text-white truncate font-medium drop-shadow">{label}</span>
    </div>

    <button
        type="button"
        class="absolute top-0 -left-1 bottom-0 z-10 flex w-3 cursor-ew-resize items-center justify-center opacity-0 transition-opacity group-hover:opacity-100"
        aria-label="Resize clip left"
        onpointerdown={(event) => gesture.startTrim('start', event)}
    >
        <span class="h-8 w-1 rounded-full bg-white/90 shadow"></span>
    </button>
    <button
        type="button"
        class="absolute top-0 -right-1 bottom-0 z-10 flex w-3 cursor-ew-resize items-center justify-center opacity-0 transition-opacity group-hover:opacity-100"
        aria-label="Resize clip right"
        onpointerdown={(event) => gesture.startTrim('end', event)}
    >
        <span class="h-8 w-1 rounded-full bg-white/90 shadow"></span>
    </button>
</div>
