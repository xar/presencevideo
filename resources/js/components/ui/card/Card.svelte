<script lang="ts">
    import type { Snippet } from 'svelte';
    import { cn } from '@/lib/utils';

    let {
        class: className = '',
        children,
        ...rest
    }: {
        class?: string;
        children?: Snippet;
        [key: string]: unknown;
    } = $props();
</script>

<div data-slot="card" class={cn('bg-card text-card-foreground flex flex-col gap-6 rounded-3xl border-2 border-border/50 shadow-xl shadow-black/[0.03] dark:shadow-black/20 py-8 transition-all duration-300 hover:shadow-2xl hover:shadow-primary/5 hover:border-primary/20', className)} {...rest}>
    {@render children?.()}
</div>
