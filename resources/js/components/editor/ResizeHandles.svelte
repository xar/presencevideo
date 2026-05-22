<script lang="ts">
    export type ResizeHandle = 'top-left' | 'top' | 'top-right' | 'right' | 'bottom-right' | 'bottom' | 'bottom-left' | 'left';

    let {
        handles = ['top-left', 'top', 'top-right', 'right', 'bottom-right', 'bottom', 'bottom-left', 'left'],
        onStart,
    }: {
        handles?: ResizeHandle[];
        onStart: (handle: ResizeHandle, event: MouseEvent) => void;
    } = $props();

    const classes: Record<ResizeHandle, string> = {
        'top-left': 'absolute -top-1.5 -left-1.5 h-3 w-3 rounded-full bg-primary border-2 border-background cursor-nwse-resize z-10',
        top: 'absolute -top-1 left-1/2 -translate-x-1/2 h-2 w-6 rounded bg-primary border border-background cursor-ns-resize z-10',
        'top-right': 'absolute -top-1.5 -right-1.5 h-3 w-3 rounded-full bg-primary border-2 border-background cursor-nesw-resize z-10',
        right: 'absolute top-1/2 -right-1 -translate-y-1/2 h-6 w-2 rounded bg-primary border border-background cursor-ew-resize z-10',
        'bottom-right': 'absolute -bottom-1.5 -right-1.5 h-3 w-3 rounded-full bg-primary border-2 border-background cursor-nwse-resize z-10',
        bottom: 'absolute -bottom-1 left-1/2 -translate-x-1/2 h-2 w-6 rounded bg-primary border border-background cursor-ns-resize z-10',
        'bottom-left': 'absolute -bottom-1.5 -left-1.5 h-3 w-3 rounded-full bg-primary border-2 border-background cursor-nesw-resize z-10',
        left: 'absolute top-1/2 -left-1 -translate-y-1/2 h-6 w-2 rounded bg-primary border border-background cursor-ew-resize z-10',
    };
</script>

{#each handles as handle}
    <button
        type="button"
        class={classes[handle]}
        aria-label="Resize {handle}"
        onmousedown={(event) => onStart(handle, event)}
    ></button>
{/each}
