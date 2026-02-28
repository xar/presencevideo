<script lang="ts">
    import { cn } from '@/lib/utils';

    let {
        value = 0,
        max = 100,
        class: className,
        ...rest
    }: {
        value?: number;
        max?: number;
        class?: string;
        [key: string]: unknown;
    } = $props();

    let percentage = $derived(Math.min(100, Math.max(0, (value / max) * 100)));
</script>

<div
    role="progressbar"
    aria-valuemin={0}
    aria-valuemax={max}
    aria-valuenow={value}
    class={cn('relative h-2 w-full overflow-hidden rounded-full bg-primary/20', className)}
    {...rest}
>
    <div
        class="h-full bg-primary transition-all duration-300 ease-in-out"
        style="width: {percentage}%"
    ></div>
</div>
