<script lang="ts">
    import { getCachedWaveform } from '@/lib/editor/media-cache';
    import { editorFeatures, mediaLimits } from '@/lib/editor/editor-features';

    let {
        url,
        bars = mediaLimits.waveformBars,
    }: {
        url: string | null;
        bars?: number;
    } = $props();

    let waveform = $state<number[] | null>(null);
    let waveformKey = $state<string | null>(null);

    $effect(() => {
        if (!url || !editorFeatures.audioWaveforms) {
            waveform = null;
            waveformKey = null;
            return;
        }

        const key = `${url}:${bars}`;
        if (waveformKey === key) return;

        waveformKey = key;
        waveform = null;

        getCachedWaveform(url, bars)
            .then((peaks) => {
                if (waveformKey === key) {
                    waveform = peaks;
                }
            })
            .catch(() => {
                if (waveformKey === key) {
                    waveform = null;
                }
            });
    });
</script>

{#if waveform}
    <div class="absolute inset-x-2 inset-y-1 flex items-center gap-px opacity-70 pointer-events-none">
        {#each waveform as peak}
            <div
                class="flex-1 rounded-full bg-primary-foreground/80"
                style:height="{Math.max(10, peak * 100)}%"
            ></div>
        {/each}
    </div>
{/if}
