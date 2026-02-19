<script lang="ts">
    import { Button } from '@/components/ui/button';
    import { Separator } from '@/components/ui/separator';
    import { projectStore, selectionStore } from '@/lib/editor';
    import {
        Save,
        Download,
        Undo,
        Redo,
        MousePointer2,
        Type,
        Hand,
        ChevronLeft,
    } from 'lucide-svelte';
    import { router } from '@inertiajs/svelte';
    import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

    function goBack() {
        router.visit('/editor');
    }

    function handleSave() {
        projectStore.save();
    }

    function handleExport() {
        const project = projectStore.project;
        if (!project) return;

        router.post(`/editor/projects/${project.id}/render`, {}, {
            preserveScroll: true,
        });
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

        <div class="flex-1 text-center text-sm font-medium truncate px-4">
            {projectStore.project?.name ?? 'Untitled'}
            {#if projectStore.isDirty}
                <span class="text-muted-foreground">*</span>
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
                        <Button {...props} variant="ghost" size="icon" onclick={handleExport}>
                            <Download class="h-4 w-4" />
                        </Button>
                    {/snippet}
                </TooltipTrigger>
                <TooltipContent>Export Video</TooltipContent>
            </Tooltip>
        </div>
    </TooltipProvider>
</div>
