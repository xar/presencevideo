<script lang="ts">
    import { onDestroy } from 'svelte';
    import {
        Download,
        CheckCircle2,
        XCircle,
        Film,
        Music,
        Layers,
        RotateCcw,
    } from 'lucide-svelte';
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
    import { store, show, download } from '@/actions/App/Http/Controllers/Editor/RenderController';
    import type { Render, RenderStatus } from '@/types/editor';

    let {
        open = $bindable(false),
    }: {
        open: boolean;
    } = $props();

    let render = $state<Render | null>(null);
    let isStarting = $state(false);
    let startError = $state<string | null>(null);
    let pollInterval = $state<ReturnType<typeof setInterval> | null>(null);

    const statusLabels: Record<RenderStatus, string> = {
        queued: 'Waiting in queue...',
        processing: 'Preparing scenes...',
        compositing: 'Compositing video...',
        mixing: 'Mixing audio...',
        completed: 'Export complete!',
        failed: 'Export failed',
    };

    let isActive = $derived(
        render !== null && render.status !== 'completed' && render.status !== 'failed',
    );

    function startPolling(renderId: number) {
        stopPolling();
        pollInterval = setInterval(async () => {
            try {
                const res = await fetch(show.url(renderId));
                if (!res.ok) return;
                const data = await res.json();
                render = data.render;

                if (render && (render.status === 'completed' || render.status === 'failed')) {
                    stopPolling();
                }
            } catch {
                // Silently continue polling
            }
        }, 1500);
    }

    function stopPolling() {
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }
    }

    async function startExport() {
        const project = projectStore.project;
        if (!project) return;

        isStarting = true;
        startError = null;
        render = null;

        // Save first if dirty
        if (projectStore.isDirty) {
            try {
                await projectStore.save();
            } catch {
                startError = 'Failed to save project before exporting.';
                isStarting = false;
                return;
            }
        }

        try {
            const res = await fetch(store.url(project.id), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-XSRF-TOKEN': decodeURIComponent(
                        document.cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1] ?? '',
                    ),
                },
            });

            if (!res.ok) {
                const data = await res.json().catch(() => null);
                startError = data?.message ?? `Export failed (${res.status})`;
                isStarting = false;
                return;
            }

            const data = await res.json();
            render = data.render;
            startPolling(data.render.id);
        } catch {
            startError = 'Failed to start export. Please try again.';
        } finally {
            isStarting = false;
        }
    }

    function handleDownload() {
        if (!render) return;
        window.location.href = download.url(render.id);
    }

    function handleRetry() {
        render = null;
        startError = null;
        startExport();
    }

    // Prevent closing while actively rendering
    $effect(() => {
        if (!open && (isActive || isStarting)) {
            open = true;
        }
    });

    // Auto-start export when dialog opens
    let started = $state(false);
    $effect(() => {
        if (open && !started) {
            started = true;
            startExport();
        }
        if (!open) {
            started = false;
        }
    });

    // Cleanup on close
    $effect(() => {
        if (!open) {
            stopPolling();
            render = null;
            startError = null;
            isStarting = false;
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
            {#if startError}
                <!-- Start error -->
                <div class="flex flex-col items-center gap-3 py-4">
                    <div class="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                        <XCircle class="h-6 w-6 text-destructive" />
                    </div>
                    <p class="text-sm text-destructive text-center">{startError}</p>
                </div>
            {:else if !render}
                <!-- Starting -->
                <div class="flex flex-col items-center gap-3 py-4">
                    <Spinner class="h-8 w-8 text-muted-foreground" />
                    <p class="text-sm text-muted-foreground">Starting export...</p>
                </div>
            {:else if render.status === 'completed'}
                <!-- Completed -->
                <div class="flex flex-col items-center gap-3 py-4">
                    <div class="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
                        <CheckCircle2 class="h-6 w-6 text-emerald-500" />
                    </div>
                    <p class="text-sm font-medium">Your video is ready!</p>
                </div>
            {:else if render.status === 'failed'}
                <!-- Failed -->
                <div class="flex flex-col items-center gap-3 py-4">
                    <div class="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                        <XCircle class="h-6 w-6 text-destructive" />
                    </div>
                    <p class="text-sm text-destructive text-center">
                        {render.error_message ?? 'An unexpected error occurred during rendering.'}
                    </p>
                </div>
            {:else}
                <!-- Progress -->
                <div class="space-y-3">
                    <div class="flex items-center gap-3">
                        {#if render.status === 'queued'}
                            <Spinner class="h-4 w-4 text-muted-foreground" />
                        {:else if render.status === 'compositing'}
                            <Film class="h-4 w-4 text-primary animate-pulse" />
                        {:else if render.status === 'mixing'}
                            <Music class="h-4 w-4 text-primary animate-pulse" />
                        {:else}
                            <Layers class="h-4 w-4 text-primary animate-pulse" />
                        {/if}
                        <span class="text-sm">{statusLabels[render.status]}</span>
                    </div>

                    <Progress value={render.progress} />

                    <p class="text-xs text-muted-foreground text-right tabular-nums">
                        {render.progress}%
                    </p>
                </div>
            {/if}
        </div>

        <DialogFooter>
            {#if startError || render?.status === 'failed'}
                <Button variant="outline" onclick={() => (open = false)}>Close</Button>
                <Button onclick={handleRetry}>
                    <RotateCcw class="mr-2 h-4 w-4" />
                    Retry
                </Button>
            {:else if render?.status === 'completed'}
                <Button variant="outline" onclick={() => (open = false)}>Close</Button>
                <Button onclick={handleDownload}>
                    <Download class="mr-2 h-4 w-4" />
                    Download MP4
                </Button>
            {:else}
                <Button variant="outline" disabled>
                    Exporting...
                </Button>
            {/if}
        </DialogFooter>
    </DialogContent>
</Dialog>
