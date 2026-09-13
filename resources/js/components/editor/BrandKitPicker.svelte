<script lang="ts">
    import { page } from '@inertiajs/svelte';
    import { Palette } from 'lucide-svelte';
    import { Button } from '@/components/ui/button';
    import {
        DropdownMenu,
        DropdownMenuContent,
        DropdownMenuItem,
        DropdownMenuLabel,
        DropdownMenuSeparator,
        DropdownMenuTrigger,
    } from '@/components/ui/dropdown-menu';
    import { projectStore } from '@/lib/editor';
    import type { BrandKit } from '@/types';

    /**
     * Attach a brand kit to the project. The kits come from the editor page's
     * `brandKits` prop; the choice is saved with the project as
     * `brand_kit_id` and takes effect on the canvas immediately because
     * `resolveFrame()` resolves tokens against `project.brand_kit`.
     */
    let { brandKits = [] }: { brandKits?: BrandKit[] } = $props();

    // Prefer the prop; fall back to the page props so the picker also works
    // where the toolbar is rendered without one.
    let kits = $derived(
        brandKits.length > 0 ? brandKits : ((($page.props as { brandKits?: BrandKit[] }).brandKits ?? []) as BrandKit[]),
    );
    let current = $derived(projectStore.project?.brand_kit ?? null);

    function swatches(kit: BrandKit): string[] {
        return [kit.colors?.primary, kit.colors?.accent, kit.colors?.background]
            .filter((color): color is string => typeof color === 'string' && color !== '');
    }
</script>

<DropdownMenu>
    <DropdownMenuTrigger asChild>
        {#snippet children(props)}
            <Button {...props} variant="ghost" size="sm" class="gap-2" title="Brand kit">
                <Palette class="h-4 w-4" />
                <span class="max-w-32 truncate text-xs">{current?.name ?? 'No brand kit'}</span>
                {#if current}
                    <span class="flex gap-0.5">
                        {#each swatches(current) as color (color)}
                            <span class="h-3 w-3 rounded-sm border" style:background={color}></span>
                        {/each}
                    </span>
                {/if}
            </Button>
        {/snippet}
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-64">
        <DropdownMenuLabel>Brand kit</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {#if kits.length === 0}
            <p class="px-2 py-1.5 text-xs text-muted-foreground">No brand kits yet.</p>
        {/if}
        {#each kits as kit (kit.id)}
            <DropdownMenuItem asChild>
                {#snippet children(props)}
                    <button
                        type="button"
                        class="{props.class} {current?.id === kit.id ? 'bg-muted/60' : ''}"
                        onclick={(e: MouseEvent) => { props.onClick?.(e); projectStore.setBrandKit(kit); }}
                    >
                        <span class="flex-1 truncate text-left">{kit.name}</span>
                        <span class="flex gap-0.5">
                            {#each swatches(kit) as color (color)}
                                <span class="h-3 w-3 rounded-sm border" style:background={color}></span>
                            {/each}
                        </span>
                    </button>
                {/snippet}
            </DropdownMenuItem>
        {/each}
        {#if current}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
                {#snippet children(props)}
                    <button
                        type="button"
                        class={props.class}
                        onclick={(e: MouseEvent) => { props.onClick?.(e); projectStore.setBrandKit(null); }}
                    >
                        Detach brand kit
                    </button>
                {/snippet}
            </DropdownMenuItem>
        {/if}
    </DropdownMenuContent>
</DropdownMenu>
