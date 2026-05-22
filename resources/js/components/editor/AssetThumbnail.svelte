<script lang="ts">
    import { Image, Music, Video } from 'lucide-svelte';
    import type { Asset } from '@/types';

    let {
        asset,
    }: {
        asset: Asset;
    } = $props();

    let imageLoadFailed = $state(false);

    let thumbnailUrl = $derived.by(() => {
        if (asset.thumbnail_url && !imageLoadFailed) {
            return asset.thumbnail_url;
        }

        if (imageLoadFailed) {
            return asset.url ?? null;
        }

        return asset.type === 'image' ? (asset.url ?? null) : null;
    });

    $effect(() => {
        asset.thumbnail_url;
        asset.url;
        imageLoadFailed = false;
    });
</script>

{#if asset.type === 'audio'}
    <div class="flex h-full w-full items-center justify-center pointer-events-none">
        <Music class="h-6 w-6 text-muted-foreground" />
    </div>
{:else if thumbnailUrl}
    <img
        src={thumbnailUrl}
        alt={asset.name}
        class="h-full w-full object-cover pointer-events-none"
        onerror={() => {
            imageLoadFailed = true;
        }}
    />
{:else}
    <div class="flex h-full w-full items-center justify-center pointer-events-none">
        {#if asset.type === 'video'}
            <Video class="h-6 w-6 text-muted-foreground" />
        {:else}
            <Image class="h-6 w-6 text-muted-foreground" />
        {/if}
    </div>
{/if}
