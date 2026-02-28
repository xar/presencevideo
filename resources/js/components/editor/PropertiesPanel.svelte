<script lang="ts">
    import { Trash2, Scissors } from 'lucide-svelte';
    import { Button } from '@/components/ui/button';
    import { Input } from '@/components/ui/input';
    import { Label } from '@/components/ui/label';
    import { Separator } from '@/components/ui/separator';
    import { projectStore, selectionStore } from '@/lib/editor';
    import type { TextLayer, ImageLayer, VideoLayer, Layer, Asset } from '@/types';

    let selection = $derived(selectionStore.selection);
    let selectedScene = $derived(selectionStore.getSelectedScene());
    let selectedLayer = $derived(selectionStore.getSelectedLayer());

    // Get asset for video/image layers
    function getAsset(assetId: number): Asset | undefined {
        return projectStore.project?.assets?.find(a => a.id === assetId);
    }

    let selectedAsset = $derived.by(() => {
        if (!selectedLayer) return undefined;
        if (selectedLayer.type === 'video' || selectedLayer.type === 'image') {
            const layer = selectedLayer as VideoLayer | ImageLayer;
            return getAsset(layer.asset_id);
        }
        return undefined;
    });

    function formatDuration(ms: number): string {
        const seconds = ms / 1000;
        return seconds.toFixed(1);
    }

    function parseDuration(value: string): number {
        const seconds = parseFloat(value) || 0;
        return Math.max(100, Math.round(seconds * 1000));
    }

    function updateSceneDuration(e: Event) {
        const input = e.target as HTMLInputElement;
        const durationMs = parseDuration(input.value);
        if (selectedScene) {
            projectStore.updateScene(selectedScene.id, { duration_ms: durationMs });
        }
    }

    function updateSceneName(e: Event) {
        const input = e.target as HTMLInputElement;
        if (selectedScene) {
            projectStore.updateScene(selectedScene.id, { name: input.value });
        }
    }

    function updateSceneBackground(e: Event) {
        const input = e.target as HTMLInputElement;
        if (selectedScene) {
            projectStore.updateScene(selectedScene.id, { background_color: input.value });
        }
    }

    function updateLayerPosition(field: 'x' | 'y', e: Event) {
        const input = e.target as HTMLInputElement;
        const value = parseInt(input.value) || 0;
        if (selectedScene && selectedLayer) {
            projectStore.updateLayer(selectedScene.id, selectedLayer.id, { [field]: value });
        }
    }

    function updateLayerSize(field: 'width' | 'height', e: Event) {
        const input = e.target as HTMLInputElement;
        const value = Math.max(1, parseInt(input.value) || 1);
        if (selectedScene && selectedLayer) {
            projectStore.updateLayer(selectedScene.id, selectedLayer.id, { [field]: value });
        }
    }

    function updateTextLayer(field: keyof TextLayer, value: string | number) {
        if (selectedScene && selectedLayer && selectedLayer.type === 'text') {
            projectStore.updateLayer(selectedScene.id, selectedLayer.id, { [field]: value });
        }
    }

    function updateVideoLayer(field: keyof VideoLayer, value: number) {
        if (selectedScene && selectedLayer && selectedLayer.type === 'video') {
            projectStore.updateLayer(selectedScene.id, selectedLayer.id, { [field]: value });
        }
    }

    function formatTime(ms: number): string {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const milliseconds = Math.floor((ms % 1000) / 10);
        return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
    }

    function parseTime(value: string): number {
        // Parse formats like "1:23.45" or "83.45" or "83"
        const parts = value.split(':');
        let seconds = 0;
        if (parts.length === 2) {
            seconds = parseInt(parts[0]) * 60 + parseFloat(parts[1]);
        } else {
            seconds = parseFloat(parts[0]) || 0;
        }
        return Math.max(0, Math.round(seconds * 1000));
    }

    function deleteLayer() {
        if (selectedScene && selectedLayer) {
            projectStore.deleteLayer(selectedScene.id, selectedLayer.id);
            selectionStore.selectScene(selectedScene.id);
        }
    }

    function deleteScene() {
        if (selectedScene) {
            const scenes = projectStore.project?.scenes ?? [];
            const currentIndex = scenes.findIndex(s => s.id === selectedScene!.id);
            projectStore.deleteScene(selectedScene.id);

            // Select another scene
            const newScenes = projectStore.project?.scenes ?? [];
            if (newScenes.length > 0) {
                const newIndex = Math.min(currentIndex, newScenes.length - 1);
                selectionStore.selectScene(newScenes[newIndex].id);
            } else {
                selectionStore.clearSelection();
            }
        }
    }
