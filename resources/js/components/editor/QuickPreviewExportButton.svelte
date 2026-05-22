<script lang="ts">
    import { Film } from 'lucide-svelte';
    import { Button } from '@/components/ui/button';
    import { editorFeatures } from '@/lib/editor/editor-features';
    import { getMediaCapabilities } from '@/lib/editor/media-capabilities';
    import type { Project } from '@/types/editor';

    let {
        project,
        onProgress,
        onError,
    }: {
        project: Project | null | undefined;
        onProgress?: (progress: number) => void;
        onError?: (message: string) => void;
    } = $props();

    let isExporting = $state(false);
    let capabilities = $state<ReturnType<typeof getMediaCapabilities> | null>(null);

    $effect(() => {
        capabilities = getMediaCapabilities();
    });

    let canExport = $derived(Boolean(project && editorFeatures.clientPreviewExport && capabilities?.canExportPreview));

    async function handleExport(): Promise<void> {
        if (!project) return;

        isExporting = true;
        onProgress?.(0);

        try {
            const { exportQuickPreview } = await import('@/lib/editor/local-export');
            const blob = await exportQuickPreview(project, onProgress);
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${project.name}-quick-preview.mp4`;
            link.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            onError?.(error instanceof Error ? error.message : 'Quick preview export failed.');
        } finally {
            isExporting = false;
        }
    }
</script>

<Button variant="outline" onclick={handleExport} disabled={!canExport || isExporting}>
    <Film class="mr-2 h-4 w-4" />
    {isExporting ? 'Creating Preview...' : 'Download Quick Preview'}
</Button>
