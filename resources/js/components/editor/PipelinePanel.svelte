<script lang="ts">
    import { projectStore, selectionStore } from '@/lib/editor';
    import { Button } from '@/components/ui/button';
    import { Input } from '@/components/ui/input';
    import { Label } from '@/components/ui/label';
    import { Separator } from '@/components/ui/separator';
    import { Spinner } from '@/components/ui/spinner';
    import { Card, CardContent } from '@/components/ui/card';
    import {
        Sparkles,
        Image,
        Video,
        Music,
        Mic,
        ChevronRight,
        Check,
        X,
        Loader2,
    } from 'lucide-svelte';
    import type { GenerationType, GenerationStatus } from '@/types';
    import { router } from '@inertiajs/svelte';

    let selectedScene = $derived(selectionStore.getSelectedScene());
    let currentStep = $state<GenerationType | null>(null);
    let prompt = $state('');
    let isGenerating = $state(false);

    const steps = [
        { type: 'text_to_image' as GenerationType, label: 'Generate Image', icon: Image },
        { type: 'image_to_video' as GenerationType, label: 'Image to Video', icon: Video },
        { type: 'text_to_music' as GenerationType, label: 'Generate Music', icon: Music },
        { type: 'text_to_speech' as GenerationType, label: 'Text to Speech', icon: Mic },
    ];

    function selectStep(type: GenerationType) {
        currentStep = type;
        prompt = '';
    }

    async function startGeneration() {
        if (!currentStep || !prompt.trim() || !projectStore.project || !selectedScene) return;

        isGenerating = true;

        try {
            const response = await fetch(
                `/editor/projects/${projectStore.project.id}/generate/${currentStep}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-TOKEN': document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? '',
                    },
                    body: JSON.stringify({
                        prompt: prompt.trim(),
                        scene_id: selectedScene.id,
                    }),
                }
            );

            if (response.ok) {
                const data = await response.json();
                pollGeneration(data.generation.id);
            }
        } catch (err) {
            console.error('Generation failed:', err);
            isGenerating = false;
        }
    }

    async function pollGeneration(generationId: number) {
        const checkStatus = async () => {
            try {
                const response = await fetch(`/editor/generations/${generationId}`);
                if (!response.ok) return;

                const data = await response.json();
                const status = data.generation.status as GenerationStatus;

                if (status === 'completed') {
                    isGenerating = false;
                    prompt = '';
                    currentStep = null;
                    router.reload({ only: ['project'] });
                } else if (status === 'failed') {
                    isGenerating = false;
                    alert('Generation failed: ' + (data.generation.error_message || 'Unknown error'));
                } else {
                    setTimeout(checkStatus, 2000);
                }
            } catch (err) {
                console.error('Poll failed:', err);
                isGenerating = false;
            }
        };

        checkStatus();
    }
</script>

<div class="flex w-72 flex-col border-l bg-background">
    <div class="flex items-center gap-2 p-3 border-b">
        <Sparkles class="h-4 w-4 text-primary" />
        <h2 class="text-sm font-semibold">AI Generation</h2>
    </div>

    {#if !selectedScene}
        <div class="flex-1 flex items-center justify-center p-4 text-center">
            <p class="text-sm text-muted-foreground">Select a scene to generate content</p>
        </div>
    {:else if currentStep}
        <div class="flex-1 p-4 space-y-4">
            <Button variant="ghost" size="sm" onclick={() => (currentStep = null)}>
                <ChevronRight class="mr-1 h-3 w-3 rotate-180" />
                Back
            </Button>

            <div class="space-y-3">
                <Label for="prompt" class="text-sm">
                    {#if currentStep === 'text_to_image'}
                        Describe the image you want to generate
                    {:else if currentStep === 'image_to_video'}
                        Describe the motion/animation
                    {:else if currentStep === 'text_to_music'}
                        Describe the music style and mood
                    {:else if currentStep === 'text_to_speech'}
                        Enter the text to speak
                    {/if}
                </Label>

                <textarea
                    id="prompt"
                    bind:value={prompt}
                    rows="4"
                    class="w-full rounded-md border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    placeholder="Enter your prompt..."
                    disabled={isGenerating}
                />

                <Button
                    class="w-full"
                    onclick={startGeneration}
                    disabled={!prompt.trim() || isGenerating}
                >
                    {#if isGenerating}
                        <Loader2 class="mr-2 h-4 w-4 animate-spin" />
                        Generating...
                    {:else}
                        <Sparkles class="mr-2 h-4 w-4" />
                        Generate
                    {/if}
                </Button>
            </div>
        </div>
    {:else}
        <div class="flex-1 p-3 space-y-2">
            <p class="text-xs text-muted-foreground mb-3">
                Select a generation type to create AI content for this scene.
            </p>

            {#each steps as step}
                <button type="button" class="w-full text-left" onclick={() => selectStep(step.type)}>
                    <Card class="cursor-pointer hover:border-primary transition-colors">
                        <CardContent class="flex items-center gap-3 p-3">
                            <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                                <step.icon class="h-4 w-4 text-primary" />
                            </div>
                            <div class="flex-1">
                                <p class="text-sm font-medium">{step.label}</p>
                                <p class="text-xs text-muted-foreground">
                                    {#if step.type === 'text_to_image'}
                                        Create an image from text
                                    {:else if step.type === 'image_to_video'}
                                        Animate an image
                                    {:else if step.type === 'text_to_music'}
                                        Generate background music
                                    {:else if step.type === 'text_to_speech'}
                                        Convert text to voice
                                    {/if}
                                </p>
                            </div>
                            <ChevronRight class="h-4 w-4 text-muted-foreground" />
                        </CardContent>
                    </Card>
                </button>
            {/each}
        </div>
    {/if}
</div>
