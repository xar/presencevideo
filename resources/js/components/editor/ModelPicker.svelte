<script lang="ts">
    import {
        ChevronDown,
        ExternalLink,
        Sparkles,
        Star,
        Zap,
        Check,
        Search,
        SearchX,
        Globe,
        Loader2,
    } from 'lucide-svelte';
    import { Badge } from '@/components/ui/badge';
    import { Button } from '@/components/ui/button';
    import { Dialog, DialogContent, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
    import { Input } from '@/components/ui/input';
    import { Separator } from '@/components/ui/separator';
    import type { ModelConfig } from '@/types/editor';

    type CatalogModel = {
        endpoint_id: string;
        name: string;
        description: string;
        category: string;
        thumbnail: string | null;
        tags: string[];
        is_highlighted: boolean;
        model_url: string;
    };

    let {
        models = [],
        selectedKey = $bindable<string | null>(null),
        disabled = false,
        compact = false,
        category = '',
        onSelectCatalogModel,
    }: {
        models: ModelConfig[];
        selectedKey: string | null;
        disabled?: boolean;
        compact?: boolean;
        category?: string;
        onSelectCatalogModel?: (endpointId: string) => void;
    } = $props();

    let isOpen = $state(false);
    let searchQuery = $state('');
    let catalogModels = $state<CatalogModel[]>([]);
    let isSearchingCatalog = $state(false);
    let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

    function matchesSearch(model: ModelConfig, query: string): boolean {
        if (!query.trim()) return true;
        const q = query.toLowerCase();
        return model.name.toLowerCase().includes(q) ||
               model.description.toLowerCase().includes(q) ||
               model.tags.some(t => t.toLowerCase().includes(q));
    }

    let selectedModel = $derived(models.find(m => m.key === selectedKey));
    let featuredModels = $derived(models.filter(m => m.is_featured));
    let otherModels = $derived(models.filter(m => !m.is_featured));
    let filteredFeatured = $derived(featuredModels.filter(m => matchesSearch(m, searchQuery)));
    let filteredOther = $derived(otherModels.filter(m => matchesSearch(m, searchQuery)));
    let hasLocalResults = $derived(filteredFeatured.length > 0 || filteredOther.length > 0);

    // Filter catalog models to exclude those already in local models
    let localModelIds = $derived(new Set(models.map(m => m.id)));
    let filteredCatalog = $derived(
        catalogModels.filter(m => !localModelIds.has(m.endpoint_id))
    );

    function selectModel(model: ModelConfig) {
        selectedKey = model.key;
        searchQuery = '';
        catalogModels = [];
        isOpen = false;
    }

    // Debounced catalog search
    async function searchCatalog(query: string) {
        if (query.length < 2) {
            catalogModels = [];
            return;
        }

        isSearchingCatalog = true;
        try {
            const params = new URLSearchParams({ q: query, limit: '15' });
            if (category) {
                // Map our generation types to fal.ai categories
                const categoryMap: Record<string, string> = {
                    'text_to_image': 'text-to-image',
                    'image_to_video': 'image-to-video',
                    'text_to_music': 'text-to-audio',
                    'text_to_speech': 'text-to-speech',
                    'text_to_sfx': 'text-to-audio',
                };
                const falCategory = categoryMap[category];
                if (falCategory) {
                    params.set('category', falCategory);
                }
            }

            const response = await fetch(`/editor/generations/catalog?${params}`);
            if (response.ok) {
                const data = await response.json();
                catalogModels = data.models;
            }
        } catch (err) {
            console.error('Catalog search failed:', err);
        } finally {
            isSearchingCatalog = false;
        }
    }

    // Watch search query changes with debounce
    $effect(() => {
        if (searchDebounceTimer) {
            clearTimeout(searchDebounceTimer);
        }

        if (searchQuery.length >= 2) {
            searchDebounceTimer = setTimeout(() => {
                searchCatalog(searchQuery);
            }, 300);
        } else {
            catalogModels = [];
        }
    });

    // Clear search when dialog closes
    $effect(() => {
        if (!isOpen) {
            searchQuery = '';
            catalogModels = [];
        }
    });

    function openPlayground(e: MouseEvent, url: string) {
        e.stopPropagation();
        window.open(url, '_blank');
    }
</script>

<Dialog bind:open={isOpen}>
    <DialogTrigger>
        {#if compact}
            <button
                type="button"
                class="model-picker-trigger flex max-w-full items-center gap-2 rounded-md border bg-background px-2 py-1 text-xs hover:bg-accent disabled:opacity-50 disabled:pointer-events-none w-full"
                {disabled}
            >
                {#if selectedModel?.thumbnail}
                    <img
                        src={selectedModel.thumbnail}
                        alt=""
                        class="h-5 w-5 rounded object-cover"
                    />
                {/if}
                <span class="flex-1 text-left truncate">{selectedModel?.name ?? 'Select model'}</span>
                <ChevronDown class="h-3 w-3 text-muted-foreground" />
            </button>
        {:else}
            <button
                type="button"
                class="model-picker-trigger flex max-w-full items-center gap-3 rounded-lg border bg-background p-3 hover:bg-accent disabled:opacity-50 disabled:pointer-events-none w-full text-left transition-colors"
                {disabled}
            >
                {#if selectedModel?.thumbnail}
                    <img
                        src={selectedModel.thumbnail}
                        alt=""
                        class="h-12 w-12 rounded-lg object-cover flex-shrink-0"
                    />
                {:else}
                    <div class="h-12 w-12 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                        <Sparkles class="h-5 w-5 text-muted-foreground" />
                    </div>
                {/if}
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                        <span class="font-medium text-sm">{selectedModel?.name ?? 'Select a model'}</span>
                        {#if selectedModel?.is_featured}
                            <Star class="h-3 w-3 text-yellow-500 fill-yellow-500" />
                        {/if}
                        {#if selectedModel?.is_new}
                            <Badge variant="secondary" class="text-[10px] px-1 py-0">NEW</Badge>
                        {/if}
                    </div>
                    {#if selectedModel}
                        <p class="text-xs text-muted-foreground truncate mt-0.5">
                            {selectedModel.description}
                        </p>
                    {:else}
                        <p class="text-xs text-muted-foreground">Click to choose a model</p>
                    {/if}
                </div>
                <ChevronDown class="h-4 w-4 text-muted-foreground flex-shrink-0" />
            </button>
        {/if}
    </DialogTrigger>

    <DialogContent class="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <div class="pb-4 space-y-3">
            <DialogTitle class="flex items-center gap-2">
                <Sparkles class="h-5 w-5 text-primary" />
                Choose a Model
            </DialogTitle>

            <!-- Search Input -->
            <div class="relative">
                <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    value={searchQuery}
                    oninput={(e) => searchQuery = e.currentTarget.value}
                    placeholder="Search models..."
                    class="pl-9 h-9"
                />
            </div>
        </div>

        <div class="flex-1 overflow-y-auto -mx-6 px-6">
            <!-- Empty State -->
            {#if !hasLocalResults && filteredCatalog.length === 0 && !isSearchingCatalog}
                <div class="flex flex-col items-center justify-center py-12 text-center">
                    <SearchX class="h-10 w-10 text-muted-foreground mb-3" />
                    <p class="text-sm font-medium text-muted-foreground">No models found</p>
                    <p class="text-xs text-muted-foreground mt-1">
                        {searchQuery.length >= 2 ? 'Try a different search term' : 'Type to search the fal.ai catalog'}
                    </p>
                </div>
            {/if}

            <!-- Featured Models -->
            {#if filteredFeatured.length > 0}
                <div class="mb-4">
                    <div class="flex items-center gap-2 mb-2">
                        <Star class="h-4 w-4 text-yellow-500" />
                        <h3 class="text-sm font-medium">Featured</h3>
                    </div>
                    <div class="grid grid-cols-1 gap-2">
                        {#each filteredFeatured as model (model.key)}
                            <button
                                type="button"
                                class="flex items-center gap-3 rounded-lg border p-3 hover:bg-accent text-left transition-all {selectedKey === model.key ? 'border-primary bg-primary/5 ring-1 ring-primary' : ''}"
                                onclick={() => selectModel(model)}
                            >
                                {#if model.thumbnail}
                                    <img
                                        src={model.thumbnail}
                                        alt=""
                                        class="h-14 w-14 rounded-lg object-cover flex-shrink-0"
                                    />
                                {:else}
                                    <div class="h-14 w-14 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                                        <Sparkles class="h-6 w-6 text-muted-foreground" />
                                    </div>
                                {/if}
                                <div class="flex-1 min-w-0">
                                    <div class="flex items-center gap-2 flex-wrap">
                                        <span class="font-medium text-sm">{model.name}</span>
                                        {#if model.is_new}
                                            <Badge variant="default" class="text-[10px] px-1.5 py-0 bg-green-500">NEW</Badge>
                                        {/if}
                                        {#each model.tags.slice(0, 2) as tag (tag)}
                                            <Badge variant="outline" class="text-[10px] px-1.5 py-0">{tag}</Badge>
                                        {/each}
                                    </div>
                                    <p class="text-xs text-muted-foreground mt-1 line-clamp-2">
                                        {model.description}
                                    </p>
                                </div>
                                <div class="flex items-center gap-2 flex-shrink-0">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        class="h-8 w-8"
                                        onclick={(e) => openPlayground(e, model.playground_url)}
                                        title="Open on fal.ai"
                                    >
                                        <ExternalLink class="h-4 w-4" />
                                    </Button>
                                    {#if selectedKey === model.key}
                                        <div class="h-6 w-6 rounded-full bg-primary flex items-center justify-center">
                                            <Check class="h-4 w-4 text-primary-foreground" />
                                        </div>
                                    {/if}
                                </div>
                            </button>
                        {/each}
                    </div>
                </div>
            {/if}

            <!-- Other Models -->
            {#if filteredOther.length > 0}
                <div class="mb-4">
                    <div class="flex items-center gap-2 mb-2">
                        <Zap class="h-4 w-4 text-muted-foreground" />
                        <h3 class="text-sm font-medium text-muted-foreground">More Models</h3>
                    </div>
                    <div class="grid grid-cols-1 gap-2">
                        {#each filteredOther as model (model.key)}
                            <button
                                type="button"
                                class="flex items-center gap-3 rounded-lg border p-3 hover:bg-accent text-left transition-all {selectedKey === model.key ? 'border-primary bg-primary/5 ring-1 ring-primary' : ''}"
                                onclick={() => selectModel(model)}
                            >
                                {#if model.thumbnail}
                                    <img
                                        src={model.thumbnail}
                                        alt=""
                                        class="h-12 w-12 rounded-lg object-cover flex-shrink-0"
                                    />
                                {:else}
                                    <div class="h-12 w-12 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                                        <Sparkles class="h-5 w-5 text-muted-foreground" />
                                    </div>
                                {/if}
                                <div class="flex-1 min-w-0">
                                    <div class="flex items-center gap-2 flex-wrap">
                                        <span class="font-medium text-sm">{model.name}</span>
                                        {#if model.is_new}
                                            <Badge variant="default" class="text-[10px] px-1.5 py-0 bg-green-500">NEW</Badge>
                                        {/if}
                                    </div>
                                    <p class="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                                        {model.description}
                                    </p>
                                </div>
                                <div class="flex items-center gap-2 flex-shrink-0">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        class="h-7 w-7"
                                        onclick={(e) => openPlayground(e, model.playground_url)}
                                        title="Open on fal.ai"
                                    >
                                        <ExternalLink class="h-3 w-3" />
                                    </Button>
                                    {#if selectedKey === model.key}
                                        <div class="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                                            <Check class="h-3 w-3 text-primary-foreground" />
                                        </div>
                                    {/if}
                                </div>
                            </button>
                        {/each}
                    </div>
                </div>
            {/if}

            <!-- Catalog Search Results -->
            {#if searchQuery.length >= 2}
                {#if hasLocalResults || filteredCatalog.length > 0}
                    <Separator class="my-4" />
                {/if}

                <div>
                    <div class="flex items-center gap-2 mb-2">
                        <Globe class="h-4 w-4 text-blue-500" />
                        <h3 class="text-sm font-medium">fal.ai Catalog</h3>
                        {#if isSearchingCatalog}
                            <Loader2 class="h-3 w-3 animate-spin text-muted-foreground" />
                        {/if}
                    </div>

                    {#if filteredCatalog.length > 0}
                        <div class="grid grid-cols-1 gap-2">
                            {#each filteredCatalog as model (model.endpoint_id)}
                                <button
                                    type="button"
                                    class="flex items-center gap-3 rounded-lg border p-3 hover:bg-accent text-left transition-all border-dashed hover:border-blue-500"
                                    onclick={() => {
                                        if (onSelectCatalogModel) {
                                            onSelectCatalogModel(model.endpoint_id);
                                            searchQuery = '';
                                            catalogModels = [];
                                            isOpen = false;
                                        }
                                    }}
                                >
                                    {#if model.thumbnail}
                                        <img
                                            src={model.thumbnail}
                                            alt=""
                                            class="h-10 w-10 rounded-lg object-cover flex-shrink-0"
                                        />
                                    {:else}
                                        <div class="h-10 w-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                                            <Globe class="h-4 w-4 text-muted-foreground" />
                                        </div>
                                    {/if}
                                    <div class="flex-1 min-w-0">
                                        <div class="flex items-center gap-2 flex-wrap">
                                            <span class="font-medium text-sm">{model.name}</span>
                                            <Badge variant="outline" class="text-[10px] px-1.5 py-0 border-blue-500/50 text-blue-500">
                                                {model.category}
                                            </Badge>
                                        </div>
                                        <p class="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                                            {model.description || model.endpoint_id}
                                        </p>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        class="h-7 w-7 flex-shrink-0"
                                        onclick={(e) => { e.stopPropagation(); openPlayground(e, model.model_url); }}
                                        title="Open on fal.ai"
                                    >
                                        <ExternalLink class="h-3 w-3" />
                                    </Button>
                                </button>
                            {/each}
                        </div>
                        <p class="text-[10px] text-muted-foreground mt-2 text-center">
                            Click to use model, or external link to view on fal.ai
                        </p>
                    {:else if !isSearchingCatalog}
                        <p class="text-xs text-muted-foreground text-center py-4">
                            No additional models found in fal.ai catalog
                        </p>
                    {/if}
                </div>
            {/if}
        </div>

        <div class="flex justify-between items-center pt-4 border-t -mx-6 px-6">
            <a
                href="https://fal.ai/models"
                target="_blank"
                rel="noopener noreferrer"
                class="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
                Browse all models on fal.ai
                <ExternalLink class="h-3 w-3" />
            </a>
            <DialogClose>
                <Button variant="outline" size="sm">Close</Button>
            </DialogClose>
        </div>
    </DialogContent>
</Dialog>
