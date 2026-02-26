<script lang="ts">
    import type { Snippet } from 'svelte';
    import { getContext } from 'svelte';
    import { cn } from '@/lib/utils';
    import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
    import { SIDEBAR_CONTEXT, type SidebarContext } from './context';

    type Size = 'default' | 'lg';
    type AsChildProps = {
        class?: string;
        [key: string]: any;
    };

    let {
        asChild = false,
        class: className = '',
        isActive = false,
        size = 'default',
        tooltip,
        children,
        ...rest
    }: {
        asChild?: boolean;
        class?: string;
        isActive?: boolean;
        size?: Size;
        tooltip?: string;
        children?: Snippet<[AsChildProps]>;
        [key: string]: unknown;
    } = $props();

    const { isMobile, state } = getContext<SidebarContext>(SIDEBAR_CONTEXT);

    const base =
        'peer/menu-button ring-sidebar-ring flex w-full items-center gap-3 overflow-hidden rounded-xl p-2.5 text-left text-sm outline-hidden transition-all duration-300 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground hover:shadow-sm hover:shadow-primary/5 focus-visible:ring-4 focus-visible:ring-primary/20 active:bg-sidebar-accent active:text-sidebar-accent-foreground active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pr-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-bold data-[active=true]:text-sidebar-accent-foreground data-[active=true]:shadow-sm data-[active=true]:shadow-primary/5 dark:data-[active=true]:shadow-black/20 data-[active=true]:ring-1 data-[active=true]:ring-primary/20 data-[state=open]:hover:bg-sidebar-accent/50 data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-[18px] [&>svg]:shrink-0';
    const sizeClasses: Record<Size, string> = {
        default: 'h-10 text-sm',
        lg: 'h-14 text-base group-data-[collapsible=icon]:p-0!',
    };

    const classes = () => {
        const activeClasses = isActive ? 'bg-sidebar-accent font-bold text-sidebar-accent-foreground shadow-sm shadow-primary/5 ring-1 ring-primary/20 scale-[1.02]' : '';
        return cn(base, sizeClasses[size], activeClasses, className);
    };
</script>

{#if tooltip}
    <Tooltip disabled={$state !== 'collapsed' || $isMobile}>
        <TooltipTrigger>
            {#snippet child({ props: triggerProps })}
                {#if asChild}
                    {@render children?.({
                        class: classes(),
                        'data-slot': 'sidebar-menu-button',
                        'data-sidebar': 'menu-button',
                        'data-size': size,
                        'data-active': isActive,
                        ...rest,
                        ...triggerProps,
                    })}
                {:else}
                    <button
                        class={classes()}
                        type="button"
                        data-slot="sidebar-menu-button"
                        data-sidebar="menu-button"
                        data-size={size}
                        data-active={isActive}
                        {...rest}
                        {...triggerProps}
                    >
                        {@render children?.({})}
                    </button>
                {/if}
            {/snippet}
        </TooltipTrigger>
        <TooltipContent side="right" align="center">
            {tooltip}
        </TooltipContent>
    </Tooltip>
{:else}
    {#if asChild}
        {@render children?.({
            class: classes(),
            'data-slot': 'sidebar-menu-button',
            'data-sidebar': 'menu-button',
            'data-size': size,
            'data-active': isActive,
            ...rest,
        })}
    {:else}
        <button
            class={classes()}
            type="button"
            data-slot="sidebar-menu-button"
            data-sidebar="menu-button"
            data-size={size}
            data-active={isActive}
            {...rest}
        >
            {@render children?.({})}
        </button>
    {/if}
{/if}
