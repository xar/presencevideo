<script lang="ts">
    import { Link, page } from '@inertiajs/svelte';
    import MessageCircle from 'lucide-svelte/icons/message-circle';
    import {
        SidebarGroup,
        SidebarGroupLabel,
        SidebarMenu,
        SidebarMenuButton,
        SidebarMenuItem,
    } from '@/components/ui/sidebar';
    import { currentUrlState } from '@/lib/currentUrl';
    import { toUrl } from '@/lib/utils';
    import agent from '@/routes/agent';
    import type { NavItem } from '@/types';

    let {
        items = [],
    }: {
        items: NavItem[];
    } = $props();

    const { currentUrl, isCurrentUrl } = currentUrlState();
    const conversations = $derived($page.props.agentConversations ?? []);

    function conversationTitle(title: string | null): string {
        return title || 'Untitled chat';
    }
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

    <div class="my-4 h-px bg-border/70"></div>

    <SidebarGroupLabel class="mb-2">Recents</SidebarGroupLabel>
    <SidebarMenu class="gap-1.5">
        {#if conversations.length === 0}
            <SidebarMenuItem>
                <div class="rounded-xl px-2.5 py-2 text-xs leading-5 text-muted-foreground group-data-[collapsible=icon]:hidden">
                    No chats yet.
                </div>
            </SidebarMenuItem>
        {:else}
            {#each conversations as conversation (conversation.id)}
                <SidebarMenuItem>
                    <SidebarMenuButton
                        asChild
                        isActive={isCurrentUrl(agent.chat.show(conversation.id), $currentUrl)}
                        tooltip={conversationTitle(conversation.title)}
                    >
                        {#snippet children(props)}
                            <Link {...props} href={agent.chat.show(conversation.id).url} class={props.class}>
                                <MessageCircle class="size-4 shrink-0" />
                                <span>{conversationTitle(conversation.title)}</span>
                            </Link>
                        {/snippet}
                    </SidebarMenuButton>
                </SidebarMenuItem>
            {/each}
        {/if}
    </SidebarMenu>
</SidebarGroup>
