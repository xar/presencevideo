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

<h3 data-slot="card-title" class={cn('text-xl font-bold leading-none tracking-tight text-foreground/90', className)}>
    {@render children?.()}
</h3>