</script>

<div class="flex-1 overflow-y-auto p-4 space-y-4">
    {#if selection.type === 'layer' && selectedLayer}
        <div>
            <h3 class="text-sm font-semibold mb-3">Layer Properties</h3>

            <div class="space-y-3">
                <div class="grid grid-cols-2 gap-2">
                    <div>
                        <Label class="text-xs">X</Label>
                        <Input
                            type="number"
                            value={selectedLayer.x}
                            oninput={(e) => updateLayerPosition('x', e)}
                            class="h-8"
                        />
                    </div>
                    <div>
                        <Label class="text-xs">Y</Label>
                        <Input
                            type="number"
                            value={selectedLayer.y}
                            oninput={(e) => updateLayerPosition('y', e)}
                            class="h-8"
                        />
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-2">
                    <div>
                        <Label class="text-xs">Width</Label>
                        <Input
                            type="number"
                            value={selectedLayer.width}
                            oninput={(e) => updateLayerSize('width', e)}
                            class="h-8"
                        />
                    </div>
                    <div>
                        <Label class="text-xs">Height</Label>
                        <Input
                            type="number"
                            value={selectedLayer.height}
                            oninput={(e) => updateLayerSize('height', e)}
                            class="h-8"
                        />
                    </div>
                </div>

                {#if selectedLayer.type === 'video'}
                    {@const videoLayer = selectedLayer as VideoLayer}
                    {@const videoDuration = selectedAsset?.duration_ms ?? 0}
                    {@const trimStart = videoLayer.trim_start_ms ?? 0}
                    {@const trimEnd = videoLayer.trim_end_ms ?? videoDuration}
                    {@const effectiveDuration = trimEnd - trimStart}

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
                                    <span>Duration: {formatTime(effectiveDuration)}</span>
                                    <span>/ {formatTime(videoDuration)}</span>
                                </div>

                                <!-- Visual trim bar -->
                                <div class="relative h-8 bg-muted rounded overflow-hidden">
                                    <!-- Full video bar -->
                                    <div class="absolute inset-0 bg-muted-foreground/20"></div>
                                    <!-- Selected region -->
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
                                            value={formatTime(trimStart)}
                                            oninput={(e) => {
                                                const ms = parseTime((e.target as HTMLInputElement).value);
                                                if (ms < trimEnd) {
                                                    updateVideoLayer('trim_start_ms', ms);
                                                }
                                            }}
                                            class="h-8 font-mono text-xs"
                                        />
                                    </div>
                                    <div>
                                        <Label class="text-xs">End</Label>
                                        <Input
                                            type="text"
                                            value={formatTime(trimEnd)}
                                            oninput={(e) => {
                                                const ms = Math.min(parseTime((e.target as HTMLInputElement).value), videoDuration);
                                                if (ms > trimStart) {
                                                    updateVideoLayer('trim_end_ms', ms);
                                                }
                                            }}
                                            class="h-8 font-mono text-xs"
                                        />
                                    </div>
                                </div>

                                <div class="flex gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        class="flex-1 text-xs"
                                        onclick={() => {
                                            updateVideoLayer('trim_start_ms', 0);
                                            updateVideoLayer('trim_end_ms', videoDuration);
                                        }}
                                    >
                                        Reset Trim
                                    </Button>
                                </div>
                            </div>
                        {:else}
                            <p class="text-xs text-muted-foreground">
                                Video duration not available
                            </p>
                        {/if}
                    </div>
                {/if}

                {#if selectedLayer.type === 'text'}
                    {@const textLayer = selectedLayer as TextLayer}
                    <Separator />

                    <div>
                        <Label class="text-xs">Text</Label>
                        <textarea
                            value={textLayer.text}
                            oninput={(e) => updateTextLayer('text', (e.target as HTMLTextAreaElement).value)}
                            rows="3"
                            class="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                        ></textarea>
                    </div>

                    <div class="grid grid-cols-2 gap-2">
                        <div>
                            <Label class="text-xs">Font Size</Label>
                            <Input
                                type="number"
                                value={textLayer.font_size}
                                oninput={(e) => updateTextLayer('font_size', parseInt((e.target as HTMLInputElement).value) || 48)}
                                class="h-8"
                            />
                        </div>
                        <div>
                            <Label class="text-xs">Color</Label>
                            <div class="flex gap-1">
                                <input
                                    type="color"
                                    value={textLayer.font_color}
                                    oninput={(e) => updateTextLayer('font_color', (e.target as HTMLInputElement).value)}
                                    class="h-8 w-8 rounded border cursor-pointer"
                                />
                                <Input
                                    value={textLayer.font_color}
                                    oninput={(e) => updateTextLayer('font_color', (e.target as HTMLInputElement).value)}
                                    class="h-8 flex-1"
                                />
                            </div>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-2">
                        <div>
                            <Label class="text-xs">Stroke Width</Label>
                            <Input
                                type="number"
                                min="0"
                                max="20"
                                value={textLayer.stroke_width ?? 0}
                                oninput={(e) => updateTextLayer('stroke_width', parseInt((e.target as HTMLInputElement).value) || 0)}
                                class="h-8"
                            />
                        </div>
                        <div>
                            <Label class="text-xs">Stroke Color</Label>
                            <div class="flex gap-1">
                                <input
                                    type="color"
                                    value={textLayer.stroke_color ?? '#000000'}
                                    oninput={(e) => updateTextLayer('stroke_color', (e.target as HTMLInputElement).value)}
                                    class="h-8 w-8 rounded border cursor-pointer"
                                />
                                <Input
                                    value={textLayer.stroke_color ?? '#000000'}
                                    oninput={(e) => updateTextLayer('stroke_color', (e.target as HTMLInputElement).value)}
                                    class="h-8 flex-1"
                                />
                            </div>
                        </div>
                    </div>
                {/if}

                <Separator />

                <Button variant="destructive" size="sm" class="w-full" onclick={deleteLayer}>
                    <Trash2 class="mr-2 h-4 w-4" />
                    Delete Layer
                </Button>
            </div>
        </div>
    {:else if selection.type === 'scene' && selectedScene}
        <div>
            <h3 class="text-sm font-semibold mb-3">Scene Properties</h3>

            <div class="space-y-3">
                <div>
                    <Label class="text-xs">Name</Label>
                    <Input
                        value={selectedScene.name ?? ''}
                        oninput={updateSceneName}
                        placeholder="Scene name"
                        class="h-8"
                    />
                </div>

                <div>
                    <Label class="text-xs">Duration (seconds)</Label>
                    <Input
                        type="number"
                        step="0.1"
                        min="0.1"
                        value={formatDuration(selectedScene.duration_ms)}
                        oninput={updateSceneDuration}
                        class="h-8"
                    />
                </div>

                <div>
                    <Label class="text-xs">Background Color</Label>
                    <div class="flex gap-1">
                        <input
                            type="color"
                            value={selectedScene.background_color ?? '#000000'}
                            oninput={updateSceneBackground}
                            class="h-8 w-8 rounded border cursor-pointer"
                        />
                        <Input
                            value={selectedScene.background_color ?? '#000000'}
                            oninput={updateSceneBackground}
                            class="h-8 flex-1"
                        />
                    </div>
                </div>

                <Separator />

                <div class="text-xs text-muted-foreground">
                    <p>Layers: {selectedScene.layers.length}</p>
                </div>

                <Separator />

                <Button variant="destructive" size="sm" class="w-full" onclick={deleteScene}>
                    <Trash2 class="mr-2 h-4 w-4" />
                    Delete Scene
                </Button>
            </div>
        </div>
    {:else}
        <div class="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
            <p class="text-sm">Select a scene or layer to edit its properties</p>
        </div>
    {/if}
</div>
