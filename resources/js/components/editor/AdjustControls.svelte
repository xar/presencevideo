<script lang="ts">
    import { RotateCcw, SlidersHorizontal } from 'lucide-svelte';
    import { Button } from '@/components/ui/button';
    import { Label } from '@/components/ui/label';
    import { Slider } from '@/components/ui/slider';
    import { NEUTRAL_ADJUSTMENTS, isNeutralAdjustments, resolveAdjustments } from '@/lib/editor/clip-effects';
    import type { LayerAdjustments } from '@/types';

    let {
        adjustments,
        onChange,
    }: {
        adjustments: LayerAdjustments | undefined;
        onChange: (adjustments: LayerAdjustments) => void;
    } = $props();

    let current = $derived(resolveAdjustments(adjustments));

    /**
     * Sliders work in CapCut's integer scale; values are stored on ffmpeg's
     * `eq` scale (brightness -1..1, contrast/saturation 0..2).
     */
    const CONTROLS = [
        { key: 'brightness', label: 'Brightness', min: -100, max: 100, divisor: 100 },
        { key: 'contrast', label: 'Contrast', min: 0, max: 200, divisor: 100 },
        { key: 'saturation', label: 'Saturation', min: 0, max: 200, divisor: 100 },
    ] as const;

    function update(key: keyof LayerAdjustments, value: number) {
        onChange({ ...current, [key]: value });
    }
</script>

<div class="space-y-3">
    <div class="flex items-center gap-2">
        <SlidersHorizontal class="h-4 w-4 text-muted-foreground" />
        <Label class="text-xs font-medium">Adjust</Label>
        {#if !isNeutralAdjustments(adjustments)}
            <Button
                variant="ghost"
                size="sm"
                class="ml-auto h-6 px-2 text-xs"
                title="Reset adjustments"
                onclick={() => onChange({ ...NEUTRAL_ADJUSTMENTS })}
            >
                <RotateCcw class="mr-1 h-3 w-3" />
                Reset
            </Button>
        {/if}
    </div>

    {#each CONTROLS as control (control.key)}
        {@const value = current[control.key]}
        <div class="space-y-1.5">
            <div class="flex items-center justify-between">
                <Label class="text-xs">{control.label}</Label>
                <span class="text-xs text-muted-foreground">{Math.round(value * control.divisor)}</span>
            </div>
            <Slider
                value={[value * control.divisor]}
                min={control.min}
                max={control.max}
                step={1}
                onValueChange={(v) => update(control.key, v[0] / control.divisor)}
            />
        </div>
    {/each}
</div>
