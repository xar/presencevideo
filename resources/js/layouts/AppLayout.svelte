<script lang="ts">
    import type { Snippet } from 'svelte';
    import AppHeaderLayout from '@/layouts/app/AppHeaderLayout.svelte';
    import AppSidebarLayout from '@/layouts/app/AppSidebarLayout.svelte';
    import type { BreadcrumbItem } from '@/types';

    let {
        breadcrumbs = [],
        variant = 'sidebar',
        title,
        description,
        actions,
        children,
    }: {
        breadcrumbs?: BreadcrumbItem[];
        variant?: 'sidebar' | 'header';
        title?: string;
        description?: string;
        actions?: Snippet;
        children?: Snippet;
    } = $props();
</script>

{#if variant === 'header'}
    <AppHeaderLayout {breadcrumbs}>
        {@render children?.()}
    </AppHeaderLayout>
{:else}
    <AppSidebarLayout {breadcrumbs} {title} {description} {actions}>
        {@render children?.()}
    </AppSidebarLayout>
{/if}
