<script lang="ts">
    import type { Snippet } from 'svelte';
    import { cn } from '@/lib/utils';

    let { class: className = '', children }: { class?: string; children?: Snippet } = $props();
</script>

<main
    data-slot="sidebar-inset"
    class={cn(
        'bg-background relative flex w-full flex-1 flex-col',
        'md:peer-data-[variant=inset]:my-3 md:peer-data-[variant=inset]:mr-3 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-[2rem] md:peer-data-[variant=inset]:shadow-xl md:peer-data-[variant=inset]:shadow-black/[0.03] md:peer-data-[variant=inset]:border-2 md:peer-data-[variant=inset]:border-border/50 md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-3 overflow-hidden transition-all duration-300',
        className,
    )}
>
    {@render children?.()}
</main>
