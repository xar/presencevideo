<script lang="ts">
    import {
        Trash2,
        Scissors,
        Volume2,
        VolumeX,
        Maximize2,
        RotateCcw,
        Bold,
        AlignLeft,
        AlignCenter,
        AlignRight,
        ArrowUp,
        ArrowDown,
        ChevronsUp,
        ChevronsDown,
    } from 'lucide-svelte';
    import { Button } from '@/components/ui/button';
    import { Input } from '@/components/ui/input';
    import { Label } from '@/components/ui/label';
    import { Separator } from '@/components/ui/separator';
    import { Slider } from '@/components/ui/slider';
    import {
        clampVolume,
        elementTypeLabel,
        supportsAdjustments,
        supportsSpeed,
        videoLayerContentEndMs,
    } from '@/lib/editor/clip-effects';
    import { formatSeconds, formatTimelineTime, parseTimelineTime } from '@/lib/editor/formatting';
    import type { LayerZMove } from '@/lib/editor/project.svelte';
    import type { Asset, ClipTiming, Layer, LayerAdjustments, ShapeKind } from '@/types';
    import AdjustControls from './AdjustControls.svelte';
    import SpeedControl from './SpeedControl.svelte';

    /**
     * The single inspector for anything on the canvas. Scene layers and overlay
     * clips share every control; the parent opts into the placement-specific
     * extras (timing, z-order, scene fitting, clip audio) by passing callbacks.
     */
    let {
        element,
        placement = 'layer',
        asset,
        onUpdate,
        onDelete,
        onReorder,
        onFitToCanvas,
        timing,
        onTimingChange,
        sceneDurationMs,
        onFitSceneToVideo,
        audioControls = true,
    }: {
        element: Layer;
        placement?: 'layer' | 'clip';
        asset?: Asset;
        onUpdate: (updates: Partial<Layer>) => void;
        onDelete: () => void;
        /** Present when the element can be re-stacked (scene layers). */
        onReorder?: (move: LayerZMove) => void;
        onFitToCanvas?: () => void;
        /** Present for timeline clips; renders the start/duration fields. */
        timing?: ClipTiming;
        onTimingChange?: (updates: Partial<ClipTiming>) => void;
        /** Present for scene layers; enables the "fit scene to video" hint. */
        sceneDurationMs?: number;
        onFitSceneToVideo?: (contentEndMs: number) => void;
        /** Overlay clip audio is not rendered, so clips hide the volume controls. */
        audioControls?: boolean;
    } = $props();

    const SHAPE_KINDS: Array<{ label: string; value: ShapeKind }> = [
        { label: 'Rectangle', value: 'rectangle' },
        { label: 'Ellipse', value: 'ellipse' },
        { label: 'Line', value: 'line' },
    ];

    /** Curated web-safe font stacks offered for text. */
    const FONT_FAMILIES: Array<{ label: string; value: string }> = [
        { label: 'System UI', value: 'system-ui' },
        { label: 'Inter', value: 'Inter, system-ui, sans-serif' },
        { label: 'Arial', value: 'Arial, sans-serif' },
        { label: 'Helvetica', value: 'Helvetica, Arial, sans-serif' },
        { label: 'Georgia', value: 'Georgia, serif' },
        { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
        { label: 'Courier New', value: '"Courier New", Courier, monospace' },
        { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
        { label: 'Trebuchet MS', value: '"Trebuchet MS", sans-serif' },
        { label: 'Impact', value: 'Impact, Charcoal, sans-serif' },
        { label: 'Comic Sans MS', value: '"Comic Sans MS", cursive' },
    ];

    const TEXT_ALIGNMENTS = [
        { value: 'left', label: 'Left', icon: AlignLeft },
        { value: 'center', label: 'Center', icon: AlignCenter },
        { value: 'right', label: 'Right', icon: AlignRight },
    ] as const;

    const Z_ORDER_ACTIONS: Array<{ move: LayerZMove; label: string; icon: typeof ArrowUp }> = [
        { move: 'forward', label: 'Forward', icon: ArrowUp },
        { move: 'backward', label: 'Backward', icon: ArrowDown },
        { move: 'front', label: 'To Front', icon: ChevronsUp },
        { move: 'back', label: 'To Back', icon: ChevronsDown },
    ];

    /** Ignore sub-frame differences so the hint does not flicker on rounding. */
    const CONTENT_END_TOLERANCE_MS = 50;

    let title = $derived(elementTypeLabel(element, placement));

    function numberFrom(e: Event, fallback: number): number {
        const value = parseInt((e.target as HTMLInputElement).value);
        return Number.isFinite(value) ? value : fallback;
    }

    function stringFrom(e: Event): string {
        return (e.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
    }

    /**
     * Field names are checked by the type-narrowed template branches that call
     * this; the update itself is a plain partial for the parent to apply.
     */
    function set(field: string, value: unknown) {
        onUpdate({ [field]: value } as Partial<Layer>);
    }

    /** Where the video runs out of source frames, or null when unknown. */
    let videoContentEndMs = $derived.by(() => {
        if (element.type !== 'video') return null;
        return videoLayerContentEndMs(element, asset?.duration_ms);
    });

    let hasFill = $derived(
        element.type === 'shape'
            && !!element.fill_color
            && element.fill_color !== 'transparent'
            && element.fill_color !== 'none',
    );
</script>

<div>
    <h3 class="text-sm font-semibold mb-3">{title} Properties</h3>

    <div class="space-y-3">
        {#if element.type === 'text'}
            <div>
                <Label class="text-xs">Text</Label>
                <textarea
                    value={element.text}
                    oninput={(e) => set('text', stringFrom(e))}
                    rows="3"
                    class="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                ></textarea>
            </div>
        {/if}

        {#if timing && onTimingChange}
            <div class="grid grid-cols-2 gap-2">
                <div>
                    <Label class="text-xs">Start</Label>
                    <Input
                        type="text"
                        value={formatTimelineTime(timing.start_ms)}
                        onchange={(e) => onTimingChange({ start_ms: Math.max(0, parseTimelineTime(stringFrom(e))) })}
                        class="h-8 font-mono text-xs"
                    />
                </div>
                <div>
                    <Label class="text-xs">Duration</Label>
                    <Input
                        type="text"
                        value={formatTimelineTime(timing.duration_ms)}
                        onchange={(e) => onTimingChange({ duration_ms: Math.max(100, parseTimelineTime(stringFrom(e))) })}
                        class="h-8 font-mono text-xs"
                    />
                </div>
            </div>

            <Separator />
        {/if}

        <div class="grid grid-cols-2 gap-2">
            <div>
                <Label class="text-xs">X</Label>
                <Input type="number" value={element.x} onchange={(e) => set('x', numberFrom(e, 0))} class="h-8" />
            </div>
            <div>
                <Label class="text-xs">Y</Label>
                <Input type="number" value={element.y} onchange={(e) => set('y', numberFrom(e, 0))} class="h-8" />
            </div>
        </div>

        <div class="grid grid-cols-2 gap-2">
            <div>
                <Label class="text-xs">Width</Label>
                <Input type="number" value={element.width} onchange={(e) => set('width', Math.max(1, numberFrom(e, 1)))} class="h-8" />
            </div>
            <div>
                <Label class="text-xs">Height</Label>
                <Input type="number" value={element.height} onchange={(e) => set('height', Math.max(1, numberFrom(e, 1)))} class="h-8" />
            </div>
        </div>

        {#if asset && onFitToCanvas}
            <Button type="button" variant="outline" size="sm" class="w-full" onclick={onFitToCanvas}>
                <Maximize2 class="h-3 w-3 mr-2" />
                Fit to canvas
            </Button>
        {/if}

        <Separator />

        <!-- Transform -->
        <div class="space-y-1.5">
            <div class="flex items-center justify-between">
                <Label class="text-xs">Opacity</Label>
                <span class="text-xs text-muted-foreground">{Math.round((element.opacity ?? 1) * 100)}%</span>
            </div>
            <Slider
                value={[(element.opacity ?? 1) * 100]}
                min={0}
                max={100}
                step={1}
                onValueChange={(v) => set('opacity', v[0] / 100)}
            />
        </div>

        <div>
            <Label class="text-xs">Rotation (degrees)</Label>
            <div class="flex gap-1">
                <Input
                    type="number"
                    step="1"
                    value={element.rotation ?? 0}
                    onchange={(e) => set('rotation', parseFloat(stringFrom(e)) || 0)}
                    class="h-8 flex-1"
                />
                <Button variant="outline" size="icon" class="h-8 w-8 shrink-0" title="Reset rotation" onclick={() => set('rotation', 0)}>
                    <RotateCcw class="h-3 w-3" />
                </Button>
            </div>
        </div>

        {#if onReorder}
            <div class="space-y-1.5">
                <Label class="text-xs">Arrange</Label>
                <div class="grid grid-cols-2 gap-1">
                    {#each Z_ORDER_ACTIONS as action (action.move)}
                        {@const Icon = action.icon}
                        <Button variant="outline" size="sm" class="h-8 text-xs" onclick={() => onReorder(action.move)}>
                            <Icon class="mr-1 h-3 w-3" />
                            {action.label}
                        </Button>
                    {/each}
                </div>
            </div>
        {/if}

        {#if supportsAdjustments(element)}
            <Separator />
            <AdjustControls
                adjustments={element.adjustments}
                onChange={(adjustments: LayerAdjustments) => set('adjustments', adjustments)}
            />
        {/if}

        {#if supportsSpeed(element)}
            {@const videoDuration = asset?.duration_ms ?? 0}
            {@const trimStart = element.trim_start_ms ?? 0}
            {@const trimEnd = element.trim_end_ms ?? videoDuration}
            {@const effectiveDuration = trimEnd - trimStart}
            {@const isMuted = element.muted ?? false}

            <Separator />

            <SpeedControl speed={element.speed} onChange={(speed) => set('speed', speed)} />

            {#if audioControls}
                <Separator />

                <div class="space-y-2">
                    <div class="flex items-center gap-2">
                        {#if isMuted}
                            <VolumeX class="h-4 w-4 text-muted-foreground" />
                        {:else}
                            <Volume2 class="h-4 w-4 text-muted-foreground" />
                        {/if}
                        <Label class="text-xs font-medium">Clip Volume</Label>
                        <span class="ml-auto text-xs text-muted-foreground">
                            {isMuted ? 'Muted' : `${Math.round(clampVolume(element.volume) * 100)}%`}
                        </span>
                    </div>

                    <Slider
                        value={[clampVolume(element.volume) * 100]}
                        min={0}
                        max={100}
                        step={1}
                        disabled={isMuted}
                        onValueChange={(v) => set('volume', v[0] / 100)}
                    />

                    <Button variant={isMuted ? 'default' : 'outline'} size="sm" class="w-full text-xs" onclick={() => set('muted', !isMuted)}>
                        {#if isMuted}
                            <VolumeX class="mr-2 h-3 w-3" />
                            Unmute clip audio
                        {:else}
                            <Volume2 class="mr-2 h-3 w-3" />
                            Mute clip audio
                        {/if}
                    </Button>
                </div>
            {/if}

            <!-- How the clip length lines up with the scene length -->
            {#if videoContentEndMs !== null && sceneDurationMs !== undefined && onFitSceneToVideo}
                {@const diff = videoContentEndMs - sceneDurationMs}
                {#if Math.abs(diff) > CONTENT_END_TOLERANCE_MS}
                    <div class="rounded-md border bg-muted/50 p-2 space-y-2">
                        <p class="text-[11px] leading-snug text-muted-foreground">
                            {#if diff < 0}
                                Video ends at {formatSeconds(videoContentEndMs)}s — last frame holds
                                until scene end ({formatSeconds(sceneDurationMs)}s).
                            {:else}
                                Video is longer than scene — cut off at {formatSeconds(sceneDurationMs)}s.
                            {/if}
                        </p>
                        <Button variant="outline" size="sm" class="w-full text-xs" onclick={() => onFitSceneToVideo(videoContentEndMs)}>
                            Fit scene to video ({formatSeconds(videoContentEndMs)}s)
                        </Button>
                    </div>
                {/if}
            {/if}

            <Separator />

            <div class="space-y-3">
                <div class="flex items-center gap-2">
                    <Scissors class="h-4 w-4 text-muted-foreground" />
                    <Label class="text-xs font-medium">Trim Video</Label>
                </div>

                {#if videoDuration > 0}
                    {@const trimStartPercent = (trimStart / videoDuration) * 100}
                    {@const trimEndPercent = ((videoDuration - trimEnd) / videoDuration) * 100}
                    <div class="space-y-2">
                        <div class="flex justify-between text-xs text-muted-foreground">
                            <span>Duration: {formatTimelineTime(effectiveDuration)}</span>
                            <span>/ {formatTimelineTime(videoDuration)}</span>
                        </div>

                        <div class="relative h-8 bg-muted rounded overflow-hidden">
                            <div class="absolute inset-0 bg-muted-foreground/20"></div>
                            <div
                                class="absolute top-0 bottom-0 bg-primary/30 border-x-2 border-primary"
                                style:left="{trimStartPercent}%"
                                style:right="{trimEndPercent}%"
                            ></div>
                        </div>

                        <div class="grid grid-cols-2 gap-2">
                            <div>
                                <Label class="text-xs">Start</Label>
                                <Input
                                    type="text"
                                    value={formatTimelineTime(trimStart)}
                                    onchange={(e) => {
                                        const ms = parseTimelineTime(stringFrom(e));
                                        if (ms < trimEnd) set('trim_start_ms', ms);
                                    }}
                                    class="h-8 font-mono text-xs"
                                />
                            </div>
                            <div>
                                <Label class="text-xs">End</Label>
                                <Input
                                    type="text"
                                    value={formatTimelineTime(trimEnd)}
                                    onchange={(e) => {
                                        const ms = Math.min(parseTimelineTime(stringFrom(e)), videoDuration);
                                        if (ms > trimStart) set('trim_end_ms', ms);
                                    }}
                                    class="h-8 font-mono text-xs"
                                />
                            </div>
                        </div>

                        <Button
                            variant="outline"
                            size="sm"
                            class="w-full text-xs"
                            onclick={() => onUpdate({ trim_start_ms: 0, trim_end_ms: videoDuration } as Partial<Layer>)}
                        >
                            Reset Trim
                        </Button>
                    </div>
                {:else}
                    <p class="text-xs text-muted-foreground">Video duration not available</p>
                {/if}
            </div>
        {/if}

        {#if element.type === 'text'}
            <Separator />

            <div>
                <Label class="text-xs">Font Family</Label>
                <select
                    value={element.font_family ?? 'system-ui'}
                    onchange={(e) => set('font_family', stringFrom(e))}
                    class="h-8 w-full rounded-md border bg-transparent px-2 text-sm"
                >
                    {#each FONT_FAMILIES as font (font.value)}
                        <option value={font.value} style:font-family={font.value}>{font.label}</option>
                    {/each}
                </select>
            </div>

            <div class="grid grid-cols-2 gap-2">
                <div>
                    <Label class="text-xs">Font Size</Label>
                    <Input type="number" value={element.font_size} onchange={(e) => set('font_size', numberFrom(e, 48) || 48)} class="h-8" />
                </div>
                <div>
                    <Label class="text-xs">Color</Label>
                    <div class="flex gap-1">
                        <input
                            type="color"
                            value={element.font_color}
                            oninput={(e) => set('font_color', stringFrom(e))}
                            class="h-8 w-8 rounded border cursor-pointer"
                        />
                        <Input value={element.font_color} oninput={(e) => set('font_color', stringFrom(e))} class="h-8 flex-1" />
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-2 gap-2">
                <div>
                    <Label class="text-xs">Style</Label>
                    <Button
                        variant={element.font_weight === 'bold' ? 'default' : 'outline'}
                        size="sm"
                        class="h-8 w-full"
                        title="Bold"
                        onclick={() => set('font_weight', element.font_weight === 'bold' ? 'normal' : 'bold')}
                    >
                        <Bold class="h-3 w-3" />
                    </Button>
                </div>
                <div>
                    <Label class="text-xs">Align</Label>
                    <div class="flex gap-1">
                        {#each TEXT_ALIGNMENTS as align (align.value)}
                            {@const Icon = align.icon}
                            <Button
                                variant={(element.text_align ?? 'center') === align.value ? 'default' : 'outline'}
                                size="icon"
                                class="h-8 w-8"
                                title={align.label}
                                onclick={() => set('text_align', align.value)}
                            >
                                <Icon class="h-3 w-3" />
                            </Button>
                        {/each}
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-2 gap-2">
                <div>
                    <Label class="text-xs">Background</Label>
                    <div class="flex gap-1">
                        <input
                            type="color"
                            value={(element.background_color ?? '#000000').slice(0, 7)}
                            oninput={(e) => set('background_color', stringFrom(e))}
                            class="h-8 w-8 rounded border cursor-pointer"
                        />
                        <Button variant="outline" size="sm" class="h-8 flex-1 text-xs" onclick={() => set('background_color', 'transparent')}>
                            None
                        </Button>
                    </div>
                </div>
                <div>
                    <Label class="text-xs">Padding</Label>
                    <Input type="number" min="0" value={element.padding ?? 0} onchange={(e) => set('padding', Math.max(0, numberFrom(e, 0)))} class="h-8" />
                </div>
            </div>

            <div class="grid grid-cols-2 gap-2">
                <div>
                    <Label class="text-xs">Stroke Width</Label>
                    <Input type="number" min="0" max="20" value={element.stroke_width ?? 0} onchange={(e) => set('stroke_width', Math.max(0, numberFrom(e, 0)))} class="h-8" />
                </div>
                <div>
                    <Label class="text-xs">Stroke Color</Label>
                    <div class="flex gap-1">
                        <input
                            type="color"
                            value={element.stroke_color ?? '#000000'}
                            oninput={(e) => set('stroke_color', stringFrom(e))}
                            class="h-8 w-8 rounded border cursor-pointer"
                        />
                        <Input value={element.stroke_color ?? '#000000'} oninput={(e) => set('stroke_color', stringFrom(e))} class="h-8 flex-1" />
                    </div>
                </div>
            </div>
        {/if}

        {#if element.type === 'shape'}
            <Separator />

            <div>
                <Label class="text-xs">Shape</Label>
                <select
                    value={element.shape ?? 'rectangle'}
                    onchange={(e) => set('shape', stringFrom(e))}
                    class="h-8 w-full rounded-md border bg-transparent px-2 text-sm"
                >
                    {#each SHAPE_KINDS as kind (kind.value)}
                        <option value={kind.value}>{kind.label}</option>
                    {/each}
                </select>
            </div>

            <div>
                <Label class="text-xs">Fill</Label>
                <div class="flex gap-1">
                    <input
                        type="color"
                        value={hasFill ? element.fill_color.slice(0, 7) : '#ffffff'}
                        oninput={(e) => set('fill_color', stringFrom(e))}
                        class="h-8 w-8 rounded border cursor-pointer"
                    />
                    <Input
                        value={hasFill ? element.fill_color : ''}
                        placeholder="None"
                        oninput={(e) => set('fill_color', stringFrom(e))}
                        class="h-8 flex-1"
                    />
                    <Button variant={hasFill ? 'outline' : 'default'} size="sm" class="h-8 text-xs" onclick={() => set('fill_color', 'transparent')}>
                        None
                    </Button>
                </div>
            </div>

            <div class="grid grid-cols-2 gap-2">
                <div>
                    <Label class="text-xs">Border Width</Label>
                    <Input type="number" min="0" value={element.border_width ?? 0} onchange={(e) => set('border_width', Math.max(0, numberFrom(e, 0)))} class="h-8" />
                </div>
                <div>
                    <Label class="text-xs">Border Color</Label>
                    <div class="flex gap-1">
                        <input
                            type="color"
                            value={element.border_color ?? '#000000'}
                            oninput={(e) => set('border_color', stringFrom(e))}
                            class="h-8 w-8 rounded border cursor-pointer"
                        />
                        <Input value={element.border_color ?? '#000000'} oninput={(e) => set('border_color', stringFrom(e))} class="h-8 flex-1" />
                    </div>
                </div>
            </div>

            {#if (element.shape ?? 'rectangle') !== 'ellipse'}
                <div>
                    <Label class="text-xs">Corner Radius</Label>
                    <Input type="number" min="0" value={element.corner_radius ?? 0} onchange={(e) => set('corner_radius', Math.max(0, numberFrom(e, 0)))} class="h-8" />
                </div>
            {/if}
        {/if}

        <Separator />

        <Button variant="destructive" size="sm" class="w-full" onclick={onDelete}>
            <Trash2 class="mr-2 h-4 w-4" />
            Delete {title}
        </Button>
    </div>
</div>
