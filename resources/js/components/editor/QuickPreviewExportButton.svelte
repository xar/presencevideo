<script lang="ts">
    import { Film } from 'lucide-svelte';
    import { Button } from '@/components/ui/button';
    import { editorFeatures } from '@/lib/editor/editor-features';
    import { exportProjectVideo, localExportSupport } from '@/lib/editor/local-export';
    import { getMediaCapabilities } from '@/lib/editor/media-capabilities';
    import type { Project } from '@/types/editor';

    /**
     * Browser-side export.
     *
     * This renders the real composition — the same resolved frames the preview
     * paints, real decoded video, the transition-aware duration and a mixed
     * audio track — so it is no longer described as a lossy preview. What it
     * still cannot do is listed honestly next to the button: subtitle burn-in
     * and colour handling come from the shared compositor and match, but the
     * encode is a single-pass H.264 at a medium bitrate rather than the
     * server's, and anything the browser cannot decode is reported as a
     * warning on the finished file instead of silently vanishing.
     */

    let {
        project,
        onProgress,
        onError,
        onWarnings,
    }: {
        project: Project | null | undefined;
        onProgress?: (progress: number) => void;
        onError?: (message: string) => void;
        onWarnings?: (warnings: string[]) => void;
    } = $props();

    let isExporting = $state(false);
    let percent = $state(0);
    let warnings = $state<string[]>([]);
    let support = $state<{ supported: boolean; reason: string | null }>({
        supported: true,
        reason: null,
    });

    $effect(() => {
        support = localExportSupport(getMediaCapabilities());
    });

    let featureEnabled = $derived(editorFeatures.clientPreviewExport);
    let canExport = $derived(Boolean(project && featureEnabled && support.supported));

    async function handleExport(): Promise<void> {
        if (!project || !canExport) return;

        isExporting = true;
        percent = 0;
        warnings = [];
        onProgress?.(0);

        try {
            const result = await exportProjectVideo(project, {
                onProgress: (progress) => {
                    percent = progress.percent;
                    onProgress?.(progress.percent);
                },
            });

            warnings = result.warnings;
            onWarnings?.(result.warnings);

            const url = URL.createObjectURL(result.blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${project.name}.mp4`;
            link.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            onError?.(error instanceof Error ? error.message : 'The browser export failed.');
        } finally {
            isExporting = false;
        }
    }
</script>

<div class="flex flex-col items-start gap-1">
    <Button variant="outline" onclick={handleExport} disabled={!canExport || isExporting}>
        <Film class="mr-2 h-4 w-4" />
        {isExporting ? `Exporting… ${percent}%` : 'Export in Browser'}
    </Button>

    {#if !support.supported && support.reason}
        <p class="max-w-xs text-xs text-muted-foreground">{support.reason}</p>
    {:else if warnings.length > 0}
        <ul class="max-w-xs list-disc pl-4 text-xs text-amber-600 dark:text-amber-500">
            {#each warnings as warning (warning)}
                <li>{warning}</li>
            {/each}
        </ul>
    {/if}
</div>
