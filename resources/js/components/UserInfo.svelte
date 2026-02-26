<script lang="ts">
    import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
    import { getInitials } from '@/lib/initials';
    import type { User } from '@/types';

    let {
        user,
        showEmail = false,
    }: {
        user: User;
        showEmail?: boolean;
    } = $props();

    const showAvatar = $derived(user.avatar && user.avatar !== '');
</script>

<Avatar class="h-9 w-9 overflow-hidden rounded-xl shadow-md shadow-primary/10 border border-primary/10 group-hover:scale-105 group-hover:shadow-primary/20 transition-all duration-300">
    {#if showAvatar}
        <AvatarImage src={user.avatar!} alt={user.name} />
    {/if}
    <AvatarFallback class="rounded-lg text-black dark:text-white">
        {getInitials(user.name)}
    </AvatarFallback>
</Avatar>

<div class="grid flex-1 text-left text-sm leading-tight transition-transform duration-300 group-hover:translate-x-0.5">
    <span class="truncate font-bold text-foreground/90 group-hover:text-primary transition-colors">{user.name}</span>
    {#if showEmail}
        <span class="truncate text-xs font-medium text-muted-foreground/70 group-hover:text-primary/70 transition-colors">{user.email}</span>
    {/if}
</div>
