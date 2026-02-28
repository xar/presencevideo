<script lang="ts">
    import { router } from '@inertiajs/svelte';
    import {
        Sparkles,
        Image,
        Video,
        Music,
        Mic,
        Wand2,
        ChevronRight,
        ChevronLeft,
        Check,
        Loader2,
        Play,
        Zap,
        ArrowRight,
        ExternalLink,
    } from 'lucide-svelte';
    import { onMount } from 'svelte';
    import { Badge } from '@/components/ui/badge';
    import { Button } from '@/components/ui/button';
    import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
    import { Label } from '@/components/ui/label';
    import { Separator } from '@/components/ui/separator';
    import { projectStore, selectionStore, generationTracker } from '@/lib/editor';
    import type { GenerationType, GenerationStatus, Asset, ModelConfig, ModelsResponse } from '@/types';
    import ModelParameters from './ModelParameters.svelte';
    import ModelPicker from './ModelPicker.svelte';

    let selectedScene = $derived(selectionStore.getSelectedScene());
    let currentMode = $state<'menu' | 'generate' | 'pipeline'>('menu');
    let currentType = $state<GenerationType | null>(null);

    // Get image asset from current scene for image-to-video generation
    let sceneImageAsset = $derived.by(() => {
        if (!selectedScene || !projectStore.project?.assets) return null;
        // Find first image layer in scene
        const imageLayer = selectedScene.layers.find(l => l.type === 'image');
        if (!imageLayer || !('asset_id' in imageLayer)) return null;
        // Find the corresponding asset
        return projectStore.project.assets.find(a => a.id === imageLayer.asset_id) ?? null;
    });
    let currentModelKey = $state<string | null>(null);
    let prompt = $state('');
    let parameters = $state<Record<string, unknown>>({});
    let isGenerating = $state(false);
    let models = $state<Record<string, ModelConfig[]>>({});
    let isLoadingModels = $state(true);
    let parametersByModel = $state<Record<string, Record<string, unknown>>>({});
    let isLoadingCatalogModel = $state(false);

    // Helper to get CSRF token from meta tag or cookie
    function getCsrfToken(): string {
        return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content
            ?? decodeURIComponent(document.cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1] ?? '')
            ?? '';
    }
    let catalogModels = $state<Record<string, ModelConfig>>({});

    // Pipeline state
    let pipelineSteps = $state<{
        type: GenerationType;
        modelKey: string;
        prompt: string;
        parameters: Record<string, unknown>;
        status: 'pending' | 'generating' | 'completed' | 'failed';
        asset?: Asset;
        generationId?: number;
    }[]>([]);
    let currentPipelineStep = $state(0);

    const generationTypes: { type: GenerationType; label: string; icon: typeof Image; description: string }[] = [
        { type: 'text_to_image', label: 'Text to Image', icon: Image, description: 'Generate images from text prompts' },
        { type: 'image_to_video', label: 'Image to Video', icon: Video, description: 'Animate images into videos' },
        { type: 'text_to_music', label: 'Background Music', icon: Music, description: 'Generate music from descriptions' },
        { type: 'text_to_speech', label: 'Text to Speech', icon: Mic, description: 'Convert text to natural speech' },
        { type: 'text_to_sfx', label: 'Sound Effects', icon: Wand2, description: 'Generate sound effects' },
    ];

    let currentTypeConfig = $derived(generationTypes.find(t => t.type === currentType));

    // Map fal.ai categories to our generation types
    const categoryToType: Record<string, string[]> = {
        'text_to_image': ['text-to-image'],
        'image_to_video': ['image-to-video'],
        'text_to_music': ['text-to-audio'],
        'text_to_speech': ['text-to-speech'],
        'text_to_sfx': ['text-to-audio'],
    };

    // Combine registry models with any loaded catalog models for current type
    let availableModels = $derived.by(() => {
        const type = currentType;
        if (!type) return [];
        const registryModels = models[type] ?? [];
        const allowedCategories = categoryToType[type] ?? [];
        const catalogForType = Object.values(catalogModels).filter(m =>
            allowedCategories.includes(m.category)
        );
        return [...registryModels, ...catalogForType];
    });

    let currentModel = $derived(availableModels.find(m => m.key === currentModelKey));

    onMount(async () => {
        await loadModels();
    });

    async function loadModels() {
        try {
            const response = await fetch('/editor/generations/models');
            if (response.ok) {
                const data: ModelsResponse = await response.json();
                models = data.models;
            }
        } catch (err) {
            console.error('Failed to load models:', err);
        } finally {
            isLoadingModels = false;
        }
    }

    function selectType(type: GenerationType) {
        currentType = type;
        currentMode = 'generate';
        prompt = '';

        const typeModels = models[type] ?? [];
        if (typeModels.length > 0) {
            selectModel(typeModels[0].key);
        } else {
            parameters = {};
        }
    }

    function selectModel(key: string) {
        // Save current model's parameters before switching
        if (currentModelKey && Object.keys(parameters).length > 0) {
            parametersByModel[currentModelKey] = { ...parameters };
        }

        currentModelKey = key;
        const model = availableModels.find(m => m.key === key);
        if (model) {
            // Use cached parameters or defaults
            parameters = parametersByModel[key] ?? { ...model.defaults };
        }
    }

    // Persist parameters when they change
    $effect(() => {
        if (currentModelKey && Object.keys(parameters).length > 0) {
            parametersByModel[currentModelKey] = { ...parameters };
        }
    });

    async function selectCatalogModel(endpointId: string) {
        // Check if we already loaded this model
        if (catalogModels[endpointId]) {
            selectModel(endpointId);
            return;
        }

        isLoadingCatalogModel = true;
        try {
            const response = await fetch(`/editor/generations/catalog/model?endpoint_id=${encodeURIComponent(endpointId)}`);
            if (response.ok) {
                const data = await response.json();
                const model = data.model as ModelConfig;
                catalogModels = { ...catalogModels, [endpointId]: model };
                selectModel(endpointId);
            } else {
                console.error('Failed to load catalog model');
            }
        } catch (err) {
            console.error('Failed to load catalog model:', err);
        } finally {
            isLoadingCatalogModel = false;
        }
    }

    function goBack() {
        if (currentMode === 'generate') {
            currentMode = 'menu';
            currentType = null;
            currentModelKey = null;
        } else if (currentMode === 'pipeline') {
            currentMode = 'menu';
            pipelineSteps = [];
            currentPipelineStep = 0;
        }
    }

    async function startGeneration() {
        if (!currentType || !prompt.trim() || !projectStore.project || !selectedScene || !currentModelKey) return;

        // For image-to-video, require an image in the scene
        if (currentType === 'image_to_video' && !sceneImageAsset) {
            alert('Add an image to the scene first to animate it into a video.');
            return;
        }

        isGenerating = true;

        // Determine if this is a catalog model (has fal-ai/ prefix) or registry model
        const isCatalogModel = currentModel?.is_catalog || currentModelKey.includes('/');

        try {
            const csrfToken = getCsrfToken();
            const response = await fetch(
                `/editor/projects/${projectStore.project.id}/generate/${currentType}`,
                {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-TOKEN': csrfToken,
                        'X-XSRF-TOKEN': csrfToken,
                    },
                    body: JSON.stringify({
                        prompt: prompt.trim(),
                        scene_id: selectedScene.id,
                        model_key: isCatalogModel ? undefined : currentModelKey,
                        model_id: isCatalogModel ? currentModelKey : undefined,
                        parameters: parameters,
                        // Automatically pass the scene's image for image-to-video
                        input_asset_id: currentType === 'image_to_video' ? sceneImageAsset?.id : undefined,
                    }),
                }
            );

            if (response.ok) {
                const data = await response.json();
                generationTracker.add({
                    id: data.generation.id,
                    type: data.generation.type,
                    prompt: data.generation.prompt,
                    status: data.generation.status,
                    created_at: data.generation.created_at,
                }, { skipPolling: true });
                pollGeneration(data.generation.id);
            } else {
                const error = await response.json();
                alert('Generation failed: ' + (error.error || 'Unknown error'));
                isGenerating = false;
            }
        } catch (err) {
            console.error('Generation failed:', err);
            isGenerating = false;
        }
    }

    async function pollGeneration(generationId: number, callback?: (asset: Asset) => void) {
        const MAX_POLLS = 150; // 5 minutes at 2s intervals
        let pollCount = 0;

        const checkStatus = async () => {
            pollCount++;

            if (pollCount > MAX_POLLS) {
                isGenerating = false;
                alert('Generation timed out after 5 minutes. Please try again.');
                return;
            }

            try {
                const response = await fetch(`/editor/generations/${generationId}`);
                if (!response.ok) return;

                const data = await response.json();
                const status = data.generation.status as GenerationStatus;

                if (status === 'completed') {
                    isGenerating = false;
                    generationTracker.remove(generationId);
                    if (callback && data.generation.output_asset) {
                        callback(data.generation.output_asset);
                    } else {
                        prompt = '';
                        currentMode = 'menu';
                        currentType = null;
                        router.reload({ only: ['project'] });
                    }
                } else if (status === 'failed') {
                    isGenerating = false;
                    generationTracker.remove(generationId);
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

    function startImageToVideoPipeline() {
        currentMode = 'pipeline';
        const imgModels = models['text_to_image'] ?? [];
        const vidModels = models['image_to_video'] ?? [];

        pipelineSteps = [
            {
                type: 'text_to_image',
                modelKey: imgModels[0]?.key ?? 'flux-dev',
                prompt: '',
                parameters: imgModels[0]?.defaults ?? {},
                status: 'pending',
            },
            {
                type: 'image_to_video',
                modelKey: vidModels[0]?.key ?? 'minimax-video',
                prompt: '',
                parameters: vidModels[0]?.defaults ?? {},
                status: 'pending',
            },
        ];
        currentPipelineStep = 0;
    }

    function updatePipelineStep(index: number, updates: Partial<typeof pipelineSteps[0]>) {
        pipelineSteps = pipelineSteps.map((step, i) =>
            i === index ? { ...step, ...updates } : step
        );
    }

    function updatePipelineModel(index: number, modelKey: string) {
        const step = pipelineSteps[index];
        const stepModels = models[step.type] ?? [];
        const model = stepModels.find(m => m.key === modelKey);
        updatePipelineStep(index, {
            modelKey,
            parameters: model?.defaults ?? {}
        });
    }

    async function runPipelineStep(index: number) {
        const step = pipelineSteps[index];
        if (!step || !projectStore.project || !selectedScene) return;

        updatePipelineStep(index, { status: 'generating' });
        isGenerating = true;

        try {
            const body: Record<string, unknown> = {
                prompt: step.prompt.trim(),
                scene_id: selectedScene.id,
                model_key: step.modelKey,
                parameters: step.parameters,
            };

            if (step.type === 'image_to_video' && index > 0) {
                const prevStep = pipelineSteps[index - 1];
                if (prevStep?.asset?.id) {
                    body.input_asset_id = prevStep.asset.id;
                }
            }

            const csrfToken = getCsrfToken();
            const response = await fetch(
                `/editor/projects/${projectStore.project.id}/generate/${step.type}`,
                {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-TOKEN': csrfToken,
                        'X-XSRF-TOKEN': csrfToken,
                    },
                    body: JSON.stringify(body),
                }
            );

            if (response.ok) {
                const data = await response.json();
                generationTracker.add({
                    id: data.generation.id,
                    type: data.generation.type,
                    prompt: data.generation.prompt,
                    status: data.generation.status,
                    created_at: data.generation.created_at,
                }, { skipPolling: true });
                updatePipelineStep(index, { generationId: data.generation.id });
                pollGeneration(data.generation.id, (asset) => {
                    updatePipelineStep(index, { status: 'completed', asset });
                    isGenerating = false;

                    if (index < pipelineSteps.length - 1) {
                        currentPipelineStep = index + 1;
                    } else {
                        router.reload({ only: ['project'] });
                    }
                });
            } else {
                updatePipelineStep(index, { status: 'failed' });
                isGenerating = false;
            }
        } catch (err) {
            console.error('Pipeline step failed:', err);
            updatePipelineStep(index, { status: 'failed' });
            isGenerating = false;
        }
    }
</script>

<div class="flex overflow-auto w-full flex-col border-l bg-background">
    <!-- Header -->
    <div class="flex items-center gap-2 p-3 border-b">
        {#if currentMode !== 'menu'}
            <Button variant="ghost" size="icon" class="h-6 w-6" onclick={goBack}>
                <ChevronLeft class="h-4 w-4" />
            </Button>
        {/if}
        <Sparkles class="h-4 w-4 text-primary" />
        <h2 class="text-sm font-semibold flex-1">
            {#if currentMode === 'pipeline'}
                Image → Video Pipeline
            {:else if currentTypeConfig}
                {currentTypeConfig.label}
            {:else}
                AI Generation
            {/if}
        </h2>
        {#if currentModel && currentMode === 'generate'}
            <a
                href={currentModel.playground_url}
                target="_blank"
                rel="noopener noreferrer"
                class="text-muted-foreground hover:text-foreground"
                title="Open on fal.ai"
            >
                <ExternalLink class="h-4 w-4" />
            </a>
        {/if}
    </div>

    {#if !selectedScene}
        <div class="flex-1 flex items-center justify-center p-4 text-center">
            <p class="text-sm text-muted-foreground">Select a scene to generate content</p>
        </div>
    {:else if isLoadingModels}
        <div class="flex-1 flex items-center justify-center">
            <Loader2 class="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
    {:else if currentMode === 'menu'}
        <!-- Main Menu -->
        <div class="flex-1 overflow-y-auto p-3 space-y-3">
            <!-- Quick Pipeline -->
            <Card class="border-primary/50 bg-primary/5">
                <CardHeader class="p-3 pb-2">
                    <CardTitle class="text-sm flex items-center gap-2">
                        <Zap class="h-4 w-4 text-primary" />
                        Quick Pipeline
                    </CardTitle>
                    <CardDescription class="text-xs">
                        Generate image and animate it in one workflow
                    </CardDescription>
                </CardHeader>
                <CardContent class="p-3 pt-0">
                    <Button class="w-full" size="sm" onclick={startImageToVideoPipeline}>
                        <Image class="mr-1 h-3 w-3" />
                        <ArrowRight class="mx-1 h-3 w-3" />
                        <Video class="mr-2 h-3 w-3" />
                        Image to Video
                    </Button>
                </CardContent>
            </Card>

            <Separator />
            <p class="text-xs text-muted-foreground">Or generate individually:</p>

            {#each generationTypes as genType (genType.type)}
                {@const typeModels = models[genType.type] ?? []}
                <button type="button" class="w-full text-left" onclick={() => selectType(genType.type)}>
                    <Card class="cursor-pointer hover:border-primary/50 transition-colors">
                        <CardContent class="flex items-center gap-3 p-3">
                            <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                                <genType.icon class="h-4 w-4 text-primary" />
                            </div>
                            <div class="flex-1 min-w-0">
                                <div class="flex items-center gap-2">
                                    <p class="text-sm font-medium">{genType.label}</p>
                                    <Badge variant="outline" class="text-[10px] px-1 py-0">
                                        {typeModels.length} models
                                    </Badge>
                                </div>
                                <p class="text-xs text-muted-foreground truncate">{genType.description}</p>
                            </div>
                            <ChevronRight class="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        </CardContent>
                    </Card>
                </button>
            {/each}
        </div>
    {:else if currentMode === 'pipeline'}
        <!-- Pipeline Mode -->
        <div class="flex-1 overflow-y-auto p-3 space-y-4">
            {#each pipelineSteps as step, index (index)}
                {@const stepType = generationTypes.find(t => t.type === step.type)}
                {@const stepModels = models[step.type] ?? []}
                {@const isActive = index === currentPipelineStep}
                {@const isCompleted = step.status === 'completed'}
                {@const isLocked = index > 0 && pipelineSteps[index - 1].status !== 'completed'}

                <Card class={`transition-all ${isActive ? 'border-primary ring-1 ring-primary/20' : ''} ${isCompleted ? 'border-green-500/50 bg-green-500/5' : ''} ${isLocked ? 'opacity-50' : ''}`}>
                    <CardHeader class="p-3 pb-2">
                        <div class="flex items-center gap-2">
                            <div class={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${isCompleted ? 'bg-green-500 text-white' : isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                                {#if isCompleted}
                                    <Check class="h-3 w-3" />
                                {:else}
                                    {index + 1}
                                {/if}
                            </div>
                            <CardTitle class="text-sm">{stepType?.label}</CardTitle>
                            {#if step.status === 'generating'}
                                <Loader2 class="h-3 w-3 animate-spin text-primary ml-auto" />
                            {/if}
                        </div>
                    </CardHeader>

                    {#if isActive && !isLocked}
                        <CardContent class="p-3 pt-0 space-y-3">
                            <!-- Model Selection -->
                            <div class="space-y-1 w-full overflow-hidden model-selection">
                                <Label class="text-xs">Model</Label>
                                <ModelPicker
                                    models={stepModels}
                                    bind:selectedKey={step.modelKey}
                                    compact={true}
                                    disabled={step.status === 'generating'}
                                />
                            </div>

                            <!-- Prompt -->
                            <div class="space-y-1">
                                <Label class="text-xs">Prompt</Label>
                                <textarea
                                    value={step.prompt}
                                    rows={3}
                                    class="w-full rounded-md border bg-transparent px-2 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                                    placeholder={step.type === 'text_to_image' ? 'Describe the image...' : 'Describe the motion/animation...'}
                                    disabled={step.status === 'generating'}
                                    oninput={(e) => updatePipelineStep(index, { prompt: e.currentTarget.value })}
                                ></textarea>
                            </div>

                            <Button
                                class="w-full"
                                size="sm"
                                onclick={() => runPipelineStep(index)}
                                disabled={!step.prompt.trim() || step.status === 'generating'}
                            >
                                {#if step.status === 'generating'}
                                    <Loader2 class="mr-2 h-3 w-3 animate-spin" />
                                    Generating...
                                {:else}
                                    <Play class="mr-2 h-3 w-3" />
                                    Generate {stepType?.label}
                                {/if}
                            </Button>
                        </CardContent>
                    {:else if isCompleted && step.asset}
                        <CardContent class="p-3 pt-0">
                            <div class="flex items-center gap-2 text-xs text-green-600">
                                <Check class="h-3 w-3" />
                                <span class="truncate">Generated: {step.asset.name}</span>
                            </div>
                        </CardContent>
                    {/if}
                </Card>

                {#if index < pipelineSteps.length - 1}
                    <div class="flex justify-center">
                        <ArrowRight class={`h-4 w-4 ${pipelineSteps[index].status === 'completed' ? 'text-green-500' : 'text-muted-foreground'}`} />
                    </div>
                {/if}
            {/each}
        </div>
    {:else if currentMode === 'generate'}
        <!-- Single Generation Mode -->
        <div class="flex-1 overflow-y-auto p-3 space-y-4">
            <!-- Input Image Preview for image-to-video -->
            {#if currentType === 'image_to_video'}
                <Card class={sceneImageAsset ? 'border-primary/50 bg-primary/5' : 'border-destructive/50 bg-destructive/5'}>
                    <CardHeader class="p-3 pb-2">
                        <CardTitle class="text-xs flex items-center gap-2">
                            <Image class="h-3 w-3" />
                            Source Image
                        </CardTitle>
                    </CardHeader>
                    <CardContent class="p-3 pt-0">
                        {#if sceneImageAsset}
                            <div class="space-y-2">
                                <div class="aspect-video rounded-md overflow-hidden bg-muted">
                                    <img
                                        src={sceneImageAsset.url ?? sceneImageAsset.thumbnail_url}
                                        alt={sceneImageAsset.name}
                                        class="w-full h-full object-contain"
                                    />
                                </div>
                                <p class="text-xs text-muted-foreground truncate">
                                    {sceneImageAsset.name}
                                </p>
                            </div>
                        {:else}
                            <p class="text-xs text-destructive">
                                No image in scene. Add an image layer first to animate it.
                            </p>
                        {/if}
                    </CardContent>
                </Card>
                <Separator />
            {/if}

            <!-- Model Selection -->
            <div class="space-y-2 model-selection w-full">
                <Label class="text-xs font-medium">Model</Label>
                <ModelPicker
                    models={availableModels}
                    bind:selectedKey={currentModelKey}
                    disabled={isGenerating || isLoadingCatalogModel}
                    category={currentType ?? ''}
                    onSelectCatalogModel={selectCatalogModel}
                />
                {#if isLoadingCatalogModel}
                    <div class="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 class="h-3 w-3 animate-spin" />
                        Loading model...
                    </div>
                {/if}
            </div>

            <Separator />

            <!-- Prompt -->
            <div class="space-y-2">
                <Label for="prompt" class="text-xs font-medium">
                    {#if currentType === 'text_to_image'}
                        Describe the image you want to generate
                    {:else if currentType === 'image_to_video'}
                        Describe the motion/animation
                    {:else if currentType === 'text_to_music'}
                        Describe the music style and mood
                    {:else if currentType === 'text_to_speech'}
                        Enter the text to speak
                    {:else if currentType === 'text_to_sfx'}
                        Describe the sound effect
                    {/if}
                </Label>

                <textarea
                    id="prompt"
                    bind:value={prompt}
                    rows={4}
                    class="w-full rounded-md border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                    placeholder="Enter your prompt..."
                    disabled={isGenerating}
                ></textarea>
            </div>

            <!-- Model Parameters -->
            {#if currentModel}
                <ModelParameters
                    parameters={currentModel.parameters}
                    bind:values={parameters}
                    defaults={currentModel.defaults}
                    disabled={isGenerating}
                />
            {/if}

            <!-- Generate Button -->
            <Button
                class="w-full"
                onclick={startGeneration}
                disabled={!prompt.trim() || isGenerating || !currentModelKey || (currentType === 'image_to_video' && !sceneImageAsset)}
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
    {/if}
</div>
