<script lang="ts">
    import { Loader2 } from 'lucide-svelte';
    import { uploadQueue } from '@/lib/editor/upload-queue.svelte';
</script>

{#if uploadQueue.isUploading && uploadQueue.currentItem}
    {@const item = uploadQueue.currentItem}
    <div class="flex flex-col items-center justify-center py-8 text-center">
        <Loader2 class="h-8 w-8 text-primary animate-spin" />
        <p class="mt-2 text-sm text-muted-foreground">{uploadQueue.getStatusLabel(item.status)}</p>
        <p class="mt-1 max-w-48 truncate text-xs text-muted-foreground">{item.name}</p>
        {#if item.metadata}
            <p class="mt-1 text-xs text-muted-foreground">
                {#if item.metadata.width && item.metadata.height}
                    {item.metadata.width}×{item.metadata.height} ·
                {/if}
                {#if item.metadata.durationMs}
                    {Math.round(item.metadata.durationMs / 1000)}s
                {/if}
            </p>
        {/if}
    </div>
{:else if uploadQueue.currentItem?.status === 'failed'}
    {@const item = uploadQueue.currentItem}
    <div class="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive">
        {item.error ?? 'Upload failed'}
        <button type="button" class="ml-2 underline" onclick={() => uploadQueue.dismiss(item.id)}>Dismiss</button>
    </div>
{/if}
