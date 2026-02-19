<script lang="ts">
    import { cn } from '@/lib/utils';

    let {
        value = [0],
        min = 0,
        max = 100,
        step = 1,
        disabled = false,
        onValueChange,
        class: className,
    }: {
        value?: number[];
        min?: number;
        max?: number;
        step?: number;
        disabled?: boolean;
        onValueChange?: (value: number[]) => void;
        class?: string;
    } = $props();

    function handleInput(e: Event) {
        const target = e.target as HTMLInputElement;
        onValueChange?.([parseFloat(target.value)]);
    }

    let percentage = $derived(((value[0] - min) / (max - min)) * 100);
</script>

<div class={cn('relative flex w-full touch-none select-none items-center', className)}>
    <div class="relative h-1.5 w-full grow overflow-hidden rounded-full bg-primary/20">
        <div
            class="absolute h-full bg-primary"
            style:width="{percentage}%"
        />
    </div>
    <input
        type="range"
        {min}
        {max}
        {step}
        {disabled}
        value={value[0]}
        oninput={handleInput}
        class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
    />
    <div
        class="absolute h-4 w-4 rounded-full border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        style:left="calc({percentage}% - 8px)"
    />
</div>
