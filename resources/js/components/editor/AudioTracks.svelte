<script lang="ts">
    import { projectStore, timelineStore, selectionStore } from '@/lib/editor';
    import { Button } from '@/components/ui/button';
    import { Plus, Volume2, VolumeX } from 'lucide-svelte';
    import AudioClip from './AudioClip.svelte';
    import type { AudioTrack as AudioTrackType, AudioClip as AudioClipType } from '@/types';

    let audioTracks = $derived(projectStore.project?.audio_tracks ?? []);
    let totalDuration = $derived(timelineStore.getTotalDuration());
    let pixelsPerMs = $derived(timelineStore.pixelsPerMs);

    function addTrack() {
        projectStore.addAudioTrack();
    }

    function toggleMute(track: AudioTrackType) {
        projectStore.updateAudioTrack(track.id, { muted: !track.muted });
    }

    function handleClipClick(trackId: string, clip: AudioClipType) {
        selectionStore.selectAudioClip(trackId, clip.id);
    }

    function handleClipUpdate(trackId: string, clipId: string, updates: Partial<AudioClipType>) {
        projectStore.updateAudioClip(trackId, clipId, updates);
    }
</script>

<div class="flex flex-col border-t bg-muted/20">
    {#each audioTracks as track (track.id)}
        <div class="flex h-12 border-b">
            <div class="flex w-32 items-center gap-2 border-r bg-background px-2">
                <Button
                    variant="ghost"
                    size="icon"
                    class="h-6 w-6"
                    onclick={() => toggleMute(track)}
                >
                    {#if track.muted}
                        <VolumeX class="h-3 w-3" />
                    {:else}
                        <Volume2 class="h-3 w-3" />
                    {/if}
                </Button>
                <span class="text-xs truncate flex-1">{track.name}</span>
            </div>

            <div class="relative flex-1 overflow-hidden">
                <div
                    class="absolute inset-0"
                    style:width="{totalDuration * pixelsPerMs}px"
                >
                    {#each track.clips as clip (clip.id)}
                        <AudioClip
                            {clip}
                            {pixelsPerMs}
                            isSelected={selectionStore.selection.audioClipId === clip.id}
                            onclick={() => handleClipClick(track.id, clip)}
                            onUpdate={(updates) => handleClipUpdate(track.id, clip.id, updates)}
                        />
                    {/each}
                </div>
            </div>
        </div>
    {/each}

    <div class="flex h-8 items-center px-2">
        <Button variant="ghost" size="sm" class="h-6 text-xs" onclick={addTrack}>
            <Plus class="mr-1 h-3 w-3" />
            Add Audio Track
        </Button>
    </div>
</div>
