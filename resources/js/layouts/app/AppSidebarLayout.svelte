<script lang="ts">
    import type { Snippet } from 'svelte';
    import AppContent from '@/components/AppContent.svelte';
    import AppShell from '@/components/AppShell.svelte';
    import AppSidebar from '@/components/AppSidebar.svelte';
    import AppSidebarHeader from '@/components/AppSidebarHeader.svelte';
    import type { BreadcrumbItem } from '@/types';

    let {
        breadcrumbs = [],
        title,
        description,
        actions,
        children,
    }: {
        breadcrumbs?: BreadcrumbItem[];
        title?: string;
        description?: string;
        actions?: Snippet;
        children?: Snippet;
    } = $props();
</script>

<AppShell variant="sidebar">
    <AppSidebar />
    <AppContent variant="sidebar" class="overflow-x-hidden">
        <AppSidebarHeader {breadcrumbs} {title} {description} {actions} />
        {@render children?.()}
    </AppContent>
</AppShell>
