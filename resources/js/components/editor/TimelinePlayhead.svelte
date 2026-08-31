<script lang="ts">
    import { timelineStore } from '@/lib/editor';

    let {
        showHandle = false,
    }: {
        showHandle?: boolean;
    } = $props();

    let x = $derived(timelineStore.currentTimeMs * timelineStore.pixelsPerMs);
</script>

<!-- Visual-only marker: scrubbing is handled by the surrounding surfaces
     (ruler, empty track areas) so the playhead never blocks clip/scene
     interactions underneath it -->
<div
    class="pointer-events-none absolute inset-y-0 z-40 w-px -translate-x-1/2 bg-primary shadow-[0_0_0_1px_rgba(255,255,255,0.35)]"
    style:left="{x}px"
    aria-hidden="true"
>
    {#if showHandle}
        <div class="absolute -top-1 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 rounded-[1px] bg-primary"></div>
    {/if}
</div>
