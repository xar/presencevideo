<script lang="ts">
    import { projectStore, timelineStore } from '@/lib/editor';
    import type { SubtitleTrack, SubtitleEntry } from '@/types';

    let { scale }: { scale: number } = $props();

    let project = $derived(projectStore.project);
    let currentTimeMs = $derived(timelineStore.currentTimeMs);

    const DEFAULT_FONT_FAMILY = 'Arial, sans-serif';

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
                if (
                    currentTimeMs >= entry.start_ms &&
                    currentTimeMs < entry.end_ms
                ) {
                    results.push({ track, entry });
                }
            }
        }

        return results;
    });

    function hasBackground(color: string | undefined): boolean {
        if (!color) return false;
        const normalized = color.trim().toLowerCase();
        if (normalized === '' || normalized === 'transparent') return false;
        // Fully transparent hex (#RRGGBB00)
        if (/^#[0-9a-f]{8}$/.test(normalized) && normalized.slice(7) === '00') {
            return false;
        }
        return true;
    }

    function transformText(
        text: string,
        transform: 'none' | 'uppercase' | undefined,
    ): string {
        return transform === 'uppercase' ? text.toUpperCase() : text;
    }
</script>

{#each activeSubtitles as { track, entry } (entry.id)}
    {@const style = track.style}
    {@const scaledFontSize = Math.round(style.font_size * scale)}
    {@const strokeWidth = (style.stroke_width ?? 0) * scale}
    {@const strokeColor = style.stroke_color ?? '#000000'}
    {@const showBox = hasBackground(style.background_color)}
    {@const isKaraoke = !!style.highlight_color && !!entry.words?.length}
    <div
        class="absolute left-0 right-0 flex justify-center pointer-events-none"
        style:top={style.position === 'top'
            ? `${Math.round(20 * scale)}px`
            : undefined}
        style:bottom={style.position === 'bottom'
            ? `${Math.round(20 * scale)}px`
            : undefined}
    >
        <span
            class="inline-block max-w-[90%] text-center leading-tight font-bold"
            style:font-family={style.font_family ?? DEFAULT_FONT_FAMILY}
            style:font-size="{scaledFontSize}px"
            style:color={style.font_color}
            style:background-color={showBox
                ? style.background_color
                : undefined}
            style:padding={showBox
                ? `${Math.round(4 * scale)}px ${Math.round(8 * scale)}px`
                : undefined}
            style:border-radius={showBox
                ? `${Math.round(4 * scale)}px`
                : undefined}
            style:-webkit-text-stroke={strokeWidth > 0
                ? `${strokeWidth}px ${strokeColor}`
                : undefined}
            style:paint-order={strokeWidth > 0 ? 'stroke fill' : undefined}
        >
            {#if isKaraoke}
                {#each entry.words! as word, i (i)}
                    {@const active =
                        currentTimeMs >= word.start_ms &&
                        currentTimeMs < word.end_ms}
                    <span
                        class="inline-block transition-transform"
                        style:color={active ? style.highlight_color : undefined}
                        style:transform={active ? 'scale(1.08)' : undefined}
                    >{transformText(word.text, style.text_transform)}</span
                    >{' '}
                {/each}
            {:else}
                {transformText(entry.text, style.text_transform)}
            {/if}
        </span>
    </div>
{/each}
