<script lang="ts">
    import {
        Download,
        CheckCircle2,
        XCircle,
        Film,
        Music,
        Layers,
        RotateCcw,
        Server,
        TriangleAlert,
    } from 'lucide-svelte';
    import { onDestroy } from 'svelte';
    import { Button } from '@/components/ui/button';
    import {
        Dialog,
        DialogContent,
        DialogDescription,
        DialogFooter,
        DialogTitle,
    } from '@/components/ui/dialog';
    import { Progress } from '@/components/ui/progress';
    import { Spinner } from '@/components/ui/spinner';
    import { projectStore } from '@/lib/editor';
    import { editorFeatures } from '@/lib/editor/editor-features';
    import {
        browserExportPercent,
        browserExportPhaseLabel,
        decideExportPath,
    } from '@/lib/editor/export-path';
    import type { ExportPath } from '@/lib/editor/export-path';
    import {
        downloadRender,
        isRenderFinished,
        pollRender,
        startBackendRender,
    } from '@/lib/editor/export-service';
    import { exportProjectVideo, localExportSupport } from '@/lib/editor/local-export';
    import type { LocalExportProgress } from '@/lib/editor/local-export';
    import { getMediaCapabilities } from '@/lib/editor/media-capabilities';
    import type { Render, RenderStatus } from '@/types/editor';

    /**
     * The one export dialog.
     *
     * The BROWSER export is the default because it is the only path that runs
     * the same renderer as the preview — the server renderer is the legacy
     * FFmpeg one and drops every animated element. The server render stays one
     * click away for the people who want a durable URL or do not want their
     * machine encoding, and becomes the only path when the browser cannot
     * encode at all (in which case we say why).
     */

    let {
        open = $bindable(false),
    }: {
        open: boolean;
    } = $props();

    /* ---------------- path selection ---------------- */

    // Capability probing touches `window`, so it is guarded for SSR; the
    // server-rendered markup simply offers the server render until hydration.
    let support = $derived.by(() =>
        typeof window === 'undefined'
            ? { supported: false, reason: null }
            : localExportSupport(getMediaCapabilities()),
    );

    let choice = $derived(
        decideExportPath({
            featureEnabled: editorFeatures.clientPreviewExport,
            support,
        }),
    );

    /* ---------------- browser export ---------------- */

    let browserRunning = $state(false);
    let browserProgress = $state<LocalExportProgress | null>(null);
    let browserBlob = $state<Blob | null>(null);
    let browserWarnings = $state<string[]>([]);
    let browserError = $state<string | null>(null);

    let browserPercent = $derived(browserExportPercent(browserProgress));
    let browserLabel = $derived(browserExportPhaseLabel(browserProgress));

    async function startBrowserExport(): Promise<void> {
        const project = projectStore.project;
        if (!project || browserRunning) return;

        resetAll();
        browserRunning = true;

        try {
            const result = await exportProjectVideo(project, {
                onProgress: (progress) => {
                    browserProgress = progress;
                },
            });

            browserBlob = result.blob;
            browserWarnings = result.warnings;
        } catch (error) {
            browserError =
                error instanceof Error
                    ? error.message
                    : 'The browser export failed.';
        } finally {
            browserRunning = false;
        }
    }

    function downloadBrowserExport(): void {
        if (!browserBlob) return;

        const name = projectStore.project?.name ?? 'export';
        const url = URL.createObjectURL(browserBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${name}.mp4`;
        link.click();
        URL.revokeObjectURL(url);
    }

    /* ---------------- server render ---------------- */

    let render = $state<Render | null>(null);
    let serverStarting = $state(false);
    let serverError = $state<string | null>(null);
    let pollInterval = $state<ReturnType<typeof setInterval> | null>(null);

    const statusLabels: Record<RenderStatus, string> = {
        queued: 'Waiting in queue...',
        processing: 'Preparing scenes...',
        compositing: 'Compositing video...',
        mixing: 'Mixing audio...',
        completed: 'Export complete!',
        failed: 'Export failed',
    };

    function startPolling(renderId: number): void {
        stopPolling();
        pollInterval = pollRender(renderId, (updatedRender) => {
            render = updatedRender;

            if (isRenderFinished(updatedRender)) {
                stopPolling();
            }
        });
    }

    function stopPolling(): void {
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }
    }

    async function startServerRender(): Promise<void> {
        const project = projectStore.project;
        if (!project || serverStarting) return;

        resetAll();
        serverStarting = true;

        // The server reads the project from the database, so unsaved edits
        // would silently not be in the render.
        if (projectStore.isDirty) {
            try {
                await projectStore.save();
            } catch {
                serverError = 'Failed to save project before exporting.';
                serverStarting = false;
                return;
            }
        }

        try {
            render = await startBackendRender(project);
            startPolling(render.id);
        } catch {
            serverError = 'Failed to start export. Please try again.';
        } finally {
            serverStarting = false;
        }
    }

    /* ---------------- shared ---------------- */

    let mode = $state<ExportPath | null>(null);

    let serverActive = $derived(
        serverStarting ||
            (render !== null &&
                render.status !== 'completed' &&
                render.status !== 'failed'),
    );

    /** True while an export is in flight on either path. Blocks closing. */
    let isActive = $derived(browserRunning || serverActive);

    function resetAll(): void {
        stopPolling();
        render = null;
        serverError = null;
        serverStarting = false;
        browserProgress = null;
        browserBlob = null;
        browserWarnings = [];
        browserError = null;
    }

    function run(path: ExportPath): void {
        mode = path;

        if (path === 'browser') {
            void startBrowserExport();
        } else {
            void startServerRender();
        }
    }

    function handleRetry(): void {
        if (mode) {
            run(mode);
        }
    }

    // Prevent closing while actively rendering — both paths.
    $effect(() => {
        if (!open && isActive) {
            open = true;
        }
    });

    // Cleanup on close.
    $effect(() => {
        if (!open) {
            resetAll();
            mode = null;
        }
    });

    onDestroy(() => {
        stopPolling();
    });
</script>

<Dialog bind:open>
    <DialogContent class="sm:max-w-md">
        <DialogTitle>Export Video</DialogTitle>
        <DialogDescription>
            {projectStore.project?.resolution_width} x {projectStore.project?.resolution_height} at {projectStore.project?.fps}fps
        </DialogDescription>

        <div class="space-y-4 py-4">
            {#if mode === null}
                <!-- Chooser -->
                <div class="space-y-3">
                    {#if choice.browserAvailable}
                        <p class="text-sm text-muted-foreground">
                            Exporting here renders exactly what the preview shows,
                            including animation, text and transitions.
                        </p>
                    {:else}
                        <div class="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
                            <TriangleAlert class="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
                            <p class="text-xs text-amber-700 dark:text-amber-400">
                                {choice.browserUnavailableReason}
                            </p>
                        </div>
                    {/if}

                    <p class="text-xs text-muted-foreground">
                        The server render runs without keeping this tab open and
                        gives you a stored file, but it does not support animated
                        elements yet.
                    </p>
                </div>
            {:else if mode === 'browser'}
                {#if browserError}
                    <div class="flex flex-col items-center gap-3 py-4">
                        <div class="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                            <XCircle class="h-6 w-6 text-destructive" />
                        </div>
                        <p class="text-center text-sm text-destructive">{browserError}</p>
                    </div>
                {:else if browserBlob}
                    <div class="space-y-3">
                        <div class="flex flex-col items-center gap-3 py-2">
                            <div class="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
                                <CheckCircle2 class="h-6 w-6 text-emerald-500" />
                            </div>
                            <p class="text-sm font-medium">Your video is ready!</p>
                        </div>

                        {#if browserWarnings.length > 0}
                            <div class="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
                                <p class="mb-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                                    Some things are missing from this file:
                                </p>
                                <ul class="list-disc pl-4 text-xs text-amber-700 dark:text-amber-400">
                                    {#each browserWarnings as warning (warning)}
                                        <li>{warning}</li>
                                    {/each}
                                </ul>
                            </div>
                        {/if}
                    </div>
                {:else}
                    <div class="space-y-3">
                        <div class="flex items-center gap-3">
                            {#if browserProgress?.phase === 'audio'}
                                <Music class="h-4 w-4 animate-pulse text-primary" />
                            {:else if browserProgress?.phase === 'video'}
                                <Film class="h-4 w-4 animate-pulse text-primary" />
                            {:else if browserProgress?.phase === 'finalizing'}
                                <Layers class="h-4 w-4 animate-pulse text-primary" />
                            {:else}
                                <Spinner class="h-4 w-4 text-muted-foreground" />
                            {/if}
                            <span class="text-sm">{browserLabel}</span>
                        </div>

                        <Progress value={browserPercent} />

                        <p class="text-right text-xs tabular-nums text-muted-foreground">
                            {browserPercent}%
                        </p>
                        <p class="text-xs text-muted-foreground">
                            Keep this tab open and in the foreground until the export finishes.
                        </p>
                    </div>
                {/if}
            {:else if serverError}
                <div class="flex flex-col items-center gap-3 py-4">
                    <div class="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                        <XCircle class="h-6 w-6 text-destructive" />
                    </div>
                    <p class="text-center text-sm text-destructive">{serverError}</p>
                </div>
            {:else if !render}
                <div class="flex flex-col items-center gap-3 py-4">
                    <Spinner class="h-8 w-8 text-muted-foreground" />
                    <p class="text-sm text-muted-foreground">Starting export...</p>
                </div>
            {:else if render.status === 'completed'}
                <div class="flex flex-col items-center gap-3 py-4">
                    <div class="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
                        <CheckCircle2 class="h-6 w-6 text-emerald-500" />
                    </div>
                    <p class="text-sm font-medium">Your video is ready!</p>
                </div>
            {:else if render.status === 'failed'}
                <div class="flex flex-col items-center gap-3 py-4">
                    <div class="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                        <XCircle class="h-6 w-6 text-destructive" />
                    </div>
                    <p class="text-center text-sm text-destructive">
                        {render.error_message ?? 'An unexpected error occurred during rendering.'}
                    </p>
                </div>
            {:else}
                <div class="space-y-3">
                    <div class="flex items-center gap-3">
                        {#if render.status === 'queued'}
                            <Spinner class="h-4 w-4 text-muted-foreground" />
                        {:else if render.status === 'compositing'}
                            <Film class="h-4 w-4 animate-pulse text-primary" />
                        {:else if render.status === 'mixing'}
                            <Music class="h-4 w-4 animate-pulse text-primary" />
                        {:else}
                            <Layers class="h-4 w-4 animate-pulse text-primary" />
                        {/if}
                        <span class="text-sm">{statusLabels[render.status]}</span>
                    </div>

                    <Progress value={render.progress} />

                    <p class="text-right text-xs tabular-nums text-muted-foreground">
                        {render.progress}%
                    </p>
                </div>
            {/if}
        </div>

        <DialogFooter>
            {#if mode === null}
                <Button
                    variant="outline"
                    onclick={() => run('server')}
                    disabled={!projectStore.project}
                >
                    <Server class="mr-2 h-4 w-4" />
                    Render on server
                </Button>
                <Button
                    onclick={() => run(choice.defaultPath)}
                    disabled={!projectStore.project}
                >
                    <Film class="mr-2 h-4 w-4" />
                    {choice.browserAvailable ? 'Export here' : 'Render on server'}
                </Button>
            {:else if browserError || serverError || render?.status === 'failed'}
                <Button variant="outline" onclick={() => (open = false)}>Close</Button>
                {#if mode === 'browser' && choice.browserAvailable}
                    <Button variant="outline" onclick={() => run('server')}>
                        <Server class="mr-2 h-4 w-4" />
                        Render on server
                    </Button>
                {/if}
                <Button onclick={handleRetry}>
                    <RotateCcw class="mr-2 h-4 w-4" />
                    Retry
                </Button>
            {:else if mode === 'browser' && browserBlob}
                <Button variant="outline" onclick={() => (open = false)}>Close</Button>
                <Button onclick={downloadBrowserExport}>
                    <Download class="mr-2 h-4 w-4" />
                    Download MP4
                </Button>
            {:else if mode === 'server' && render?.status === 'completed'}
                <Button variant="outline" onclick={() => (open = false)}>Close</Button>
                <Button onclick={() => render && downloadRender(render)}>
                    <Download class="mr-2 h-4 w-4" />
                    Download MP4
                </Button>
            {:else}
                <Button variant="outline" disabled>Exporting...</Button>
            {/if}
        </DialogFooter>
    </DialogContent>
</Dialog>
