<script lang="ts">
    import MarkdownMessage from './MarkdownMessage.svelte';
    import ToolActivityList from './ToolActivityList.svelte';
    import type { ToolActivity } from './types';

    let {
        content = '',
        activities = []
    }: {
        content?: string;
        activities?: ToolActivity[];
    } = $props();
</script>

<div class="flex justify-start gap-3">
    <div class="max-w-[82%] rounded-3xl border border-border/60 bg-card px-5 py-3 text-card-foreground shadow-sm">
        {#if content}
            <MarkdownMessage {content} streaming />
        {:else if activities.length === 0}
            <p class="text-sm leading-6 text-muted-foreground">Thinking…</p>
        {/if}

        <ToolActivityList {activities} />
    </div>
</div>
