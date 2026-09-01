<script lang="ts">
    import { Music } from 'lucide-svelte';
    import { onDestroy } from 'svelte';
    import AudioWaveform from '@/components/editor/AudioWaveform.svelte';
    import { projectStore, timelineStore } from '@/lib/editor';
    import { collectSnapPoints } from '@/lib/editor/snapping';
    import { useTimelineGesture } from '@/lib/editor/useTimelineGesture.svelte';
    import { cn } from '@/lib/utils';
    import type { AudioClip as AudioClipType } from '@/types';

    let {
        clip,
        pixelsPerMs,
        isSelected = false,
        onclick,
        onUpdate,
    }: {
        clip: AudioClipType;
        pixelsPerMs: number;
        isSelected?: boolean;
        onclick?: () => void;
        onUpdate?: (updates: Partial<AudioClipType>) => void;
    } = $props();

    const gesture = useTimelineGesture({
        getSpan: () => clip,
        pixelsPerMs: () => pixelsPerMs,
        snapPoints: () =>
            collectSnapPoints(projectStore.project, {
                excludeAudioClipId: clip.id,
                playheadMs: timelineStore.currentTimeMs,
            }),
        onUpdate: (updates) => onUpdate?.(updates),
    });

    onDestroy(gesture.cleanup);

    let clipWidth = $derived(clip.duration_ms * pixelsPerMs);
    let fadeInWidth = $derived(
        Math.min(clipWidth, (clip.fade_in_ms ?? 0) * pixelsPerMs),
    );
    let fadeOutWidth = $derived(
        Math.min(clipWidth - fadeInWidth, (clip.fade_out_ms ?? 0) * pixelsPerMs),
    );

    function getAssetName(): string {
        const assets = projectStore.project?.assets ?? [];
        const asset = assets.find((a) => a.id === clip.asset_id);
        return asset?.name ?? 'Audio';
    }

    function getAssetUrl(): string | null {
        const assets = projectStore.project?.assets ?? [];
        const asset = assets.find((a) => a.id === clip.asset_id);
        return asset?.url ?? null;
    }
</script>

<div
    class={cn(
        'absolute top-1 h-[calc(100%-8px)] rounded cursor-move',
        isSelected
            ? 'bg-primary/80 ring-2 ring-primary'
            : 'bg-primary/60 hover:bg-primary/70'
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
    <AudioWaveform url={getAssetUrl()} />

    <div class="relative flex h-full items-center gap-1 px-2 overflow-hidden">
        <Music class="h-3 w-3 flex-shrink-0 text-primary-foreground drop-shadow" />
        <span class="text-xs text-primary-foreground truncate drop-shadow">{getAssetName()}</span>
    </div>

    <!-- Fade ramps (decorative): shaded wedges at the clip edges -->
    {#if fadeInWidth > 0}
        <div
            class="pointer-events-none absolute left-0 top-0 bottom-0 bg-background/60"
            style:width="{fadeInWidth}px"
            style:clip-path="polygon(0 0, 100% 0, 0 100%)"
        ></div>
    {/if}
    {#if fadeOutWidth > 0}
        <div
            class="pointer-events-none absolute right-0 top-0 bottom-0 bg-background/60"
            style:width="{fadeOutWidth}px"
            style:clip-path="polygon(100% 0, 100% 100%, 0 0)"
        ></div>
    {/if}

    {#if isSelected}
        <div
            class="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize bg-white/50 rounded-l"
            onpointerdown={(event) => gesture.startTrim('start', event)}
            role="presentation"
        ></div>
        <div
            class="absolute right-0 top-0 bottom-0 w-1 cursor-ew-resize bg-white/50 rounded-r"
            onpointerdown={(event) => gesture.startTrim('end', event)}
            role="presentation"
        ></div>
    {/if}
</div>
