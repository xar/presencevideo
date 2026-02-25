<script lang="ts">
    import { Label } from '@/components/ui/label';
    import { Input } from '@/components/ui/input';
    import { Button } from '@/components/ui/button';
    import { Checkbox } from '@/components/ui/checkbox';
    import { Slider } from '@/components/ui/slider';
    import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
    import { ChevronRight, RotateCcw } from 'lucide-svelte';
    import type { ParameterConfig } from '@/types/editor';

    let {
        parameters = {},
        values = $bindable<Record<string, unknown>>({}),
        defaults = {},
        disabled = false,
    }: {
        parameters: Record<string, ParameterConfig>;
        values: Record<string, unknown>;
        defaults: Record<string, unknown>;
        disabled?: boolean;
    } = $props();

    let advancedOpen = $state(false);

    const commonParamKeys = ['image_size', 'aspect_ratio', 'duration', 'voice', 'style', 'num_images'];

    let commonParams = $derived(
        Object.entries(parameters).filter(([key, config]) =>
            config.group === 'common' || commonParamKeys.includes(key)
        )
    );

    let advancedParams = $derived(
        Object.entries(parameters).filter(([key, config]) =>
            config.group !== 'common' && !commonParamKeys.includes(key)
        )
    );

    function getValue(key: string): unknown {
        return values[key] ?? defaults[key];
    }

    function setValue(key: string, value: unknown) {
        values = { ...values, [key]: value };
    }

    function resetToDefaults() {
        values = { ...defaults };
    }

    function hasChanges(): boolean {
        return Object.keys(parameters).some(key => {
            const current = values[key];
            const defaultVal = defaults[key];
            return current !== undefined && current !== defaultVal;
        });
    }
</script>

{#if Object.keys(parameters).length > 0}
    <div class="space-y-3">
        <!-- Common Parameters -->
        {#if commonParams.length > 0}
            <div class="space-y-3">
                {#each commonParams as [key, config]}
                    <div class="space-y-1.5">
                        <Label class="text-xs truncate block">{config.label}</Label>

                        {#if config.type === 'select' && config.options}
                            <select
                                class="w-full h-8 rounded-md border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:pointer-events-none"
                                value={String(getValue(key) ?? '')}
                                onchange={(e) => setValue(key, e.currentTarget.value)}
                                {disabled}
                            >
                                {#each Object.entries(config.options) as [value, label]}
                                    <option {value} class="truncate">{label}</option>
                                {/each}
                            </select>
                        {:else if config.type === 'slider'}
                            <div class="flex items-center gap-2">
                                <div class="flex-1 min-w-0">
                                    <Slider
                                        value={[Number(getValue(key) ?? config.min ?? 0)]}
                                        min={config.min ?? 0}
                                        max={config.max ?? 100}
                                        step={config.step ?? 1}
                                        {disabled}
                                        onValueChange={(v) => setValue(key, v[0])}
                                    />
                                </div>
                                <span class="text-xs text-muted-foreground w-10 text-right tabular-nums flex-shrink-0">
                                    {getValue(key) ?? config.min ?? 0}
                                </span>
                            </div>
                        {:else if config.type === 'checkbox'}
                            <div class="flex items-center gap-2">
                                <Checkbox
                                    checked={Boolean(getValue(key))}
                                    onCheckedChange={(checked) => setValue(key, checked)}
                                    {disabled}
                                />
                            </div>
                        {:else if config.type === 'textarea'}
                            <textarea
                                value={String(getValue(key) ?? '')}
                                rows={2}
                                class="w-full rounded-md border bg-transparent px-2 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none disabled:opacity-50 disabled:pointer-events-none"
                                oninput={(e) => setValue(key, e.currentTarget.value)}
                                {disabled}
                            ></textarea>
                        {:else if config.type === 'text'}
                            <Input
                                type="text"
                                value={String(getValue(key) ?? '')}
                                class="h-8 text-xs"
                                oninput={(e) => setValue(key, e.currentTarget.value)}
                                {disabled}
                            />
                        {/if}
                    </div>
                {/each}
            </div>
        {/if}

        <!-- Advanced Parameters -->
        {#if advancedParams.length > 0}
            <Collapsible bind:open={advancedOpen}>
                <CollapsibleTrigger
                    class="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
                    onclick={() => advancedOpen = !advancedOpen}
                >
                    <ChevronRight class="h-3 w-3 transition-transform {advancedOpen ? 'rotate-90' : ''}" />
                    Advanced Settings
                    <span class="text-[10px] text-muted-foreground">({advancedParams.length})</span>
                </CollapsibleTrigger>

                <CollapsibleContent class={advancedOpen ? 'mt-3' : ''}>
                    {#if advancedOpen}
                        <div class="space-y-3 rounded-lg border p-3 bg-muted/30">
                            {#each advancedParams as [key, config]}
                                <div class="space-y-1.5">
                                    <Label class="text-xs truncate block">{config.label}</Label>

                                    {#if config.type === 'select' && config.options}
                                        <select
                                            class="w-full h-8 rounded-md border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:pointer-events-none"
                                            value={String(getValue(key) ?? '')}
                                            onchange={(e) => setValue(key, e.currentTarget.value)}
                                            {disabled}
                                        >
                                            {#each Object.entries(config.options) as [value, label]}
                                                <option {value} class="truncate">{label}</option>
                                            {/each}
                                        </select>
                                    {:else if config.type === 'slider'}
                                        <div class="flex items-center gap-2">
                                            <div class="flex-1 min-w-0">
                                                <Slider
                                                    value={[Number(getValue(key) ?? config.min ?? 0)]}
                                                    min={config.min ?? 0}
                                                    max={config.max ?? 100}
                                                    step={config.step ?? 1}
                                                    {disabled}
                                                    onValueChange={(v) => setValue(key, v[0])}
                                                />
                                            </div>
                                            <span class="text-xs text-muted-foreground w-10 text-right tabular-nums flex-shrink-0">
                                                {getValue(key) ?? config.min ?? 0}
                                            </span>
                                        </div>
                                    {:else if config.type === 'checkbox'}
                                        <div class="flex items-center gap-2">
                                            <Checkbox
                                                checked={Boolean(getValue(key))}
                                                onCheckedChange={(checked) => setValue(key, checked)}
                                                {disabled}
                                            />
                                        </div>
                                    {:else if config.type === 'textarea'}
                                        <textarea
                                            value={String(getValue(key) ?? '')}
                                            rows={2}
                                            class="w-full rounded-md border bg-transparent px-2 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none disabled:opacity-50 disabled:pointer-events-none"
                                            oninput={(e) => setValue(key, e.currentTarget.value)}
                                            {disabled}
                                        ></textarea>
                                    {:else if config.type === 'text'}
                                        <Input
                                            type="text"
                                            value={String(getValue(key) ?? '')}
                                            class="h-8 text-xs"
                                            oninput={(e) => setValue(key, e.currentTarget.value)}
                                            {disabled}
                                        />
                                    {/if}
                                </div>
                            {/each}
                        </div>
                    {/if}
                </CollapsibleContent>
            </Collapsible>
        {/if}

        <!-- Reset Button -->
        {#if hasChanges()}
            <Button
                variant="ghost"
                size="sm"
                class="h-7 text-xs text-muted-foreground hover:text-foreground w-full"
                onclick={resetToDefaults}
                {disabled}
            >
                <RotateCcw class="mr-1.5 h-3 w-3" />
                Reset to defaults
            </Button>
        {/if}
    </div>
{/if}
