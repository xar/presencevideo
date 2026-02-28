<script lang="ts">
    import { router } from '@inertiajs/svelte';
    import {
        Captions,
        Loader2,
        Plus,
        Trash2,
        Eye,
        EyeOff,
        ChevronDown,
        ChevronRight,
    } from 'lucide-svelte';
    import { v4 as uuid } from 'uuid';
    import { Button } from '@/components/ui/button';
    import { Input } from '@/components/ui/input';
    import { Label } from '@/components/ui/label';
    import { Separator } from '@/components/ui/separator';
    import { Slider } from '@/components/ui/slider';
    import { projectStore, generationTracker } from '@/lib/editor';
    import type {
        Asset,
        SubtitleTrack,
        SubtitleEntry,
        SubtitleStyle,
        GenerationStatus,
    } from '@/types';

    let project = $derived(projectStore.project);
    let subtitleTracks = $derived(project?.subtitle_tracks ?? []);

    let isGenerating = $state(false);
    let expandedTrackId = $state<string | null>(null);
    let showAssetPicker = $state(false);

    // Get audio/video assets for transcription
    let mediaAssets = $derived(
        (project?.assets ?? []).filter(
            (a) => a.type === 'video' || a.type === 'audio',
        ),
    );

    function getCsrfToken(): string {
        return (
            document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')
                ?.content ??
            decodeURIComponent(
                document.cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1] ?? '',
            ) ??
            ''
        );
    }

    function convertChunksToEntries(
        chunks: { text: string; timestamp: [number, number] }[],
    ): SubtitleEntry[] {
        return chunks.map((chunk) => ({
            id: uuid(),
            start_ms: Math.round(chunk.timestamp[0] * 1000),
            end_ms: Math.round(chunk.timestamp[1] * 1000),
            text: chunk.text.trim(),
        }));
    }

    async function generateSubtitles(asset: Asset) {
        if (!project) return;

        showAssetPicker = false;
        isGenerating = true;

        try {
            const csrfToken = getCsrfToken();
            const response = await fetch(
                `/editor/projects/${project.id}/generate/speech_to_text`,
                {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-TOKEN': csrfToken,
                        'X-XSRF-TOKEN': csrfToken,
                    },
                    body: JSON.stringify({
                        input_asset_id: asset.id,
                        prompt: '',
                    }),
                },
            );

            if (response.ok) {
                const data = await response.json();
                generationTracker.add(
                    {
                        id: data.generation.id,
                        type: data.generation.type,
                        prompt: data.generation.prompt ?? '',
                        status: data.generation.status,
                        created_at: data.generation.created_at,
                    },
                    { skipPolling: true },
                );
                pollTranscription(data.generation.id, asset.name);
            } else {
                const error = await response.json();
                alert(
                    'Transcription failed: ' +
                        (error.error || 'Unknown error'),
                );
                isGenerating = false;
            }
        } catch (err) {
            console.error('Transcription failed:', err);
            isGenerating = false;
        }
    }

    async function pollTranscription(generationId: number, assetName: string) {
        const MAX_POLLS = 150;
        let pollCount = 0;

        const checkStatus = async () => {
            pollCount++;

            if (pollCount > MAX_POLLS) {
                isGenerating = false;
                alert('Transcription timed out. Please try again.');
                return;
            }

            try {
                const response = await fetch(
                    `/editor/generations/${generationId}`,
                );
                if (!response.ok) return;

                const data = await response.json();
                const status = data.generation.status as GenerationStatus;

                if (status === 'completed') {
                    isGenerating = false;
                    generationTracker.remove(generationId);

                    const params = data.generation.parameters ?? {};
                    const chunks = params.transcription_chunks ?? [];

                    if (chunks.length > 0) {
                        const entries = convertChunksToEntries(chunks);
                        const track = projectStore.addSubtitleTrack({
                            name: `Subtitles - ${assetName}`,
                            entries,
                        });
                        expandedTrackId = track.id;
                    } else {
                        alert(
                            'No speech detected in this asset. Try a different audio/video file.',
                        );
                    }
                } else if (status === 'failed') {
                    isGenerating = false;
                    generationTracker.remove(generationId);
                    alert(
                        'Transcription failed: ' +
                            (data.generation.error_message || 'Unknown error'),
                    );
                } else {
                    setTimeout(checkStatus, 2000);
                }
            } catch (err) {
                console.error('Poll failed:', err);
                isGenerating = false;
            }
        };

        checkStatus();
    }

    function toggleTrackEnabled(trackId: string) {
        const track = subtitleTracks.find((t) => t.id === trackId);
        if (track) {
            projectStore.updateSubtitleTrack(trackId, {
                enabled: !track.enabled,
            });
        }
    }

    function updateTrackStyle(trackId: string, updates: Partial<SubtitleStyle>) {
        const track = subtitleTracks.find((t) => t.id === trackId);
        if (track) {
            projectStore.updateSubtitleTrack(trackId, {
                style: { ...track.style, ...updates },
            });
        }
    }

    function formatTime(ms: number): string {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const millis = Math.round((ms % 1000) / 10);
        return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(2, '0')}`;
    }

    function parseTime(value: string): number | null {
        // Accepts formats: "1:23.45", "83.45", "83450" (ms)
        const parts = value.match(/^(?:(\d+):)?(\d+)(?:\.(\d{1,3}))?$/);
        if (!parts) return null;

        const minutes = parts[1] ? parseInt(parts[1], 10) : 0;
        const seconds = parseInt(parts[2], 10);
        const fraction = parts[3] ? parts[3].padEnd(3, '0') : '000';

        return (minutes * 60 + seconds) * 1000 + parseInt(fraction, 10);
    }

    function handleTimeChange(
        trackId: string,
        entryId: string,
        field: 'start_ms' | 'end_ms',
        value: string,
    ) {
        const ms = parseTime(value);
        if (ms !== null) {
            projectStore.updateSubtitleEntry(trackId, entryId, {
                [field]: ms,
            });
        }
    }
</script>

<div class="flex flex-col overflow-hidden h-full">
    <div class="flex items-center gap-2 p-3 border-b">
        <Captions class="h-4 w-4 text-primary" />
        <h2 class="text-sm font-semibold flex-1">Subtitles</h2>
    </div>

    <div class="flex-1 overflow-y-auto p-3 space-y-3">
        <!-- Generate Button -->
        {#if !showAssetPicker}
            <Button
                class="w-full"
                size="sm"
                onclick={() => (showAssetPicker = true)}
                disabled={isGenerating || mediaAssets.length === 0}
            >
                {#if isGenerating}
                    <Loader2 class="mr-2 h-3 w-3 animate-spin" />
                    Transcribing...
                {:else}
                    <Captions class="mr-2 h-3 w-3" />
                    Generate Subtitles
                {/if}
            </Button>

            {#if mediaAssets.length === 0}
                <p class="text-xs text-muted-foreground text-center">
                    Upload an audio or video asset first
                </p>
            {/if}
        {:else}
            <!-- Asset Picker -->
            <div class="space-y-2">
                <div class="flex items-center justify-between">
                    <Label class="text-xs">Select audio/video to transcribe</Label>
                    <Button
                        variant="ghost"
                        size="sm"
                        class="h-6 text-xs"
                        onclick={() => (showAssetPicker = false)}
                    >
                        Cancel
                    </Button>
                </div>
                <div class="space-y-1 max-h-40 overflow-y-auto">
                    {#each mediaAssets as asset (asset.id)}
                        <button
                            type="button"
                            class="w-full text-left rounded-md border p-2 text-xs hover:bg-accent transition-colors"
                            onclick={() => generateSubtitles(asset)}
                        >
                            <span class="font-medium truncate block">{asset.name}</span>
                            <span class="text-muted-foreground">
                                {asset.type} &middot; {Math.round((asset.size_bytes ?? 0) / 1024)}KB
                            </span>
                        </button>
                    {/each}
                </div>
            </div>
        {/if}

        {#if subtitleTracks.length > 0}
            <Separator />

            <!-- Add manual track -->
            <Button
                variant="outline"
                size="sm"
                class="w-full"
                onclick={() => {
                    const track = projectStore.addSubtitleTrack();
                    expandedTrackId = track.id;
                }}
            >
                <Plus class="mr-2 h-3 w-3" />
                Add Empty Track
            </Button>
        {/if}

        <!-- Track List -->
        {#each subtitleTracks as track (track.id)}
            {@const isExpanded = expandedTrackId === track.id}
            <div class="rounded-md border">
                <!-- Track Header -->
                <div class="flex items-center gap-2 p-2 hover:bg-accent/50 transition-colors">
                    <button
                        type="button"
                        class="flex items-center gap-2 flex-1 min-w-0 text-left"
                        onclick={() =>
                            (expandedTrackId = isExpanded ? null : track.id)}
                    >
                        {#if isExpanded}
                            <ChevronDown class="h-3 w-3 text-muted-foreground shrink-0" />
                        {:else}
                            <ChevronRight class="h-3 w-3 text-muted-foreground shrink-0" />
                        {/if}
                        <span class="text-xs font-medium flex-1 truncate">{track.name}</span>
                        <span class="text-[10px] text-muted-foreground">{track.entries.length}</span>
                    </button>
                    <button
                        type="button"
                        class="p-0.5 hover:text-foreground text-muted-foreground"
                        onclick={() => toggleTrackEnabled(track.id)}
                        title={track.enabled ? 'Hide subtitles' : 'Show subtitles'}
                    >
                        {#if track.enabled}
                            <Eye class="h-3 w-3" />
                        {:else}
                            <EyeOff class="h-3 w-3" />
                        {/if}
                    </button>
                    <button
                        type="button"
                        class="p-0.5 hover:text-destructive text-muted-foreground"
                        onclick={() => projectStore.deleteSubtitleTrack(track.id)}
                        title="Delete track"
                    >
                        <Trash2 class="h-3 w-3" />
                    </button>
                </div>

                {#if isExpanded}
                    <div class="border-t p-2 space-y-3">
                        <!-- Style Controls -->
                        <div class="space-y-2">
                            <Label class="text-[10px] font-medium uppercase text-muted-foreground">Style</Label>

                            <div class="grid grid-cols-2 gap-2">
                                <div class="space-y-1">
                                    <Label class="text-[10px]">Font Size</Label>
                                    <Slider
                                        value={[track.style.font_size]}
                                        min={16}
                                        max={120}
                                        step={2}
                                        onValueChange={(v) =>
                                            updateTrackStyle(track.id, {
                                                font_size: v[0],
                                            })}
                                    />
                                    <span class="text-[10px] text-muted-foreground">{track.style.font_size}px</span>
                                </div>
                                <div class="space-y-1">
                                    <Label class="text-[10px]">Position</Label>
                                    <div class="flex gap-1">
                                        <Button
                                            variant={track.style.position === 'bottom' ? 'secondary' : 'ghost'}
                                            size="sm"
                                            class="h-6 text-[10px] flex-1"
                                            onclick={() =>
                                                updateTrackStyle(track.id, {
                                                    position: 'bottom',
                                                })}
                                        >
                                            Bottom
                                        </Button>
                                        <Button
                                            variant={track.style.position === 'top' ? 'secondary' : 'ghost'}
                                            size="sm"
                                            class="h-6 text-[10px] flex-1"
                                            onclick={() =>
                                                updateTrackStyle(track.id, {
                                                    position: 'top',
                                                })}
                                        >
                                            Top
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            <div class="grid grid-cols-2 gap-2">
                                <div class="space-y-1">
                                    <Label class="text-[10px]">Text Color</Label>
                                    <div class="flex items-center gap-1">
                                        <input
                                            type="color"
                                            value={track.style.font_color}
                                            class="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
                                            oninput={(e) =>
                                                updateTrackStyle(track.id, {
                                                    font_color: e.currentTarget.value,
                                                })}
                                        />
                                        <span class="text-[10px] text-muted-foreground">{track.style.font_color}</span>
                                    </div>
                                </div>
                                <div class="space-y-1">
                                    <Label class="text-[10px]">Background</Label>
                                    <div class="flex items-center gap-1">
                                        <input
                                            type="color"
                                            value={track.style.background_color.slice(0, 7)}
                                            class="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
                                            oninput={(e) =>
                                                updateTrackStyle(track.id, {
                                                    background_color: e.currentTarget.value + '80',
                                                })}
                                        />
                                        <span class="text-[10px] text-muted-foreground">
                                            {track.style.background_color.slice(0, 7)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <Separator />

                        <!-- Entries -->
                        <div class="space-y-1">
                            <div class="flex items-center justify-between">
                                <Label class="text-[10px] font-medium uppercase text-muted-foreground">
                                    Entries ({track.entries.length})
                                </Label>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    class="h-5 text-[10px]"
                                    onclick={() =>
                                        projectStore.addSubtitleEntry(
                                            track.id,
                                            {},
                                        )}
                                >
                                    <Plus class="mr-1 h-2.5 w-2.5" />
                                    Add
                                </Button>
                            </div>

                            <div class="max-h-60 overflow-y-auto space-y-1.5">
                                {#each track.entries as entry (entry.id)}
                                    <div class="rounded border p-1.5 space-y-1 bg-muted/30">
                                        <textarea
                                            value={entry.text}
                                            rows={1}
                                            class="w-full rounded border-0 bg-transparent px-1 py-0.5 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                                            oninput={(e) =>
                                                projectStore.updateSubtitleEntry(
                                                    track.id,
                                                    entry.id,
                                                    {
                                                        text: e.currentTarget
                                                            .value,
                                                    },
                                                )}
                                        ></textarea>
                                        <div class="flex items-center gap-1">
                                            <input
                                                type="text"
                                                value={formatTime(entry.start_ms)}
                                                class="w-16 rounded border bg-transparent px-1 py-0 text-[10px] text-center focus:outline-none focus:ring-1 focus:ring-ring"
                                                onchange={(e) =>
                                                    handleTimeChange(
                                                        track.id,
                                                        entry.id,
                                                        'start_ms',
                                                        e.currentTarget.value,
                                                    )}
                                            />
                                            <span class="text-[10px] text-muted-foreground">-</span>
                                            <input
                                                type="text"
                                                value={formatTime(entry.end_ms)}
                                                class="w-16 rounded border bg-transparent px-1 py-0 text-[10px] text-center focus:outline-none focus:ring-1 focus:ring-ring"
                                                onchange={(e) =>
                                                    handleTimeChange(
                                                        track.id,
                                                        entry.id,
                                                        'end_ms',
                                                        e.currentTarget.value,
                                                    )}
                                            />
                                            <div class="flex-1"></div>
                                            <button
                                                type="button"
                                                class="p-0.5 hover:text-destructive text-muted-foreground"
                                                onclick={() =>
                                                    projectStore.deleteSubtitleEntry(
                                                        track.id,
                                                        entry.id,
                                                    )}
                                                title="Delete entry"
                                            >
                                                <Trash2 class="h-2.5 w-2.5" />
                                            </button>
                                        </div>
                                    </div>
                                {/each}
                            </div>
                        </div>
                    </div>
                {/if}
            </div>
        {/each}

        {#if subtitleTracks.length === 0 && !isGenerating}
            <p class="text-xs text-muted-foreground text-center py-4">
                No subtitle tracks yet. Generate subtitles from an audio/video asset or add a track manually.
            </p>

            <Button
                variant="outline"
                size="sm"
                class="w-full"
                onclick={() => {
                    const track = projectStore.addSubtitleTrack();
                    expandedTrackId = track.id;
                }}
            >
                <Plus class="mr-2 h-3 w-3" />
                Add Empty Track
            </Button>
        {/if}
    </div>
</div>
