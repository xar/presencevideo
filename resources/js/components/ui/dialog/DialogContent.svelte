<script lang="ts">
    import type { Snippet } from 'svelte';
    import { getContext } from 'svelte';
    import { cn } from '@/lib/utils';
    import { DIALOG_CONTEXT, type DialogContext } from './context';

    let { class: className = '', children }: { class?: string; children?: Snippet } = $props();

    const { open, setOpen } = getContext<DialogContext>(DIALOG_CONTEXT);

    const close = () => setOpen(false);

    /**
     * Move the dialog to <body>. Without this, an ancestor with `transform`,
     * `filter` or `backdrop-filter` (e.g. the sticky app header) becomes the
     * containing block for `position: fixed`, trapping the dialog inside it.
     */
    function portal(node: HTMLElement) {
        document.body.appendChild(node);

        return {
            destroy() {
                node.remove();
            },
        };
    }

    function focusFirstElement(node: HTMLElement) {
        const focusable = node.querySelector<HTMLElement>(
            'input:not([type="hidden"]), textarea, select, button:not([aria-label="Close"]), [href], [tabindex]:not([tabindex="-1"])',
        );
        focusable?.focus();
    }

    function handleKeydown(event: KeyboardEvent) {
        if (open() && event.key === 'Escape') {
            event.stopPropagation();
            close();
        }
    }

    $effect(() => {
        if (!open()) return;

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            document.body.style.overflow = previousOverflow;
        };
    });
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open()}
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4" use:portal>
        <button
            type="button"
            class="fixed inset-0 bg-black/50"
            aria-label="Close"
            onclick={close}
        ></button>
        <div
            class={cn(
                'relative z-10 max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-lg border bg-background p-6 shadow-lg',
                className,
            )}
            role="dialog"
            aria-modal="true"
            use:focusFirstElement
        >
            {@render children?.()}
        </div>
    </div>
{/if}
