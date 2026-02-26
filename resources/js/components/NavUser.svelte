<script lang="ts">
    import { page } from '@inertiajs/svelte';
    import ChevronsUpDown from 'lucide-svelte/icons/chevrons-up-down';
    import {
        DropdownMenu,
        DropdownMenuContent,
        DropdownMenuTrigger,
    } from '@/components/ui/dropdown-menu';
    import {
        SidebarMenu,
        SidebarMenuButton,
        SidebarMenuItem,
        useSidebar,
    } from '@/components/ui/sidebar';
    import UserInfo from '@/components/UserInfo.svelte';
    import UserMenuContent from '@/components/UserMenuContent.svelte';

    const user = $derived($page.props.auth.user);
    const { isMobile, state: sidebarState } = useSidebar();
</script>

<SidebarMenu>
    <SidebarMenuItem>
        <DropdownMenu class="w-full">
            <DropdownMenuTrigger asChild>
                {#snippet children(props)}
                    <SidebarMenuButton
                        size="lg"
                        class="data-[state=open]:bg-sidebar-accent/50 data-[state=open]:text-sidebar-accent-foreground group py-3 bg-card shadow-sm shadow-black/[0.02] border border-border/50 transition-all duration-300 hover:shadow-md hover:shadow-primary/5 hover:border-primary/20 hover:-translate-y-0.5"
                        data-test="sidebar-menu-button"
                        onclick={props.onclick}
                        aria-expanded={props['aria-expanded']}
                        data-state={props['data-state']}
                    >
                        <UserInfo {user} />
                        <ChevronsUpDown class="ml-auto size-4 text-muted-foreground/50 group-hover:text-primary transition-colors duration-300" />
                    </SidebarMenuButton>
                {/snippet}
            </DropdownMenuTrigger>
            <DropdownMenuContent
                class="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-2xl border-2 border-border/50 bg-background/95 backdrop-blur-xl p-2.5 shadow-2xl shadow-primary/5 dark:shadow-black/30"
                side={$sidebarState === 'collapsed' && !$isMobile ? 'left' : 'top'}
                align="end"
                sideOffset={12}
            >
                <UserMenuContent {user} />
            </DropdownMenuContent>
        </DropdownMenu>
    </SidebarMenuItem>
</SidebarMenu>
