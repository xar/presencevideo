<script lang="ts">
    import { Sparkles } from 'lucide-svelte';
    import { Badge } from '@/components/ui/badge';
    import type { TrendCategory, TrendFormat } from '@/lib/agent/trend-formats';
    import {
        TREND_CATEGORY_LABELS,
        formatDurationLabel,
        trendCategories,
        trendFormatsByCategory
    } from '@/lib/agent/trend-formats';

    let {
        onpick
    }: {
        /** Called with the format's brief so the composer can be prefilled. */
        onpick: (format: TrendFormat) => void;
    } = $props();

    let category = $state<TrendCategory | 'all'>('all');

    const categories = trendCategories();
    const formats = $derived(trendFormatsByCategory(category));
</script>

<div class="mx-auto flex min-h-full max-w-3xl flex-col items-center justify-center py-6 text-center">
    <div class="mb-5 flex size-14 items-center justify-center rounded-3xl bg-primary/10 text-primary shadow-inner">
        <Sparkles class="size-7" />
    </div>
    <h2 class="text-3xl font-black tracking-tight">What should we create?</h2>
    <p class="mt-3 max-w-xl text-sm text-muted-foreground">
        Describe the video you want, or start from a format that is working on short-form right now. Every one of
        these is a beat structure, not a trending sound — pick one and fill in the bracketed part.
    </p>

    <div class="mt-6 flex flex-wrap items-center justify-center gap-2">
        <button
            type="button"
            onclick={() => (category = 'all')}
            class="rounded-full border px-3 py-1.5 text-xs font-medium transition-colors {category === 'all'
                ? 'border-transparent bg-primary text-primary-foreground'
                : 'border-border/70 text-muted-foreground hover:bg-accent hover:text-accent-foreground'}"
        >
            Popular
        </button>
        {#each categories as value (value)}
            <button
                type="button"
                onclick={() => (category = value)}
                class="rounded-full border px-3 py-1.5 text-xs font-medium transition-colors {category === value
                    ? 'border-transparent bg-primary text-primary-foreground'
                    : 'border-border/70 text-muted-foreground hover:bg-accent hover:text-accent-foreground'}"
            >
                {TREND_CATEGORY_LABELS[value]}
            </button>
        {/each}
    </div>

    <div class="mt-5 grid w-full gap-3 sm:grid-cols-2">
        {#each formats as format (format.id)}
            <button
                type="button"
                onclick={() => onpick(format)}
                title={format.whyItWorks}
                class="group flex h-full flex-col rounded-2xl border border-border/60 bg-background p-4 text-left transition-all hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            >
                <div class="flex items-start justify-between gap-2">
                    <span class="text-sm font-semibold group-hover:text-primary">{format.name}</span>
                    <Badge variant="secondary" class="shrink-0">{formatDurationLabel(format)}</Badge>
                </div>
                <p class="mt-1.5 text-xs leading-relaxed text-muted-foreground">{format.description}</p>
                <div class="mt-3 flex flex-wrap gap-1">
                    {#each format.beats as beat (beat.label)}
                        <span class="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {beat.label}
                        </span>
                    {/each}
                </div>
            </button>
        {/each}
    </div>
</div>
