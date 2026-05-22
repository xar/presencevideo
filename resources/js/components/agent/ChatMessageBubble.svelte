<script lang="ts">
    import ToolActivityList from './ToolActivityList.svelte';
    import type { ChatMessage, ToolActivity } from './types';

    let {
        message,
        activities = [],
        latestUserMessage = false
    }: {
        message: ChatMessage;
        activities?: ToolActivity[];
        latestUserMessage?: boolean;
    } = $props();

    const isUser = $derived(message.role === 'user');
</script>

<div
    class="flex scroll-mt-6 gap-3 {isUser ? 'justify-end' : 'justify-start'}"
    data-latest-user-message={latestUserMessage ? 'true' : undefined}
>
    <div class="max-w-[82%] rounded-3xl px-5 py-3 shadow-sm {isUser ? 'bg-primary text-primary-foreground' : 'border border-border/60 bg-card text-card-foreground'}">
        {#if message.content}
            <p class="whitespace-pre-wrap text-sm leading-6">{message.content}</p>
        {/if}

        {#if !isUser}
            <ToolActivityList {activities} toolCalls={message.tool_calls} toolResults={message.tool_results} />
        {/if}
    </div>
</div>
