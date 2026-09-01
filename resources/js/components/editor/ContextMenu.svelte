<script lang="ts">
    import type { Trash2 } from 'lucide-svelte';
    import { cn } from '@/lib/utils';

    export type ContextMenuItem = {
        label: string;
        /** Any lucide-svelte icon component. */
        icon?: typeof Trash2;
        onSelect: () => void;
        destructive?: boolean;
        disabled?: boolean;
        /** Draw a divider above this item. */
        separator?: boolean;
    };

    /**
     * Right-click menu anchored at a screen position. Purely presentational:
     * the owner decides what to open it on and which actions apply. Closes on
     * any outside press, Escape, or after an item runs.
     */
    let {
        position,
        items,
        onClose,
    }: {
        position: { x: number; y: number } | null;
        items: ContextMenuItem[];
        onClose: () => void;
    } = $props();

    function run(item: ContextMenuItem) {
        if (item.disabled) return;
        onClose();
        item.onSelect();
    }

    /** Keep the menu on screen near the bottom/right edges. */
    let style = $derived.by(() => {
        if (!position) return '';
        const width = 192;
        const height = items.length * 30 + 8;
        const x = Math.min(position.x, window.innerWidth - width - 8);
        const y = Math.min(position.y, window.innerHeight - height - 8);
        return `left:${Math.max(4, x)}px;top:${Math.max(4, y)}px`;
    });
</script>

{#if position}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="fixed inset-0 z-50"
        onpointerdown={onClose}
        oncontextmenu={(e) => {
            e.preventDefault();
            onClose();
        }}
        onkeydown={(e) => e.key === 'Escape' && onClose()}
    >
        <div
            class="absolute min-w-48 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
            {style}
            role="menu"
            tabindex="-1"
            onpointerdown={(e) => e.stopPropagation()}
        >
            {#each items as item, i (item.label + i)}
                {@const Icon = item.icon}
                {#if item.separator}
                    <div class="my-1 h-px bg-border"></div>
                {/if}
                <button
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    class={cn(
                        'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs disabled:opacity-40',
                        item.destructive
                            ? 'text-destructive hover:bg-destructive/10'
                            : 'hover:bg-accent hover:text-accent-foreground',
                    )}
                    onclick={() => run(item)}
                >
                    {#if Icon}<Icon class="h-3.5 w-3.5" />{/if}
                    {item.label}
                </button>
            {/each}
        </div>
    </div>
{/if}
