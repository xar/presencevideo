<script lang="ts">
    import { tick } from 'svelte';
    import { Link, router } from '@inertiajs/svelte';
    import AppHead from '@/components/AppHead.svelte';
    import { Button } from '@/components/ui/button';
    import AppLayout from '@/layouts/AppLayout.svelte';
    import agent from '@/routes/agent';
    import type { BreadcrumbItem } from '@/types';
    import ChatMessageBubble from '@/components/agent/ChatMessageBubble.svelte';
    import StreamingAssistantMessage from '@/components/agent/StreamingAssistantMessage.svelte';
    import type { ChatMessage, ToolActivity } from '@/components/agent/types';
    import { PenLine, Send, Sparkles } from 'lucide-svelte';

    type Conversation = {
        id: string;
        title: string | null;
        created_at: string;
        updated_at: string;
    };

    let {
        conversation,
        messages
    }: {
        conversation: Conversation | null;
        messages: ChatMessage[];
    } = $props();

    const breadcrumbs: BreadcrumbItem[] = [
        {
            title: 'Agent',
            href: agent.chat.index().url
        }
    ];

    let message = $state('');
    let localMessages = $state<ChatMessage[]>([]);
    let streamedResponse = $state('');
    let streamedConversationId = $state<string | null>(null);
    let streamedToolActivities = $state<ToolActivity[]>([]);
    let isStreaming = $state(false);
    let shouldReserveLatestMessageSpace = $state(false);
    let error = $state<string | null>(null);
    let activeConversationId = $state<string | null | undefined>(undefined);
    let messagesContainer: HTMLDivElement | null = $state(null);

    $effect(() => {
        if (activeConversationId !== conversation?.id) {
            activeConversationId = conversation?.id;
            localMessages = messages;
            streamedResponse = '';
            streamedToolActivities = [];
            shouldReserveLatestMessageSpace = false;
        }
    });

    async function submit() {
        const prompt = message.trim();

        if (!prompt || isStreaming) {
            return;
        }

        message = '';
        error = null;
        streamedResponse = '';
        streamedConversationId = null;
        streamedToolActivities = [];
        isStreaming = true;
        shouldReserveLatestMessageSpace = true;
        localMessages = [
            ...localMessages,
            {
                id: `user-${Date.now()}`,
                role: 'user',
                content: prompt,
                created_at: new Date().toISOString()
            }
        ];

        await scrollLatestUserMessageToTop();

        try {
            const response = await fetch(agent.chat.stream().url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'text/event-stream',
                    'X-CSRF-TOKEN': document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? ''
                },
                body: JSON.stringify({
                    message: prompt,
                    conversation_id: conversation?.id ?? null
                })
            });

            if (!response.ok || !response.body) {
                throw new Error('The agent could not respond. Please try again.');
            }

            await readStream(response.body);

            if (streamedResponse || streamedToolActivities.length > 0) {
                localMessages = [
                    ...localMessages,
                    {
                        id: `assistant-${Date.now()}`,
                        role: 'assistant',
                        content: streamedResponse,
                        tool_calls: streamedToolActivities.map((activity) => ({
                            tool_id: activity.id,
                            tool_name: activity.name,
                            arguments: activity.arguments,
                            timestamp: activity.timestamp
                        })),
                        tool_results: streamedToolActivities
                            .filter((activity) => activity.status !== 'running')
                            .map((activity) => ({
                                tool_id: activity.id,
                                tool_name: activity.name,
                                result: activity.result,
                                successful: activity.successful,
                                error: activity.error,
                                timestamp: activity.timestamp
                            })),
                        created_at: new Date().toISOString()
                    }
                ];
                streamedResponse = '';
                streamedToolActivities = [];
            }

            await scrollLatestUserMessageToTop('instant');
            await refreshConversation();
        } catch (streamError) {
            error = streamError instanceof Error ? streamError.message : 'The agent could not respond. Please try again.';
        } finally {
            isStreaming = false;
        }
    }

    async function scrollLatestUserMessageToTop(behavior: ScrollBehavior = 'smooth') {
        await tick();

        const container = messagesContainer;
        const latestUserMessage = container?.querySelector<HTMLElement>('[data-latest-user-message="true"]');

        if (!container || !latestUserMessage) {
            return;
        }

        container.scrollTo({
            top: latestUserMessage.offsetTop - container.offsetTop,
            behavior,
        });
    }

    async function readStream(body: ReadableStream<Uint8Array>) {
        const reader = body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { value, done } = await reader.read();

            if (done) {
                break;
            }

            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split('\n\n');
            buffer = events.pop() ?? '';

            for (const event of events) {
                handleStreamEvent(event);
            }
        }
    }

    function handleStreamEvent(event: string) {
        for (const line of event.split('\n')) {
            if (!line.startsWith('data: ')) {
                continue;
            }

            const payload = line.slice(6);

            if (payload === '[DONE]') {
                continue;
            }

            const data = JSON.parse(payload);

            if (data.type === 'text_delta') {
                streamedResponse += data.delta ?? '';
            }

            if (data.type === 'tool_call') {
                upsertToolActivity({
                    id: data.tool_id ?? data.id,
                    name: data.tool_name ?? 'Action',
                    arguments: data.arguments,
                    status: 'running',
                    timestamp: data.timestamp
                });
            }

            if (data.type === 'tool_result') {
                upsertToolActivity({
                    id: data.tool_id ?? data.id,
                    name: data.tool_name ?? 'Action',
                    result: data.result,
                    successful: data.successful,
                    error: data.error,
                    status: data.successful === false ? 'failed' : 'completed',
                    timestamp: data.timestamp
                });
            }

            if (data.type === 'conversation') {
                streamedConversationId = data.conversation_id ?? null;
            }
        }
    }

    function upsertToolActivity(activity: ToolActivity) {
        const existing = streamedToolActivities.find((item) => item.id === activity.id);

        streamedToolActivities = existing
            ? streamedToolActivities.map((item) => item.id === activity.id ? { ...item, ...activity, arguments: activity.arguments ?? item.arguments } : item)
            : [...streamedToolActivities, activity];
    }

    async function refreshConversation() {
        if (conversation?.id) {
            router.reload({ only: ['agentConversations'] });

            return;
        }

        if (streamedConversationId) {
            router.visit(agent.chat.show(streamedConversationId).url, { replace: true, preserveScroll: true });
        }
    }

    function onKeydown(event: KeyboardEvent) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            void submit();
        }
    }
