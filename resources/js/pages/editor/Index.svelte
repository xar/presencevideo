<script lang="ts">
    import { router } from '@inertiajs/svelte';
    import { Plus, Video, Clock, Folder } from 'lucide-svelte';
    import AppHead from '@/components/AppHead.svelte';
    import { Button } from '@/components/ui/button';
    import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
    import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
    import { Input } from '@/components/ui/input';
    import { Label } from '@/components/ui/label';
    import AppLayout from '@/layouts/AppLayout.svelte';
    import type { BreadcrumbItem, Project } from '@/types';

    let { projects = [] }: { projects: Project[] } = $props();

    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Projects', href: '/editor' },
    ];

    let isCreateDialogOpen = $state(false);
    let newProjectName = $state('');
    let isCreating = $state(false);

    type ResolutionPreset = {
        label: string;
        width: number;
        height: number;
        category: string;
    };

    const resolutionPresets: ResolutionPreset[] = [
        { label: 'TikTok / Reels', width: 1080, height: 1920, category: 'Portrait' },
        { label: 'YouTube / FHD', width: 1920, height: 1080, category: 'Landscape' },
        { label: 'Instagram Square', width: 1080, height: 1080, category: 'Square' },
        { label: 'YouTube / 4K', width: 3840, height: 2160, category: 'Landscape' },
        { label: 'Instagram Portrait', width: 1080, height: 1350, category: 'Portrait' },
        { label: 'HD 720p', width: 1280, height: 720, category: 'Landscape' },
    ];

    let selectedPresetIndex = $state(0);

    function createProject() {
        if (!newProjectName.trim() || isCreating) return;

        const preset = resolutionPresets[selectedPresetIndex];
        isCreating = true;
        router.post(
            '/editor/projects',
            {
                name: newProjectName.trim(),
                resolution_width: preset.width,
                resolution_height: preset.height,
            },
            {
                onSuccess: () => {
                    isCreateDialogOpen = false;
                    newProjectName = '';
                    selectedPresetIndex = 0;
                    isCreating = false;
                },
                onError: () => {
                    isCreating = false;
                },
            }
        );
    }

    function openProject(project: Project) {
        router.visit(`/editor/projects/${project.id}`);
    }

    function formatDate(dateString: string): string {
        return new Date(dateString).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    }
</script>

<AppHead title="Video Editor" />

