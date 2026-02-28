<script lang="ts">
    import { Settings, Sparkles, Captions } from 'lucide-svelte';
    import { Button } from '@/components/ui/button';
    import { selectionStore } from '@/lib/editor';
    import PipelinePanel from './PipelinePanel.svelte';
    import PropertiesPanel from './PropertiesPanel.svelte';
    import SubtitlePanel from './SubtitlePanel.svelte';

    let activeTab = $state<'properties' | 'generate' | 'subtitles'>('properties');
</script>

<div class="flex w-[420px] max-w-4/12 flex-col border-l bg-background">
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
        <Button
            variant={activeTab === 'subtitles' ? 'secondary' : 'ghost'}
            class="flex-1 rounded-none"
            onclick={() => (activeTab = 'subtitles')}
        >
            <Captions class="mr-2 h-4 w-4" />
            Subtitles
        </Button>
    </div>

    {#if activeTab === 'properties'}
        <PropertiesPanel />
    {:else if activeTab === 'generate'}
        <PipelinePanel />
    {:else}
        <SubtitlePanel />
    {/if}
</div>
