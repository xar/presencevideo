<script lang="ts">
    import type { Snippet } from 'svelte';
    import Breadcrumbs from '@/components/Breadcrumbs.svelte';
    import { SidebarTrigger } from '@/components/ui/sidebar';
    import type { BreadcrumbItem } from '@/types';

    let {
        breadcrumbs = [],
        title,
        description,
        actions,
    }: {
        breadcrumbs?: BreadcrumbItem[];
        title?: string;
        description?: string;
        actions?: Snippet;
    } = $props();
</script>

<header
    class="sticky top-0 z-10 flex min-h-16 shrink-0 bg-background/80 backdrop-blur-md items-center justify-between gap-4 border-b border-sidebar-border/50 px-6 py-3 transition-[width,height] ease-linear md:px-4"
>
    <div class="flex min-w-0 items-center gap-3">
        <SidebarTrigger class="-ml-1 shrink-0" />
        {#if title}
            <div class="min-w-0">
                <h1 class="truncate text-lg font-semibold tracking-tight text-foreground/90">{title}</h1>
                {#if description}
                    <p class="truncate text-xs text-muted-foreground">{description}</p>
                {/if}
            </div>
        {:else if breadcrumbs && breadcrumbs.length > 0}
            <Breadcrumbs {breadcrumbs} />
        {/if}
    </div>

    {#if actions}
        <div class="flex shrink-0 items-center gap-2">
            {@render actions()}
        </div>
    {/if}
</header>
