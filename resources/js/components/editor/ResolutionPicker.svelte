<script lang="ts">
    import { Monitor, Smartphone, Square, Settings2 } from 'lucide-svelte';
    import { Button } from '@/components/ui/button';
    import {
        DropdownMenu,
        DropdownMenuContent,
        DropdownMenuItem,
        DropdownMenuLabel,
        DropdownMenuSeparator,
        DropdownMenuTrigger,
    } from '@/components/ui/dropdown-menu';
    import {
        Dialog,
        DialogContent,
        DialogDescription,
        DialogFooter,
        DialogTitle,
    } from '@/components/ui/dialog';
    import { Input } from '@/components/ui/input';
    import { Label } from '@/components/ui/label';
    import { projectStore } from '@/lib/editor';

    type ResolutionPreset = {
        label: string;
        width: number;
        height: number;
    };

    const landscapePresets: ResolutionPreset[] = [
        { label: 'YouTube / FHD', width: 1920, height: 1080 },
        { label: 'YouTube / QHD', width: 2560, height: 1440 },
        { label: 'YouTube / 4K', width: 3840, height: 2160 },
        { label: 'HD 720p', width: 1280, height: 720 },
    ];

    const portraitPresets: ResolutionPreset[] = [
        { label: 'TikTok / Reels', width: 1080, height: 1920 },
        { label: 'Portrait HD', width: 720, height: 1280 },
        { label: 'Instagram Portrait', width: 1080, height: 1350 },
    ];

    const squarePresets: ResolutionPreset[] = [
        { label: 'Instagram Square', width: 1080, height: 1080 },
    ];

    let customDialogOpen = $state(false);
    let customWidth = $state(1920);
    let customHeight = $state(1080);
    let customFps = $state(30);

    function selectPreset(preset: ResolutionPreset) {
        projectStore.updateProject({
            resolution_width: preset.width,
            resolution_height: preset.height,
        });
    }

    function openCustomDialog() {
        customWidth = projectStore.project?.resolution_width ?? 1920;
        customHeight = projectStore.project?.resolution_height ?? 1080;
        customFps = projectStore.project?.fps ?? 30;
        customDialogOpen = true;
    }

    function applyCustom(e: Event) {
        e.preventDefault();
        projectStore.updateProject({
            resolution_width: customWidth,
            resolution_height: customHeight,
            fps: customFps,
        });
        customDialogOpen = false;
    }

    function isActive(preset: ResolutionPreset): boolean {
        return (
            projectStore.project?.resolution_width === preset.width &&
            projectStore.project?.resolution_height === preset.height
        );
    }

    function parseNum(e: Event): number {
        return parseInt((e.target as HTMLInputElement).value) || 0;
    }
</script>

<DropdownMenu>
    <DropdownMenuTrigger asChild>
        {#snippet children(props)}
            <Button {...props} variant="ghost" size="sm" class="gap-1.5 text-xs font-medium tabular-nums">
                {projectStore.project?.resolution_width ?? 1080} × {projectStore.project?.resolution_height ?? 1920}
            </Button>
        {/snippet}
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" sideOffset={4} class="w-56">
        <DropdownMenuLabel class="flex items-center gap-2">
            <Monitor class="h-3.5 w-3.5" />
            Landscape
        </DropdownMenuLabel>
        {#each landscapePresets as preset}
            <DropdownMenuItem asChild>
                {#snippet children(props)}
                    <button
                        type="button"
                        class="{props.class} {isActive(preset) ? 'bg-muted/60' : ''}"
                        onclick={(e: MouseEvent) => { props.onClick?.(e); selectPreset(preset); }}
                    >
                        <span class="flex-1">{preset.label}</span>
                        <span class="text-xs text-muted-foreground tabular-nums">{preset.width} × {preset.height}</span>
                    </button>
                {/snippet}
            </DropdownMenuItem>
        {/each}

        <DropdownMenuSeparator />

        <DropdownMenuLabel class="flex items-center gap-2">
            <Smartphone class="h-3.5 w-3.5" />
            Portrait
        </DropdownMenuLabel>
        {#each portraitPresets as preset}
            <DropdownMenuItem asChild>
                {#snippet children(props)}
                    <button
                        type="button"
                        class="{props.class} {isActive(preset) ? 'bg-muted/60' : ''}"
                        onclick={(e: MouseEvent) => { props.onClick?.(e); selectPreset(preset); }}
                    >
                        <span class="flex-1">{preset.label}</span>
                        <span class="text-xs text-muted-foreground tabular-nums">{preset.width} × {preset.height}</span>
                    </button>
                {/snippet}
            </DropdownMenuItem>
        {/each}

        <DropdownMenuSeparator />

        <DropdownMenuLabel class="flex items-center gap-2">
            <Square class="h-3.5 w-3.5" />
            Square
        </DropdownMenuLabel>
        {#each squarePresets as preset}
            <DropdownMenuItem asChild>
                {#snippet children(props)}
                    <button
                        type="button"
                        class="{props.class} {isActive(preset) ? 'bg-muted/60' : ''}"
                        onclick={(e: MouseEvent) => { props.onClick?.(e); selectPreset(preset); }}
                    >
                        <span class="flex-1">{preset.label}</span>
                        <span class="text-xs text-muted-foreground tabular-nums">{preset.width} × {preset.height}</span>
                    </button>
                {/snippet}
            </DropdownMenuItem>
        {/each}

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
            {#snippet children(props)}
                <button
                    type="button"
                    class={props.class}
                    onclick={(e: MouseEvent) => { props.onClick?.(e); openCustomDialog(); }}
                >
                    <Settings2 class="h-4 w-4" />
                    <span class="flex-1">Custom...</span>
                </button>
            {/snippet}
        </DropdownMenuItem>
    </DropdownMenuContent>
</DropdownMenu>

<Dialog bind:open={customDialogOpen}>
    <DialogContent class="sm:max-w-sm">
        <DialogTitle>Custom Resolution</DialogTitle>
        <DialogDescription>Set a custom width, height, and frame rate.</DialogDescription>
        <form onsubmit={applyCustom}>
            <div class="grid gap-4 py-4">
                <div class="grid grid-cols-2 gap-3">
                    <div class="grid gap-2">
                        <Label for="custom-width">Width</Label>
                        <Input
                            id="custom-width"
                            type="number"
                            min={100}
                            max={7680}
                            value={customWidth}
                            oninput={(e: Event) => (customWidth = parseNum(e))}
                        />
                    </div>
                    <div class="grid gap-2">
                        <Label for="custom-height">Height</Label>
                        <Input
                            id="custom-height"
                            type="number"
                            min={100}
                            max={7680}
                            value={customHeight}
                            oninput={(e: Event) => (customHeight = parseNum(e))}
                        />
                    </div>
                </div>
                <div class="grid gap-2">
                    <Label for="custom-fps">Frame Rate (FPS)</Label>
                    <Input
                        id="custom-fps"
                        type="number"
                        min={1}
                        max={120}
                        value={customFps}
                        oninput={(e: Event) => (customFps = parseNum(e))}
                    />
                </div>
            </div>
            <DialogFooter>
                <Button type="button" variant="outline" onclick={() => (customDialogOpen = false)}>
                    Cancel
                </Button>
                <Button type="submit">Apply</Button>
            </DialogFooter>
        </form>
    </DialogContent>
</Dialog>
