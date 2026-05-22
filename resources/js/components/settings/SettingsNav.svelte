<script lang="ts">
    import { Link } from '@inertiajs/svelte';
    import { Button } from '@/components/ui/button';
    import { currentUrlState } from '@/lib/currentUrl';
    import { settingsNavItems } from '@/lib/navigation';
    import { toUrl } from '@/lib/utils';

    const { currentUrl, isCurrentUrl } = currentUrlState();
</script>

<nav class="flex flex-col space-y-1 space-x-0" aria-label="Settings">
    {#each settingsNavItems as item (toUrl(item.href))}
        <Button
            variant="ghost"
            class="w-full justify-start {isCurrentUrl(item.href, $currentUrl) ? 'bg-muted' : ''}"
            asChild
        >
            {#snippet children(props)}
                <Link href={toUrl(item.href)} class={props.class}>
                    {item.title}
                </Link>
            {/snippet}
        </Button>
    {/each}
</nav>
