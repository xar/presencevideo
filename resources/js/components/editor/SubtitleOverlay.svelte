<script lang="ts">
    import { projectStore, timelineStore } from '@/lib/editor';
    import type { SubtitleTrack, SubtitleEntry } from '@/types';

    let { scale }: { scale: number } = $props();

    let project = $derived(projectStore.project);
    let currentTimeMs = $derived(timelineStore.currentTimeMs);

    type ActiveSubtitle = {
        track: SubtitleTrack;
        entry: SubtitleEntry;
    };

    let activeSubtitles = $derived.by((): ActiveSubtitle[] => {
        if (!project?.subtitle_tracks?.length) return [];

        const results: ActiveSubtitle[] = [];

        for (const track of project.subtitle_tracks) {
            if (!track.enabled) continue;

            for (const entry of track.entries) {
                if (currentTimeMs >= entry.start_ms && currentTimeMs < entry.end_ms) {
                    results.push({ track, entry });
                }
            }
        }

        return results;
    });
</script>

{#each activeSubtitles as { track, entry } (entry.id)}
    {@const style = track.style}
    {@const scaledFontSize = Math.round(style.font_size * scale)}
    <div
        class="absolute left-0 right-0 flex justify-center pointer-events-none"
        style:top={style.position === 'top' ? `${Math.round(20 * scale)}px` : undefined}
        style:bottom={style.position === 'bottom' ? `${Math.round(20 * scale)}px` : undefined}
    >
        <span
            class="inline-block max-w-[90%] text-center leading-tight"
            style:font-size="{scaledFontSize}px"
            style:color={style.font_color}
            style:background-color={style.background_color}
            style:padding="{Math.round(4 * scale)}px {Math.round(8 * scale)}px"
            style:border-radius="{Math.round(4 * scale)}px"
        >
            {entry.text}
        </span>
    </div>
{/each}
