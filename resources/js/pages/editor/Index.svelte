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

    function createProject() {
        if (!newProjectName.trim() || isCreating) return;

        isCreating = true;
        router.post(
            '/editor/projects',
            { name: newProjectName.trim() },
            {
                onSuccess: () => {
                    isCreateDialogOpen = false;
                    newProjectName = '';
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
    <div class="flex h-full flex-col gap-6 p-6">
        <div class="flex items-center justify-between">
            <div>
                <h1 class="text-2xl font-semibold">Projects</h1>
                <p class="text-muted-foreground">Create and manage your video projects</p>
            </div>
            <Dialog bind:open={isCreateDialogOpen}>
                <DialogTrigger>
                    <Button>
                        <Plus class="mr-2 h-4 w-4" />
                        New Project
                    </Button>
                </DialogTrigger>
                <DialogContent class="sm:max-w-md">
                    <DialogTitle>Create New Project</DialogTitle>
                    <DialogDescription>
                        Give your project a name to get started.
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
            <Card class="flex flex-col items-center justify-center py-16">
                <Folder class="h-12 w-12 text-muted-foreground/50" />
                <h3 class="mt-4 text-lg font-medium">No projects yet</h3>
                <p class="mt-1 text-sm text-muted-foreground">
                    Create your first video project to get started.
                </p>
                <Button class="mt-4" onclick={() => (isCreateDialogOpen = true)}>
                    <Plus class="mr-2 h-4 w-4" />
                    Create Project
                </Button>
            </Card>
        {:else}
            <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {#each projects as project (project.id)}
                    <button
                        type="button"
                        class="text-left"
                        onclick={() => openProject(project)}
                    >
                        <Card class="cursor-pointer transition-shadow hover:shadow-md">
                            <CardContent class="p-0">
                                <div class="aspect-video bg-muted flex items-center justify-center rounded-t-lg">
                                    <Video class="h-12 w-12 text-muted-foreground/30" />
                                </div>
                            </CardContent>
                            <CardHeader class="pb-2">
                                <CardTitle class="text-base truncate">{project.name}</CardTitle>
                                <CardDescription class="flex items-center gap-1 text-xs">
                                    <Clock class="h-3 w-3" />
                                    {formatDate(project.updated_at)}
                                </CardDescription>
                            </CardHeader>
                        </Card>
                    </button>
                {/each}
            </div>
        {/if}
    </div>
</AppLayout>
