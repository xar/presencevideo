<script lang="ts">
    import { router } from '@inertiajs/svelte';
    import {
        Save,
        Download,
        Undo,
        Redo,
        MousePointer2,
        Type,
        Hand,
        Scissors,
        ChevronLeft,
        X,
        Code,
        FileDown,
        FileUp,
        Keyboard,
        SquareTerminal,
    } from 'lucide-svelte';
    import { Button } from '@/components/ui/button';
    import {
        DropdownMenu,
        DropdownMenuContent,
        DropdownMenuItem,
        DropdownMenuTrigger,
    } from '@/components/ui/dropdown-menu';
    import { Separator } from '@/components/ui/separator';
    import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
    import { projectStore, selectionStore, timelineStore } from '@/lib/editor';
    import { historyStore } from '@/lib/editor/history.svelte';
    import { downloadProjectJson, readProjectFile } from '@/lib/editor/project-json';
    import ResolutionPicker from './ResolutionPicker.svelte';
    import ExportDialog from './ExportDialog.svelte';
    import JsonEditorDialog from './JsonEditorDialog.svelte';

    let {
        jsonEditorOpen = $bindable(false),
        shortcutsOpen = $bindable(false),
    }: {
        jsonEditorOpen?: boolean;
        shortcutsOpen?: boolean;
    } = $props();

    let showSavedMessage = $state(false);
    let savedTimer: ReturnType<typeof setTimeout> | null = null;
    let exportDialogOpen = $state(false);
    let fileInput: HTMLInputElement;

    // Track when save completes to show brief "Saved" feedback
    let wasSaving = $state(false);
    $effect(() => {
        if (projectStore.isSaving) {
            wasSaving = true;
        } else if (wasSaving) {
            wasSaving = false;
            if (!projectStore.isDirty && !projectStore.lastSaveError) {
                showSavedMessage = true;
                if (savedTimer) clearTimeout(savedTimer);
                savedTimer = setTimeout(() => {
                    showSavedMessage = false;
                }, 2000);
            }
        }
    });

    let saveStatus = $derived.by(() => {
        if (projectStore.isSaving) return 'saving';
        if (projectStore.lastSaveError) return 'error';
        if (projectStore.isDirty) return 'unsaved';
        if (showSavedMessage) return 'saved';
        return null;
    });

    function goBack() {
        router.visit('/editor');
    }

    function handleSave() {
        projectStore.save();
    }

    function handleExportJson() {
        if (projectStore.project) {
            downloadProjectJson(projectStore.project);
        }
    }

    async function handleImportJson(e: Event) {
        const input = e.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;

        const result = await readProjectFile(file);
        if (result.valid) {
            projectStore.updateProject(result.data);
        } else {
            alert(`Import failed: ${result.error}`);
        }

        // Reset so the same file can be re-imported
        input.value = '';
    }

    function addTextOverlay() {
        const project = projectStore.project;
        if (!project) return;

        const selectedTrackId = selectionStore.selection.videoTrackId;
        const existingTrack = selectedTrackId
            ? project.video_tracks.find((track) => track.id === selectedTrackId)
            : project.video_tracks[0];
        const track = existingTrack ?? projectStore.addVideoTrack();

        const clip = projectStore.addVideoClip(track.id, {
            type: 'text',
            text: 'Text Overlay',
            start_ms: timelineStore.currentTimeMs,
            duration_ms: 3000,
            x: Math.round(project.resolution_width * 0.25),
            y: Math.round(project.resolution_height * 0.75),
            width: Math.round(project.resolution_width * 0.5),
            height: 96,
            font_size: 48,
            font_color: '#ffffff',
            font_weight: 'bold',
            background_color: '#00000080',
        });

        selectionStore.selectVideoClip(track.id, clip.id);
        selectionStore.setTool('select');
    }
</script>

