<script lang="ts">
    import { Settings, Sparkles } from 'lucide-svelte';
    import { Button } from '@/components/ui/button';
    import { selectionStore } from '@/lib/editor';
    import PipelinePanel from './PipelinePanel.svelte';
    import PropertiesPanel from './PropertiesPanel.svelte';

    let activeTab = $state<'properties' | 'generate'>('properties');
</script>

<div class="flex w-72 flex-col border-l bg-background">
    <div class="flex border-b">
        <Button
            variant={activeTab === 'properties' ? 'secondary' : 'ghost'}
            class="flex-1 rounded-none"
            onclick={() => (activeTab = 'properties')}
        >
            <Settings class="mr-2 h-4 w-4" />
            Properties
        </Button>
        <Button
            variant={activeTab === 'generate' ? 'secondary' : 'ghost'}
            class="flex-1 rounded-none"
            onclick={() => (activeTab = 'generate')}
        >
            <Sparkles class="mr-2 h-4 w-4" />
            Generate
        </Button>
    </div>

    {#if activeTab === 'properties'}
        <PropertiesPanel />
    {:else}
        <PipelinePanel />
    {/if}
</div>
