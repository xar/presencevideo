<script lang="ts">
    import type { Snippet } from 'svelte';
    import AppHeaderLayout from '@/layouts/app/AppHeaderLayout.svelte';
    import AppSidebarLayout from '@/layouts/app/AppSidebarLayout.svelte';
    import type { BreadcrumbItem } from '@/types';

    let {
        breadcrumbs = [],
        variant = 'sidebar',
        children,
    }: {
        breadcrumbs?: BreadcrumbItem[];
        variant?: 'sidebar' | 'header';
        children?: Snippet;
    } = $props();
</script>

{#if variant === 'header'}
    <AppHeaderLayout {breadcrumbs}>
        {@render children?.()}
    </AppHeaderLayout>
{:else}
    <AppSidebarLayout {breadcrumbs}>
        {@render children?.()}
    </AppSidebarLayout>
{/if}