<AppLayout {breadcrumbs}>
    <div class="flex h-full flex-col gap-6 p-6 max-w-[1400px] mx-auto w-full">
        <div class="flex items-center justify-between">
            <div>
                <h1 class="text-3xl font-semibold tracking-tight text-foreground/90">Projects</h1>
                <p class="text-sm text-muted-foreground mt-1">Create and manage your video projects</p>
            </div>
            <Dialog bind:open={isCreateDialogOpen}>
                <DialogTrigger>
                    <Button class="rounded-full px-5 shadow-sm">
                        <Plus class="mr-2 h-4 w-4" />
                        New Project
                    </Button>
                </DialogTrigger>
                <DialogContent class="sm:max-w-lg">
                    <DialogTitle>Create New Project</DialogTitle>
                    <DialogDescription>
                        Give your project a name and choose a resolution.
                    </DialogDescription>
                    <form onsubmit={(e) => { e.preventDefault(); createProject(); }}>
                        <div class="grid gap-4 py-4">
                            <div class="grid gap-2">
                                <Label for="name">Project Name</Label>
                                <Input
                                    id="name"
                                    value={newProjectName}
                                    oninput={(e: Event) => newProjectName = (e.target as HTMLInputElement).value}
                                    placeholder="My Awesome Video"
                                    autofocus
                                />
                            </div>
                            <div class="grid gap-2">
                                <Label>Resolution</Label>
                                <div class="grid grid-cols-3 gap-2">
                                    {#each resolutionPresets as preset, i}
                                        <button
                                            type="button"
                                            class="flex flex-col items-center gap-1 rounded-lg border-2 px-3 py-2.5 text-center transition-colors {selectedPresetIndex === i ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}"
                                            onclick={() => (selectedPresetIndex = i)}
                                        >
                                            <span class="text-xs font-medium leading-tight">{preset.label}</span>
                                            <span class="text-[10px] text-muted-foreground tabular-nums">{preset.width} × {preset.height}</span>
                                        </button>
                                    {/each}
                                </div>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onclick={() => (isCreateDialogOpen = false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={!newProjectName.trim() || isCreating}>
                                {isCreating ? 'Creating...' : 'Create Project'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>

        {#if projects.length === 0}
            <Card class="flex flex-col items-center justify-center py-24 border-dashed bg-sidebar/30 shadow-none border-border/50 relative overflow-hidden group">
                <div class="absolute inset-0 bg-gradient-to-br from-primary/5 via-accent/5 to-chart-3/5 opacity-0 group-hover:opacity-100 transition-opacity duration-1000"></div>
                <div class="h-28 w-28 rounded-[2rem] bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center mb-6 relative z-10 shadow-lg shadow-primary/5 border border-primary/10 group-hover:scale-110 group-hover:rotate-6 transition-all duration-500 overflow-hidden">
                    <div class="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent dark:from-white/5 opacity-50"></div>
                    <Video class="h-12 w-12 text-primary/70 group-hover:text-primary transition-colors" />
                </div>
                <h3 class="mt-4 text-3xl font-black tracking-tight text-foreground/90 relative z-10">Your Canvas Awaits</h3>
                <p class="mt-3 mb-10 text-lg text-muted-foreground max-w-md text-center relative z-10 leading-relaxed">
                    Create your first video project to start bringing your creative vision to life in a matter of minutes.
                </p>
                <Button size="lg" onclick={() => (isCreateDialogOpen = true)} class="relative z-10 rounded-2xl px-10 h-14 text-base shadow-xl shadow-primary/25 hover:shadow-primary/40 transition-all hover:-translate-y-1 hover:scale-105 duration-300">
                    <Plus class="mr-3 h-5 w-5" />
                    Create New Project
                </Button>
            </Card>
        {:else}
            <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {#each projects as project (project.id)}
                    <button
                        type="button"
                        class="text-left group outline-none focus-visible:ring-4 focus-visible:ring-primary/20 focus-visible:ring-offset-2 rounded-[2rem] transition-all duration-500"
                        onclick={() => openProject(project)}
                    >
                        <Card class="cursor-pointer transition-all duration-500 hover:shadow-2xl hover:shadow-primary/10 hover:border-primary/30 border-border/50 bg-card shadow-lg shadow-black/[0.04] dark:shadow-black/20 overflow-hidden h-full flex flex-col group-hover:-translate-y-2">
                            <CardContent class="p-0">
                                <div class="aspect-video bg-gradient-to-br from-sidebar via-background to-muted flex items-center justify-center border-b border-border/50 relative overflow-hidden group-hover:from-primary/5 group-hover:via-accent/5 group-hover:to-chart-3/5 transition-colors duration-700">
                                    <div class="absolute inset-0 bg-gradient-to-tr from-primary/5 via-transparent to-accent/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                                    <div class="absolute inset-0 bg-[url('/noise.svg')] opacity-[0.03] mix-blend-overlay pointer-events-none"></div>
                                    <div class="h-16 w-16 rounded-[1.5rem] bg-white/50 dark:bg-black/20 backdrop-blur-md flex items-center justify-center shadow-sm border border-white/20 dark:border-white/5 transform group-hover:scale-110 group-hover:rotate-6 transition-all duration-500">
                                        <Video class="h-8 w-8 text-muted-foreground/50 group-hover:text-primary transition-colors duration-500" />
                                    </div>
                                </div>
                            </CardContent>
                            <CardHeader class="p-6 flex-1 bg-card/50 backdrop-blur-sm z-10 relative">
                                <CardTitle class="text-lg font-bold truncate text-foreground/90 group-hover:text-primary transition-colors">{project.name}</CardTitle>
                                <CardDescription class="flex items-center gap-2 mt-2 font-medium text-xs text-muted-foreground/80">
                                    <Clock class="h-3.5 w-3.5" />
                                    Edited {formatDate(project.updated_at)}
                                </CardDescription>
                            </CardHeader>
                        </Card>
                    </button>
                {/each}
            </div>
        {/if}
    </div>
</AppLayout>
