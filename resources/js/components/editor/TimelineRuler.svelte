<script lang="ts">
    import { timelineStore } from '@/lib/editor';
    import { formatClockTime } from '@/lib/editor/formatting';
    import TimelinePlayhead from './TimelinePlayhead.svelte';

    // Candidate major-tick intervals (ms). The smallest interval that renders
    // major ticks at least ~70px apart at the current zoom is selected.
    const TICK_INTERVALS = [100, 250, 500, 1000, 2000, 5000, 10000, 30000, 60000];
    const MIN_MAJOR_PX = 70;

    let pixelsPerMs = $derived(timelineStore.pixelsPerMs);
    let totalDuration = $derived(timelineStore.getTotalDuration());
    let timelineWidth = $derived(Math.max(totalDuration * pixelsPerMs, 1));

    let majorInterval = $derived(
        TICK_INTERVALS.find((interval) => interval * pixelsPerMs >= MIN_MAJOR_PX) ??
            TICK_INTERVALS[TICK_INTERVALS.length - 1],
    );
    let minorInterval = $derived(majorInterval / 5);

    let ticks = $derived.by(() => {
        const result: { ms: number; major: boolean }[] = [];
        if (!totalDuration || pixelsPerMs <= 0 || minorInterval <= 0) {
            return result;
        }

        const count = Math.floor(totalDuration / minorInterval);
        for (let i = 0; i <= count; i++) {
            const ms = i * minorInterval;
            result.push({ ms, major: i % 5 === 0 });
        }
        return result;
    });

    function handleTimelinePointer(e: PointerEvent) {
        if (!totalDuration) return;

        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const x = Math.max(0, Math.min(e.clientX - rect.left, timelineWidth));
        timelineStore.setCurrentTime(x / pixelsPerMs);
    }

    // Capture the pointer so scrubbing keeps tracking outside the ruler
    function handleTimelinePointerDown(e: PointerEvent) {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        handleTimelinePointer(e);
    }
</script>

<div class="flex h-6 border-b bg-muted/30 text-[10px] text-muted-foreground">
    <div class="flex w-32 shrink-0 items-center border-r bg-background px-2">
        <span class="tabular-nums">{formatClockTime(totalDuration)}</span>
    </div>
    <div class="flex-1 overflow-hidden">
        <div
            class="relative h-full cursor-ew-resize"
            style:width="{timelineWidth}px"
            onpointerdown={handleTimelinePointerDown}
            onpointermove={(e) => e.buttons === 1 && handleTimelinePointer(e)}
            role="slider"
            aria-label="Timeline ruler scrubber"
            aria-valuemin="0"
            aria-valuemax={totalDuration}
            aria-valuenow={timelineStore.currentTimeMs}
            tabindex="0"
        >
            <TimelinePlayhead showHandle />
            {#each ticks as tick (tick.ms)}
                <div
                    class="absolute bottom-0 {tick.major ? 'h-2.5 bg-muted-foreground/60' : 'h-1.5 bg-muted-foreground/30'} w-px"
                    style:left="{tick.ms * pixelsPerMs}px"
                ></div>
                {#if tick.major}
                    <span
                        class="absolute top-0 select-none tabular-nums"
                        style:left="{tick.ms * pixelsPerMs + 3}px"
                    >
                        {formatClockTime(tick.ms)}
                    </span>
                {/if}
            {/each}
        </div>
    </div>
</div>
