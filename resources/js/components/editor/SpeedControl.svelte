<script lang="ts">
    import { Gauge } from 'lucide-svelte';
    import { Button } from '@/components/ui/button';
    import { Input } from '@/components/ui/input';
    import { Label } from '@/components/ui/label';
    import { clampSpeed, formatSpeed, MAX_SPEED, MIN_SPEED, SPEED_STOPS } from '@/lib/editor/clip-effects';

    let {
        speed,
        onChange,
    }: {
        speed: number | undefined;
        onChange: (speed: number) => void;
    } = $props();

    let current = $derived(clampSpeed(speed));

    function commit(value: number) {
        onChange(clampSpeed(value));
    }
</script>

<div class="space-y-2">
    <div class="flex items-center gap-2">
        <Gauge class="h-4 w-4 text-muted-foreground" />
        <Label class="text-xs font-medium">Speed</Label>
        <span class="ml-auto text-xs text-muted-foreground">{formatSpeed(current)}</span>
    </div>

    <div class="grid grid-cols-4 gap-1">
        {#each SPEED_STOPS as stop (stop)}
            <Button
                variant={current === stop ? 'default' : 'outline'}
                size="sm"
                class="h-7 px-0 text-xs"
                onclick={() => commit(stop)}
            >
                {formatSpeed(stop)}
            </Button>
        {/each}
    </div>

    <Input
        type="number"
        step="0.05"
        min={MIN_SPEED}
        max={MAX_SPEED}
        value={current}
        onchange={(e) => commit(parseFloat((e.target as HTMLInputElement).value) || 1)}
        class="h-8"
    />
</div>
