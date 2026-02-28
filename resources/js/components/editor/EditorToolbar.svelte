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
        ChevronLeft,
        X,
    } from 'lucide-svelte';
    import { Button } from '@/components/ui/button';
    import { Separator } from '@/components/ui/separator';
    import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
    import { projectStore, selectionStore } from '@/lib/editor';
    import { historyStore } from '@/lib/editor/history.svelte';
    import ResolutionPicker from './ResolutionPicker.svelte';
    import ExportDialog from './ExportDialog.svelte';

    let showSavedMessage = $state(false);
    let savedTimer: ReturnType<typeof setTimeout> | null = null;
    let exportDialogOpen = $state(false);

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
                            variant={selectionStore.tool === 'text' ? 'secondary' : 'ghost'}
                            size="icon"
                            onclick={() => selectionStore.setTool('text')}
                        >
                            <Type class="h-4 w-4" />
                        </Button>
                    {/snippet}
                </TooltipTrigger>
                <TooltipContent>Text Tool (T)</TooltipContent>
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
        </div>
    </TooltipProvider>
</div>

<ExportDialog bind:open={exportDialogOpen} />