<div class="flex h-12 items-center gap-2 border-b bg-background px-2">
    <TooltipProvider>
        <Tooltip>
            <TooltipTrigger>
                {#snippet child({ props })}
                    <Button {...props} variant="ghost" size="icon" onclick={goBack}>
                        <ChevronLeft class="h-4 w-4" />
                    </Button>
                {/snippet}
            </TooltipTrigger>
            <TooltipContent>Back to Projects</TooltipContent>
        </Tooltip>

        <div class="flex flex-1 items-center justify-center gap-2 truncate px-4">
            <span class="text-sm font-medium truncate">
                {projectStore.project?.name ?? 'Untitled'}
            </span>
            {#if saveStatus === 'saving'}
                <span class="text-xs text-muted-foreground animate-pulse">Saving...</span>
            {:else if saveStatus === 'error'}
                <span class="flex items-center gap-1 text-xs text-destructive">
                    {projectStore.lastSaveError}
                    <button type="button" onclick={() => projectStore.dismissSaveError()} class="hover:text-destructive/80">
                        <X class="h-3 w-3" />
                    </button>
                </span>
            {:else if saveStatus === 'unsaved'}
                <span class="text-xs text-muted-foreground">Unsaved</span>
            {:else if saveStatus === 'saved'}
                <span class="text-xs text-muted-foreground">Saved</span>
            {/if}
        </div>

        <div class="flex items-center gap-1">
            <Tooltip>
                <TooltipTrigger>
                    {#snippet child({ props })}
                        <Button
                            {...props}
                            variant={selectionStore.tool === 'select' ? 'secondary' : 'ghost'}
                            size="icon"
                            onclick={() => selectionStore.setTool('select')}
                        >
                            <MousePointer2 class="h-4 w-4" />
                        </Button>
                    {/snippet}
                </TooltipTrigger>
                <TooltipContent>Select Tool (V)</TooltipContent>
            </Tooltip>

            <Tooltip>
                <TooltipTrigger>
                    {#snippet child({ props })}
                        <Button
                            {...props}
                            variant="ghost"
                            size="icon"
                            onclick={addTextOverlay}
                        >
                            <Type class="h-4 w-4" />
                        </Button>
                    {/snippet}
                </TooltipTrigger>
                <TooltipContent>Add Text Overlay</TooltipContent>
            </Tooltip>

            <Tooltip>
                <TooltipTrigger>
                    {#snippet child({ props })}
                        <Button
                            {...props}
                            variant={selectionStore.tool === 'pan' ? 'secondary' : 'ghost'}
                            size="icon"
                            onclick={() => selectionStore.setTool('pan')}
                        >
                            <Hand class="h-4 w-4" />
                        </Button>
                    {/snippet}
                </TooltipTrigger>
                <TooltipContent>Pan Tool (H)</TooltipContent>
            </Tooltip>

            <Tooltip>
                <TooltipTrigger>
                    {#snippet child({ props })}
                        <Button
                            {...props}
                            variant="ghost"
                            size="icon"
                            onclick={() => selectionStore.splitSelectedAtPlayhead()}
                        >
                            <Scissors class="h-4 w-4" />
                        </Button>
                    {/snippet}
                </TooltipTrigger>
                <TooltipContent>Split Clip at Playhead (S)</TooltipContent>
            </Tooltip>
        </div>

        <Separator orientation="vertical" class="h-6" />

        <div class="flex items-center gap-1">
            <Tooltip>
                <TooltipTrigger>
                    {#snippet child({ props })}
                        <Button
                            {...props}
                            variant="ghost"
                            size="icon"
                            onclick={() => historyStore.undo()}
                            disabled={!historyStore.canUndo}
                        >
                            <Undo class="h-4 w-4" />
                        </Button>
                    {/snippet}
                </TooltipTrigger>
                <TooltipContent>Undo (Cmd+Z)</TooltipContent>
            </Tooltip>

            <Tooltip>
                <TooltipTrigger>
                    {#snippet child({ props })}
                        <Button
                            {...props}
                            variant="ghost"
                            size="icon"
                            onclick={() => historyStore.redo()}
                            disabled={!historyStore.canRedo}
                        >
                            <Redo class="h-4 w-4" />
                        </Button>
                    {/snippet}
                </TooltipTrigger>
                <TooltipContent>Redo (Cmd+Shift+Z)</TooltipContent>
            </Tooltip>
        </div>

        <Separator orientation="vertical" class="h-6" />

        <ResolutionPicker />

        <Separator orientation="vertical" class="h-6" />

        <div class="flex items-center gap-1">
            <Tooltip>
                <TooltipTrigger>
                    {#snippet child({ props })}
                        <Button
                            {...props}
                            variant="ghost"
                            size="icon"
                            onclick={handleSave}
                            disabled={!projectStore.isDirty || projectStore.isSaving}
                        >
                            <Save class="h-4 w-4" />
                        </Button>
                    {/snippet}
                </TooltipTrigger>
                <TooltipContent>Save (Cmd+S)</TooltipContent>
            </Tooltip>

            <Tooltip>
                <TooltipTrigger>
                    {#snippet child({ props })}
                        <Button {...props} variant="ghost" size="icon" onclick={() => (exportDialogOpen = true)}>
                            <Download class="h-4 w-4" />
                        </Button>
                    {/snippet}
                </TooltipTrigger>
                <TooltipContent>Export Video</TooltipContent>
            </Tooltip>

            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    {#snippet children(menuProps)}
                        <Tooltip>
                            <TooltipTrigger>
                                {#snippet child({ props: tooltipProps })}
                                    <Button
                                        {...tooltipProps}
                                        variant="ghost"
                                        size="icon"
                                        onclick={menuProps.onclick}
                                        aria-expanded={menuProps['aria-expanded']}
                                        data-state={menuProps['data-state']}
                                    >
                                        <Code class="h-4 w-4" />
                                    </Button>
                                {/snippet}
                            </TooltipTrigger>
                            <TooltipContent>JSON Tools</TooltipContent>
                        </Tooltip>
                    {/snippet}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                        {#snippet children(props)}
                            <button class={props.class} onclick={(e) => { props.onClick?.(e); handleExportJson(); }}>
                                <FileDown class="h-4 w-4" />
                                Export JSON
                            </button>
                        {/snippet}
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                        {#snippet children(props)}
                            <button class={props.class} onclick={(e) => { props.onClick?.(e); fileInput.click(); }}>
                                <FileUp class="h-4 w-4" />
                                Import JSON
                            </button>
                        {/snippet}
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                        {#snippet children(props)}
                            <button class={props.class} onclick={(e) => { props.onClick?.(e); jsonEditorOpen = true; }}>
                                <SquareTerminal class="h-4 w-4" />
                                Code Editor
                            </button>
                        {/snippet}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <Tooltip>
                <TooltipTrigger>
                    {#snippet child({ props })}
                        <Button {...props} variant="ghost" size="icon" onclick={() => (shortcutsOpen = true)}>
                            <Keyboard class="h-4 w-4" />
                        </Button>
                    {/snippet}
                </TooltipTrigger>
                <TooltipContent>Keyboard Shortcuts (?)</TooltipContent>
            </Tooltip>
        </div>
    </TooltipProvider>
</div>

<input
    bind:this={fileInput}
    type="file"
    accept=".json"
    class="hidden"
    onchange={handleImportJson}
/>

<ExportDialog bind:open={exportDialogOpen} />
<JsonEditorDialog bind:open={jsonEditorOpen} />
