<script lang="ts">
    import type { Snippet } from 'svelte';
    import { cn } from '@/lib/utils';

    let {
        class: className = '',
        children,
    }: {
        class?: string;
        children?: Snippet;
    } = $props();
</script>

<div
    data-slot="card-header"
    class={cn(
        '@container/card-header flex flex-col items-start gap-2 px-8 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6',
        className,
    )}
>
    {@render children?.()}
</div>
