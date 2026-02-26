<script lang="ts">
    import type { Snippet } from 'svelte';
    import { getContext } from 'svelte';
    import { cn } from '@/lib/utils';
    import { DROPDOWN_MENU_CONTEXT, type DropdownMenuContext } from './context';

    type AsChildProps = {
        class?: string;
        onClick?: (event: MouseEvent) => void;
        [key: string]: any;
    };

    let {
        asChild = false,
        class: className = '',
        children,
    }: {
        asChild?: boolean;
        class?: string;
        children?: Snippet<[AsChildProps]>;
    } = $props();

    const { setOpen } = getContext<DropdownMenuContext>(DROPDOWN_MENU_CONTEXT);

    const handleClick = () => setOpen(false);

    const classes = () =>
        cn(
            'flex w-full cursor-pointer select-none items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-all duration-300 outline-none hover:bg-muted/60 hover:text-foreground hover:shadow-sm focus:bg-muted/60 focus:text-foreground active:scale-[0.98]',
            className,
        );
</script>

{#if asChild}
    {@render children?.({ class: classes(), onClick: handleClick })}
{:else}
    <button type="button" class={classes()} onclick={handleClick}>
        {@render children?.({})}
    </button>
{/if}