</script>

<AppHead title="Agent Chat" />

<AppLayout {breadcrumbs}
           title="Generic Agent"
           description="A simple chat shell ready for future video tools.">
    {#snippet actions()}
        <Button class="rounded-full px-5 shadow-sm"
                asChild>
            {#snippet children(props)}
                <Link {...props}
                      href={agent.chat.index().url}>
                    <PenLine class="mr-2 size-4" />
                    New chat
                </Link>
            {/snippet}
        </Button>
    {/snippet}

    <div class="mx-auto flex h-[calc(100dvh-7rem)] min-h-0 w-full flex-col overflow-hidden">
        <div
            class="flex min-h-0 flex-1 flex-col overflow-hidden border border-border/50 border-b-0 bg-card shadow-lg shadow-black/[0.04] dark:shadow-black/20">
            <div bind:this={messagesContainer} class="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8">
                {#if localMessages.length === 0 && !streamedResponse && !isStreaming}
                    <div class="mx-auto flex h-full max-w-2xl flex-col items-center justify-center text-center">
                        <div class="mb-6 flex size-16 items-center justify-center rounded-3xl bg-primary/10 text-primary shadow-inner">
                            <Sparkles class="size-8" />
                        </div>
                        <h2 class="text-3xl font-black tracking-tight">What should we create?</h2>
                        <p class="mt-3 text-muted-foreground">
                            Start a conversation with your new GenericAgent. Later, this space can drive project edits,
                            generation, and timeline actions.
                        </p>
                    </div>
                {:else}
                    <div class="mx-auto flex max-w-4xl flex-col gap-5 {shouldReserveLatestMessageSpace ? 'pb-[65vh]' : 'pb-6'}">
                        {#each localMessages as message (message.id)}
                            <ChatMessageBubble
                                {message}
                                latestUserMessage={message.role === 'user' && message.id === localMessages.filter((item) => item.role === 'user').at(-1)?.id}
                            />
                        {/each}
                        {#if streamedResponse || isStreaming || streamedToolActivities.length > 0}
                            <StreamingAssistantMessage content={streamedResponse} activities={streamedToolActivities} />
                        {/if}
                    </div>
                {/if}
            </div>

            <form onsubmit={(event) => { event.preventDefault(); void submit(); }}
                  class="shrink-0 border-t border-border/60 bg-card/80 p-4">
                {#if error}
                    <p class="mx-auto mb-2 max-w-4xl text-sm text-destructive">{error}</p>
                {/if}
                <div class="mx-auto flex max-w-4xl items-end gap-3 rounded-3xl border border-border/70 bg-background p-2 shadow-sm focus-within:ring-2 focus-within:ring-primary/20">
                    <textarea
                        bind:value={message}
                        onkeydown={onKeydown}
                        rows="1"
                        placeholder="Message the agent..."
                        class="max-h-40 min-h-12 flex-1 resize-none bg-transparent px-3 py-3 text-sm outline-none placeholder:text-muted-foreground"
                    ></textarea>
                    <Button type="submit"
                            size="icon"
                            class="size-12 rounded-2xl"
                            disabled={isStreaming || !message.trim()}>
                        <Send class="size-4" />
                    </Button>
                </div>
                <p class="mt-2 text-center text-xs text-muted-foreground">Press Enter to send, Shift+Enter for a new
                    line.</p>
            </form>
        </div>
    </div>
</AppLayout>
