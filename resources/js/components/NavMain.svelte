<script lang="ts">
    import { Link } from '@inertiajs/svelte';
    import {
        SidebarGroup,
        SidebarGroupLabel,
        SidebarMenu,
        SidebarMenuButton,
        SidebarMenuItem,
    } from '@/components/ui/sidebar';
    import { currentUrlState } from '@/lib/currentUrl';
    import { toUrl } from '@/lib/utils';
    import type { NavItem } from '@/types';

    let {
        items = [],
    }: {
        items: NavItem[];
    } = $props();

    const { currentUrl, isCurrentUrl } = currentUrlState();
</script>

<SidebarGroup class="px-3 py-2">
    <SidebarGroupLabel class="mb-2">Platform</SidebarGroupLabel>
    <SidebarMenu class="gap-1.5">
        {#each items as item (toUrl(item.href))}
            <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isCurrentUrl(item.href, $currentUrl)} tooltip={item.title}>
                    {#snippet children(props)}
                        <Link {...props} href={toUrl(item.href)} class={props.class}>
                            {#if item.icon}
                                <item.icon class="size-4 shrink-0" />
                            {/if}
                            <span>{item.title}</span>
                        </Link>
                    {/snippet}
                </SidebarMenuButton>
            </SidebarMenuItem>
        {/each}
    </SidebarMenu>
</SidebarGroup>
