<script lang="ts">
    import type { Scene } from '@/types';
    import { cn } from '@/lib/utils';
    import { Video } from 'lucide-svelte';

    let {
        scene,
        index,
        isSelected = false,
        onclick,
    }: {
        scene: Scene;
        index: number;
        isSelected?: boolean;
        onclick?: () => void;
    } = $props();

    function formatDuration(ms: number): string {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
</script>

<button
    type="button"
    class={cn(
        'group relative flex h-16 w-24 flex-col items-center justify-center rounded-md border bg-background transition-all',
        isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-primary/50'
    )}
    {onclick}
>
    {#if scene.thumbnail_url}
        <img
            src={scene.thumbnail_url}
            alt={scene.name ?? `Scene ${index + 1}`}
            class="absolute inset-0 h-full w-full rounded-md object-cover"
        />
    {:else}
        <div
            class="absolute inset-0 rounded-md"
            style:background-color={scene.background_color ?? '#000'}
        >
            {#if scene.layers.length === 0}
                <div class="flex h-full items-center justify-center">
                    <Video class="h-6 w-6 text-muted-foreground/30" />
                </div>
            {/if}
        </div>
    {/if}

    <div class="absolute inset-x-0 bottom-0 rounded-b-md bg-black/60 px-1 py-0.5">
        <div class="flex items-center justify-between text-[10px] text-white">
            <span class="truncate">{scene.name ?? `Scene ${index + 1}`}</span>
            <span class="text-white/70">{formatDuration(scene.duration_ms)}</span>
        </div>
    </div>

    <div class="absolute -top-1 -left-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
        {index + 1}
    </div>
</button>
