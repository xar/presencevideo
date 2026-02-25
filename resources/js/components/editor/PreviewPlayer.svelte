<script lang="ts">
    import { Button } from '@/components/ui/button';
    import { timelineStore, projectStore } from '@/lib/editor';
    import { Play, Pause, SkipBack, SkipForward, ZoomIn, ZoomOut } from 'lucide-svelte';
    import { Slider } from '@/components/ui/slider';

    let currentTime = $derived(timelineStore.currentTimeMs);
    let totalDuration = $derived(timelineStore.getTotalDuration());
    let isPlaying = $derived(timelineStore.isPlaying);
    let zoom = $derived(timelineStore.zoom);

    function zoomIn() {
        timelineStore.setZoom(zoom * 1.5);
    }

    function zoomOut() {
        timelineStore.setZoom(zoom / 1.5);
    }

    function formatTime(ms: number): string {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const milliseconds = Math.floor((ms % 1000) / 10);
        return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
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
    </div>

    <div class="text-sm font-mono text-muted-foreground w-24">
        {formatTime(currentTime)}
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
        {formatTime(totalDuration)}
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
