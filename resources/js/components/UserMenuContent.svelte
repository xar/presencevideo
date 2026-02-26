<script lang="ts">
    import { Link, router } from '@inertiajs/svelte';
    import LogOut from 'lucide-svelte/icons/log-out';
    import Settings from 'lucide-svelte/icons/settings';
    import {
        DropdownMenuGroup,
        DropdownMenuItem,
        DropdownMenuLabel,
        DropdownMenuSeparator,
    } from '@/components/ui/dropdown-menu';
    import UserInfo from '@/components/UserInfo.svelte';
    import { toUrl } from '@/lib/utils';
    import { logout } from '@/routes';
    import { edit } from '@/routes/profile';
    import type { User } from '@/types';

    let {
        user,
    }: {
        user: User;
    } = $props();

    function handleLogout(propsOnClick?: (event: MouseEvent) => void) {
        return (event: MouseEvent) => {
            propsOnClick?.(event);
            router.flushAll();
        };
    }
</script>

<DropdownMenuLabel class="p-0 font-normal">
    <div class="flex items-center gap-3 px-2 py-3 text-left text-sm group transition-transform duration-300">
        <UserInfo {user} showEmail={true} />
    </div>
</DropdownMenuLabel>
<DropdownMenuSeparator class="my-1.5 bg-border/40" />
<DropdownMenuGroup>
    <DropdownMenuItem asChild>
        {#snippet children(props)}
            <Link class={props.class + ' group/item'} href={toUrl(edit())} prefetch onclick={props.onClick}>
                <div class="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 text-primary group-hover/item:bg-primary group-hover/item:text-primary-foreground transition-all duration-300 shadow-inner group-hover/item:scale-105">
                    <Settings class="size-4" />
                </div>
                <span class="ml-1 font-semibold text-foreground/90 group-hover/item:text-primary transition-colors">Settings</span>
            </Link>
        {/snippet}
    </DropdownMenuItem>
</DropdownMenuGroup>
<DropdownMenuSeparator class="my-1.5 bg-border/40" />
<DropdownMenuItem asChild>
    {#snippet children(props)}
        <Link
            class={props.class + ' group/item'}
            href={logout()}
            as="button"
            onclick={handleLogout(props.onClick)}
            data-test="logout-button"
        >
            <div class="flex items-center justify-center w-8 h-8 rounded-lg bg-destructive/10 text-destructive group-hover/item:bg-destructive group-hover/item:text-destructive-foreground transition-all duration-300 shadow-inner group-hover/item:scale-105">
                <LogOut class="size-4" />
            </div>
            <span class="ml-1 font-semibold text-foreground/90 group-hover/item:text-destructive transition-colors">Log out</span>
        </Link>
    {/snippet}
</DropdownMenuItem>
