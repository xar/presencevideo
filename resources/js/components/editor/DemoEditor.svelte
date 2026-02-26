<script lang="ts">
    import { Link } from '@inertiajs/svelte';
    import { ArrowRight, Sparkles, Lock } from 'lucide-svelte';
    import { onMount } from 'svelte';
    import Button from '@/components/ui/button/Button.svelte';
    import { projectStore, selectionStore } from '@/lib/editor';
    import { toUrl } from '@/lib/utils';
    import { register, login } from '@/routes';
    import type { Project } from '@/types';
    import AssetPanel from './AssetPanel.svelte';
    import AudioTracks from './AudioTracks.svelte';
    import EditorToolbar from './EditorToolbar.svelte';
    import RightPanel from './RightPanel.svelte';
    import SceneEditor from './SceneEditor.svelte';
    import SceneStrip from './SceneStrip.svelte';
    import VideoTracks from './VideoTracks.svelte';

    let { canRegister = true }: { canRegister: boolean } = $props();

    let isHovered = $state(false);

    // Demo project data
    const demoProject: Project = {
        id: 0,
        user_id: 0,
        name: 'My First Video',
        resolution_width: 1920,
        resolution_height: 1080,
        fps: 30,
        status: 'draft',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        assets: [],
        scenes: [
            {
                id: 'demo-scene-1',
                name: 'Scene 1',
                duration_ms: 5000,
                background_color: '#1a1a2e',
                layers: [
                    {
                        id: 'demo-layer-1',
                        type: 'text',
                        text: 'Welcome to Presence',
                        x: 460,
                        y: 400,
                        width: 1000,
                        height: 120,
                        font_size: 72,
                        font_color: '#ffffff',
                        font_weight: 'bold',
                        text_align: 'center',
                        z_index: 1,
                    },
                    {
                        id: 'demo-layer-2',
                        type: 'text',
                        text: 'Create stunning videos with AI',
                        x: 560,
                        y: 520,
                        width: 800,
                        height: 60,
                        font_size: 32,
                        font_color: '#a78bfa',
                        text_align: 'center',
                        z_index: 2,
                    },
                ],
            },
            {
                id: 'demo-scene-2',
                name: 'Scene 2',
                duration_ms: 4000,
                background_color: '#0f172a',
                layers: [
                    {
                        id: 'demo-layer-3',
                        type: 'text',
                        text: 'Generate Images',
                        x: 660,
                        y: 480,
                        width: 600,
                        height: 80,
                        font_size: 56,
                        font_color: '#22d3ee',
                        font_weight: 'bold',
                        text_align: 'center',
                        z_index: 1,
                    },
                ],
            },
            {
                id: 'demo-scene-3',
                name: 'Scene 3',
                duration_ms: 4000,
                background_color: '#18181b',
                layers: [
                    {
                        id: 'demo-layer-4',
                        type: 'text',
                        text: 'Animate with AI',
                        x: 660,
                        y: 480,
                        width: 600,
                        height: 80,
                        font_size: 56,
                        font_color: '#f472b6',
                        font_weight: 'bold',
                        text_align: 'center',
                        z_index: 1,
                    },
                ],
            },
        ],
        audio_tracks: [
            {
                id: 'demo-audio-1',
                name: 'Music',
                volume: 1.0,
                clips: [],
            },
        ],
        video_tracks: [],
    };

    onMount(() => {
        projectStore.setProject(demoProject);
        if (demoProject.scenes.length > 0) {
            selectionStore.selectScene(demoProject.scenes[0].id);
        }
    });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    class="relative rounded-2xl border border-border/50 bg-background/40 p-2 backdrop-blur-xl shadow-2xl overflow-hidden"
    onmouseenter={() => isHovered = true}
    onmouseleave={() => isHovered = false}
>
    <!-- Editor Content -->
    <div
        class="rounded-xl border border-border/50 bg-card overflow-hidden transition-[filter] duration-500 ease-out"
        class:blur-sm={isHovered}
    >
        <div class="flex h-[85vh] min-h-[600px] max-h-[900px] flex-col">
            <EditorToolbar />

            <div class="flex flex-1 overflow-hidden">
                <AssetPanel />

                <div class="flex flex-1 flex-col overflow-hidden">
                    <div class="flex flex-1 overflow-hidden">
                        <SceneEditor />
                        <RightPanel />
                    </div>
                </div>
            </div>

            <div class="flex flex-col border-t">
                <SceneStrip />
                <VideoTracks />
                <AudioTracks />
            </div>
        </div>
    </div>

    <!-- Overlay - shows on hover -->
    <div
        class="absolute inset-0 z-50 flex items-center justify-center rounded-2xl transition-all duration-500 ease-out {isHovered ? 'opacity-100 bg-background/60' : 'opacity-0 pointer-events-none'}"
    >
        <div
            class="flex flex-col items-center text-center px-6 max-w-lg transition-all duration-500 ease-out {isHovered ? 'translate-y-0 scale-100' : 'translate-y-4 scale-95'}"
        >
            <div class="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 backdrop-blur-md">
                <Lock class="h-8 w-8 text-primary" />
            </div>

            <h3 class="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
                Try the full editor
            </h3>

            <p class="text-muted-foreground mb-8 text-base sm:text-lg">
                Sign up for free to unlock all AI generation features, save your projects, and export videos.
            </p>

            <div class="flex flex-col sm:flex-row items-center gap-3">
                {#if canRegister}
                    <Button size="lg" class="rounded-full h-12 px-8 shadow-lg shadow-primary/20 group" asChild>
                        {#snippet children(props)}
                            <Link href={toUrl(register())} {...props}>
                                <Sparkles class="h-4 w-4 mr-2" />
                                Start Creating Free
                                <ArrowRight class="h-4 w-4 ml-2 transition-transform group-hover:translate-x-1" />
                            </Link>
                        {/snippet}
                    </Button>
                {/if}
                <Button variant="outline" size="lg" class="rounded-full h-12 px-8 bg-background/80 backdrop-blur-md" asChild>
                    {#snippet children(props)}
                        <Link href={toUrl(login())} {...props}>
                            Sign In
                        </Link>
                    {/snippet}
                </Button>
            </div>

            <p class="mt-6 text-xs text-muted-foreground/70">
                No credit card required
            </p>
        </div>
    </div>
</div>
