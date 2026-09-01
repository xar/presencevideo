<script lang="ts">
    import { Play, Pause, SkipBack, SkipForward, ZoomIn, ZoomOut, Gauge } from 'lucide-svelte';
    import { Button } from '@/components/ui/button';
    import { Slider } from '@/components/ui/slider';
    import {
        DropdownMenu,
        DropdownMenuContent,
        DropdownMenuItem,
        DropdownMenuLabel,
        DropdownMenuTrigger,
    } from '@/components/ui/dropdown-menu';
    import { timelineStore, projectStore } from '@/lib/editor';
    import { formatTimelineTime } from '@/lib/editor/formatting';

    const PLAYBACK_RATES = [0.25, 0.5, 1, 1.5, 2];

    let currentTime = $derived(timelineStore.currentTimeMs);
    let totalDuration = $derived(timelineStore.getTotalDuration());
    let isPlaying = $derived(timelineStore.isPlaying);
    let zoom = $derived(timelineStore.zoom);
    let playbackRate = $derived(timelineStore.playbackRate);

    function zoomIn() {
        timelineStore.setZoom(zoom * 1.5);
    }

    function zoomOut() {
        timelineStore.setZoom(zoom / 1.5);
    }

    function handleSliderChange(value: number[]) {
        timelineStore.setCurrentTime(value[0]);
    }

    function skipBackward() {
        const currentIndex = timelineStore.getCurrentSceneIndex();
        if (currentIndex > 0) {
            timelineStore.seekToScene(currentIndex - 1);
        } else {
            timelineStore.setCurrentTime(0);
        }
    }

    function skipForward() {
        const scenes = projectStore.project?.scenes ?? [];
        const currentIndex = timelineStore.getCurrentSceneIndex();
        if (currentIndex < scenes.length - 1) {
            timelineStore.seekToScene(currentIndex + 1);
        }
    }
</script>

<div class="flex h-14 items-center gap-4 border-t bg-background px-4">
    <div class="flex items-center gap-1">
        <Button variant="ghost" size="icon" onclick={skipBackward}>
            <SkipBack class="h-4 w-4" />
        </Button>

        <Button
            variant="ghost"
            size="icon"
            onclick={() => timelineStore.togglePlayback()}
        >
            {#if isPlaying}
                <Pause class="h-4 w-4" />
            {:else}
                <Play class="h-4 w-4" />
            {/if}
        </Button>

        <Button variant="ghost" size="icon" onclick={skipForward}>
            <SkipForward class="h-4 w-4" />
        </Button>

        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                {#snippet children(props)}
                    <Button
                        {...props}
                        variant="ghost"
                        size="sm"
                        class="gap-1.5 px-2 text-xs font-medium tabular-nums"
                        title="Preview playback speed"
                    >
                        <Gauge class="h-4 w-4" />
                        {#if playbackRate !== 1}
                            {playbackRate}×
                        {/if}
                    </Button>
                {/snippet}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={4} class="w-40">
                <DropdownMenuLabel>Preview speed</DropdownMenuLabel>
                {#each PLAYBACK_RATES as rate (rate)}
                    <DropdownMenuItem asChild>
                        {#snippet children(props)}
                            <button
                                type="button"
                                class="{props.class} {playbackRate === rate ? 'bg-muted/60' : ''}"
                                onclick={(e: MouseEvent) => {
                                    props.onClick?.(e);
                                    timelineStore.setPlaybackRate(rate);
                                }}
                            >
                                <span class="flex-1 tabular-nums">{rate}×</span>
                                {#if rate === 1}
                                    <span class="text-xs text-muted-foreground">Normal</span>
                                {/if}
                            </button>
                        {/snippet}
                    </DropdownMenuItem>
                {/each}
            </DropdownMenuContent>
        </DropdownMenu>
    </div>

    <div class="text-sm font-mono text-muted-foreground w-24">
        {formatTimelineTime(currentTime)}
    </div>

    <div class="flex-1">
        <Slider
            value={[currentTime]}
            max={totalDuration || 1}
            step={10}
            onValueChange={handleSliderChange}
        />
    </div>

    <div class="text-sm font-mono text-muted-foreground w-24 text-right">
        {formatTimelineTime(totalDuration)}
    </div>

    <div class="flex items-center gap-1 border-l pl-4 ml-2">
        <Button variant="ghost" size="icon" onclick={zoomOut} title="Zoom out timeline">
            <ZoomOut class="h-4 w-4" />
        </Button>
        <span class="text-xs font-mono text-muted-foreground w-10 text-center">
            {Math.round(zoom * 100)}%
        </span>
        <Button variant="ghost" size="icon" onclick={zoomIn} title="Zoom in timeline">
            <ZoomIn class="h-4 w-4" />
        </Button>
    </div>
</div>
