<script lang="ts">
    import { Trash2, Music } from 'lucide-svelte';
    import { Button } from '@/components/ui/button';
    import { Input } from '@/components/ui/input';
    import { Label } from '@/components/ui/label';
    import { Separator } from '@/components/ui/separator';
    import { Slider } from '@/components/ui/slider';
    import { projectStore, selectionStore } from '@/lib/editor';
    import { getCanvasFitDimensions } from '@/lib/editor/asset-actions';
    import {
        formatFileSize,
        formatSeconds,
        formatTimelineTime,
        parseSeconds,
        parseTimelineTime,
    } from '@/lib/editor/formatting';
    import type { AudioClip, Asset, ClipTiming, Layer } from '@/types';
    import ElementInspector from './ElementInspector.svelte';
    import TransitionPicker from './TransitionPicker.svelte';

    let selection = $derived(selectionStore.selection);
    let selectedScene = $derived(selectionStore.getSelectedScene());
    let selectedLayer = $derived(selectionStore.getSelectedLayer());
    let selectedAudioClip = $derived(selectionStore.getSelectedAudioClip());
    let selectedVideoClip = $derived(selectionStore.getSelectedVideoClip());
    let selectedVideoTrack = $derived(selectionStore.getSelectedVideoTrack());
    let selectedAudioTrack = $derived(selectionStore.getSelectedAudioTrack());

    /** The scene the selected scene transitions into, if any. */
    let nextScene = $derived.by(() => {
        const scenes = projectStore.project?.scenes ?? [];
        const index = scenes.findIndex((scene) => scene.id === selectedScene?.id);

        return index >= 0 ? scenes[index + 1] : undefined;
    });

    function getAsset(assetId: number | undefined): Asset | undefined {
        if (!assetId) return undefined;
        return projectStore.project?.assets?.find((a) => a.id === assetId);
    }

    function elementAsset(element: Layer | null | undefined): Asset | undefined {
        if (!element) return undefined;
        if (element.type === 'video' || element.type === 'image') return getAsset(element.asset_id);
        return undefined;
    }

    // ---- Scene -------------------------------------------------------------

    function updateSceneDuration(e: Event) {
        const input = e.target as HTMLInputElement;
        const durationMs = parseSeconds(input.value, 100);
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

    function deleteScene() {
        if (!selectedScene) return;

        const scenes = projectStore.project?.scenes ?? [];
        const currentIndex = scenes.findIndex((s) => s.id === selectedScene!.id);
        projectStore.deleteScene(selectedScene.id);

        const newScenes = projectStore.project?.scenes ?? [];
        if (newScenes.length > 0) {
            const newIndex = Math.min(currentIndex, newScenes.length - 1);
            selectionStore.selectScene(newScenes[newIndex].id);
        } else {
            selectionStore.clearSelection();
        }
    }

    // ---- Layer (scene element) ----------------------------------------------

    function updateLayer(updates: Partial<Layer>) {
        if (selectedScene && selectedLayer) {
            projectStore.updateLayer(selectedScene.id, selectedLayer.id, updates);
        }
    }

    function deleteLayer() {
        if (selectedScene && selectedLayer) {
            projectStore.deleteLayer(selectedScene.id, selectedLayer.id);
            selectionStore.selectScene(selectedScene.id);
        }
    }

    function fitLayerToCanvas() {
        const project = projectStore.project;
        const asset = elementAsset(selectedLayer);
        if (!project || !selectedScene || !selectedLayer || !asset) return;

        projectStore.updateLayer(selectedScene.id, selectedLayer.id, getCanvasFitDimensions(project, asset));
    }

    function fitSceneToVideo(contentEndMs: number) {
        if (!selectedScene) return;
        projectStore.updateScene(selectedScene.id, { duration_ms: Math.max(100, contentEndMs) });
    }

    // ---- Overlay clip (timeline element) ----------------------------------

    function updateVideoClip(updates: Partial<Layer> | Partial<ClipTiming>) {
        if (!selectedVideoClip) return;
        projectStore.updateVideoClip(selectedVideoClip.trackId, selectedVideoClip.clip.id, updates);
    }

    function deleteVideoClip() {
        if (!selectedVideoClip) return;
        projectStore.deleteVideoClip(selectedVideoClip.trackId, selectedVideoClip.clip.id);
        selectionStore.clearSelection();
    }

    function fitClipToCanvas() {
        const project = projectStore.project;
        const asset = elementAsset(selectedVideoClip?.clip);
        if (!project || !asset) return;

        updateVideoClip(getCanvasFitDimensions(project, asset));
    }

    // ---- Audio clip ---------------------------------------------------------

    let audioClipAsset = $derived.by(() => {
        if (!selectedAudioClip) return undefined;
        return getAsset(selectedAudioClip.clip.asset_id);
    });

    function updateAudioClip(field: keyof AudioClip, value: number) {
        if (!selectedAudioClip) return;
        projectStore.updateAudioClip(selectedAudioClip.trackId, selectedAudioClip.clip.id, { [field]: value });
    }

    /**
     * Fades are stored in ms. Each fade is clamped to the clip duration minus
     * the opposing fade so the two ramps can never overlap.
     */
    function updateAudioFade(field: 'fade_in_ms' | 'fade_out_ms', value: string) {
        if (!selectedAudioClip) return;

        const clip = selectedAudioClip.clip;
        const other = field === 'fade_in_ms' ? (clip.fade_out_ms ?? 0) : (clip.fade_in_ms ?? 0);
        const maxMs = Math.max(0, clip.duration_ms - other);
        const ms = Math.min(maxMs, parseSeconds(value));

        updateAudioClip(field, ms);
    }

    function deleteAudioClip() {
        if (!selectedAudioClip) return;
        projectStore.deleteAudioClip(selectedAudioClip.trackId, selectedAudioClip.clip.id);
        selectionStore.clearSelection();
    }
</script>

<div class="flex-1 overflow-y-auto p-4 space-y-4">
    {#if selection.type === 'layer' && selectedLayer && selectedScene}
        <ElementInspector
            element={selectedLayer}
            placement="layer"
            asset={elementAsset(selectedLayer)}
            onUpdate={updateLayer}
            onDelete={deleteLayer}
            onReorder={(move) => projectStore.reorderLayer(selectedScene!.id, selectedLayer!.id, move)}
            onFitToCanvas={fitLayerToCanvas}
            sceneDurationMs={selectedScene.duration_ms}
            onFitSceneToVideo={fitSceneToVideo}
        />
    {:else if selection.type === 'video_clip' && selectedVideoClip}
        <ElementInspector
            element={selectedVideoClip.clip}
            placement="clip"
            asset={elementAsset(selectedVideoClip.clip)}
            onUpdate={updateVideoClip}
            onDelete={deleteVideoClip}
            onFitToCanvas={fitClipToCanvas}
            timing={selectedVideoClip.clip}
            onTimingChange={updateVideoClip}
            audioControls={false}
        />
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
                        value={formatSeconds(selectedScene.duration_ms)}
                        onchange={updateSceneDuration}
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

                {#if nextScene}
                    <div>
                        <Label class="text-xs">Transition to next scene</Label>
                        <TransitionPicker scene={selectedScene} nextScene={nextScene} variant="inline" />
                    </div>
                {/if}

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
    {:else if selection.type === 'video_track' && selectedVideoTrack}
        {@const track = selectedVideoTrack}
        <div>
            <h3 class="text-sm font-semibold mb-3">Video Track Properties</h3>

            <div class="space-y-3">
                <div>
                    <Label class="text-xs">Name</Label>
                    <Input
                        value={track.name}
                        oninput={(e) => projectStore.updateVideoTrack(track.id, { name: (e.target as HTMLInputElement).value })}
                        class="h-8"
                    />
                </div>

                <Button
                    variant={(track.visible ?? true) ? 'outline' : 'default'}
                    size="sm"
                    class="w-full text-xs"
                    onclick={() => projectStore.updateVideoTrack(track.id, { visible: !(track.visible ?? true) })}
                >
                    {(track.visible ?? true) ? 'Hide track' : 'Show track'}
                </Button>

                <Separator />

                <p class="text-xs text-muted-foreground">Clips: {track.clips.length}</p>

                <Separator />

                <Button variant="destructive" size="sm" class="w-full" onclick={() => selectionStore.deleteSelected()}>
                    <Trash2 class="mr-2 h-4 w-4" />
                    Delete Track
                </Button>
            </div>
        </div>
    {:else if selection.type === 'audio_track' && selectedAudioTrack}
        {@const track = selectedAudioTrack}
        <div>
            <h3 class="text-sm font-semibold mb-3">Audio Track Properties</h3>

            <div class="space-y-3">
                <div>
                    <Label class="text-xs">Name</Label>
                    <Input
                        value={track.name}
                        oninput={(e) => projectStore.updateAudioTrack(track.id, { name: (e.target as HTMLInputElement).value })}
                        class="h-8"
                    />
                </div>

                <div class="space-y-1.5">
                    <div class="flex items-center justify-between">
                        <Label class="text-xs">Track Volume</Label>
                        <span class="text-xs text-muted-foreground">{Math.round((track.volume ?? 1) * 100)}%</span>
                    </div>
                    <Slider
                        value={[(track.volume ?? 1) * 100]}
                        min={0}
                        max={200}
                        step={1}
                        onValueChange={(v) => projectStore.updateAudioTrack(track.id, { volume: v[0] / 100 })}
                    />
                </div>

                <Button
                    variant={track.muted ? 'default' : 'outline'}
                    size="sm"
                    class="w-full text-xs"
                    onclick={() => projectStore.updateAudioTrack(track.id, { muted: !track.muted })}
                >
                    {track.muted ? 'Unmute track' : 'Mute track'}
                </Button>

                <Separator />

                <p class="text-xs text-muted-foreground">Clips: {track.clips.length}</p>

                <Separator />

                <Button variant="destructive" size="sm" class="w-full" onclick={() => selectionStore.deleteSelected()}>
                    <Trash2 class="mr-2 h-4 w-4" />
                    Delete Track
                </Button>
            </div>
        </div>
    {:else if selection.type === 'audio_clip' && selectedAudioClip}
        <div>
            <h3 class="text-sm font-semibold mb-3">Audio Clip Properties</h3>

            <div class="space-y-3">
                <!-- Asset info -->
                {#if audioClipAsset}
                    <div class="flex items-start gap-2 rounded-md border bg-muted/50 p-2">
                        <Music class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <div class="min-w-0 space-y-0.5">
                            <p class="text-xs font-medium truncate">{audioClipAsset.name}</p>
                            <div class="text-[11px] text-muted-foreground space-y-0.5">
                                {#if audioClipAsset.duration_ms}
                                    <p>Original duration: {formatTimelineTime(audioClipAsset.duration_ms)}</p>
                                {/if}
                                <p>{audioClipAsset.mime_type} &middot; {formatFileSize(audioClipAsset.size_bytes)}</p>
                            </div>
                        </div>
                    </div>
                {/if}

                <Separator />

                <!-- Timing -->
                <div class="grid grid-cols-2 gap-2">
                    <div>
                        <Label class="text-xs">Start</Label>
                        <Input
                            type="text"
                            value={formatTimelineTime(selectedAudioClip.clip.start_ms)}
                            onchange={(e) => {
                                const ms = parseTimelineTime((e.target as HTMLInputElement).value);
                                updateAudioClip('start_ms', ms);
                            }}
                            class="h-8 font-mono text-xs"
                        />
                    </div>
                    <div>
                        <Label class="text-xs">Duration</Label>
                        <Input
                            type="text"
                            value={formatTimelineTime(selectedAudioClip.clip.duration_ms)}
                            onchange={(e) => {
                                const ms = parseTimelineTime((e.target as HTMLInputElement).value);
                                if (ms >= 100) {
                                    updateAudioClip('duration_ms', ms);
                                }
                            }}
                            class="h-8 font-mono text-xs"
                        />
                    </div>
                </div>

                <!-- Match to original duration -->
                {#if audioClipAsset?.duration_ms && audioClipAsset.duration_ms !== selectedAudioClip.clip.duration_ms}
                    <Button
                        variant="outline"
                        size="sm"
                        class="w-full text-xs"
                        onclick={() => {
                            if (audioClipAsset?.duration_ms) {
                                updateAudioClip('duration_ms', audioClipAsset.duration_ms);
                            }
                        }}
                    >
                        Match original duration ({formatTimelineTime(audioClipAsset.duration_ms)})
                    </Button>
                {/if}

                <Separator />

                <!-- Volume -->
                <div class="space-y-1.5">
                    <div class="flex items-center justify-between">
                        <Label class="text-xs">Volume</Label>
                        <span class="text-xs text-muted-foreground">{Math.round(selectedAudioClip.clip.volume * 100)}%</span>
                    </div>
                    <Slider
                        value={[selectedAudioClip.clip.volume * 100]}
                        min={0}
                        max={100}
                        step={1}
                        onValueChange={(v) => updateAudioClip('volume', v[0] / 100)}
                    />
                </div>

                <Separator />

                <!-- Fades -->
                <div class="grid grid-cols-2 gap-2">
                    <div>
                        <Label class="text-xs">Fade In (s)</Label>
                        <Input
                            type="number"
                            step="0.1"
                            min="0"
                            value={formatSeconds(selectedAudioClip.clip.fade_in_ms ?? 0)}
                            onchange={(e) => updateAudioFade('fade_in_ms', (e.target as HTMLInputElement).value)}
                            class="h-8"
                        />
                    </div>
                    <div>
                        <Label class="text-xs">Fade Out (s)</Label>
                        <Input
                            type="number"
                            step="0.1"
                            min="0"
                            value={formatSeconds(selectedAudioClip.clip.fade_out_ms ?? 0)}
                            onchange={(e) => updateAudioFade('fade_out_ms', (e.target as HTMLInputElement).value)}
                            class="h-8"
                        />
                    </div>
                </div>

                <Separator />

                <Button variant="destructive" size="sm" class="w-full" onclick={deleteAudioClip}>
                    <Trash2 class="mr-2 h-4 w-4" />
                    Delete Audio Clip
                </Button>
            </div>
        </div>
    {:else}
        <div class="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
            <p class="text-sm">Select a scene or layer to edit its properties</p>
        </div>
    {/if}
</div>
