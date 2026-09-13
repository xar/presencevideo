<script lang="ts">
    import { tick, untrack } from 'svelte';
    import { v4 as uuidv4 } from 'uuid';
    import { Link, router } from '@inertiajs/svelte';
    import AppHead from '@/components/AppHead.svelte';
    import { Button } from '@/components/ui/button';
    import AppLayout from '@/layouts/AppLayout.svelte';
    import agent from '@/routes/agent';
    import type { BreadcrumbItem } from '@/types';
    import ChatMessageBubble from '@/components/agent/ChatMessageBubble.svelte';
    import StreamingAssistantMessage from '@/components/agent/StreamingAssistantMessage.svelte';
    import type { ChatMessage, ToolActivity } from '@/components/agent/types';
    import {
        applyServerState,
        applyStreamEvent,
        createStreamState,
        isStreaming,
        startInvocation,
        type InvocationState,
        type StreamState
    } from '@/lib/agent/stream-state';
    import { createStreamClient, type StreamClient } from '@/lib/agent/stream-client';
    import { PenLine, Send, Sparkles } from 'lucide-svelte';

    type Conversation = {
        id: string;
        title: string | null;
        created_at: string;
        updated_at: string;
    };

    let {
        conversation,
        messages,
        activities = [],
        pendingMessage = null,
        broadcastChannel = null,
        invocation = null,
        watchdogSeconds = 20
    }: {
        conversation: Conversation | null;
        messages: ChatMessage[];
        activities?: ToolActivity[];
        pendingMessage?: string | null;
        broadcastChannel?: string | null;
        invocation?: InvocationState | null;
        watchdogSeconds?: number;
    } = $props();

    const breadcrumbs: BreadcrumbItem[] = [
        {
            title: 'Agent',
            href: agent.chat.index().url
        }
    ];

    let message = $state('');
    let stream = $state<StreamState>(createStreamState());
    /** Shown the instant the user hits send, before the server has answered. */
    let pendingPrompt = $state<string | null>(null);
    let error = $state<string | null>(null);
    let messagesContainer: HTMLDivElement | null = $state(null);
    let activeConversationId: string | null | undefined = undefined;
    let client: StreamClient | null = null;
    let reconciling = false;

    const streaming = $derived(isStreaming(stream));
    const optimisticPrompt = $derived(pendingPrompt ?? stream.prompt ?? pendingMessage);

    /**
     * The transcript as rendered.
     *
     * The user's own message is not persisted until the agent run reaches it,
     * so it is carried by the invocation record until the real row shows up.
     * That is what stops a message disappearing when a send is interrupted.
     */
    const renderedMessages = $derived.by(() => {
        const list = [...messages];
        const last = list.at(-1);

        if (!optimisticPrompt || (last?.role === 'user' && last.content === optimisticPrompt)) {
            return list;
        }

        return [
            ...list,
            {
                id: `pending-${stream.invocationId ?? 'local'}`,
                role: 'user',
                content: optimisticPrompt,
                created_at: new Date().toISOString()
            }
        ];
    });

    const latestUserMessageId = $derived(renderedMessages.filter((item) => item.role === 'user').at(-1)?.id);

    $effect(() => {
        client = createStreamClient({
            onEvent: handleEvent,
            onReconcile: () => void reconcile(),
            watchdogSeconds
        });

        return () => {
            client?.destroy();
            client = null;
        };
    });

    $effect(() => {
        const id = conversation?.id ?? null;

        if (activeConversationId === id) {
            return;
        }

        activeConversationId = id;
        pendingPrompt = null;
        error = null;
        stream = invocation ? startInvocation(invocation) : createStreamState();
        stream = applyServerState(stream, { invocation: null, activities });

        if (broadcastChannel) {
            void join(broadcastChannel);
        }

        client?.setStreaming(isStreaming(stream));

        // A run already in flight when this page rendered may have moved on
        // since; pick up whatever happened in between.
        if (isStreaming(stream)) {
            void reconcile();
        }
    });

    $effect(() => {
        // The server only reports a run that is still going. Once it stops
        // reporting one, the reply has landed in the transcript and the live
        // copy must be retired or it would be rendered twice. Tracking only the
        // prop keeps this from re-entering on its own write.
        const active = invocation;

        untrack(() => {
            if (active === null && stream.invocationId !== null && !isStreaming(stream)) {
                stream = createStreamState();
            }
        });
    });

    async function submit() {
        const prompt = message.trim();

        if (!prompt || streaming) {
            return;
        }

        message = '';
        error = null;
        pendingPrompt = prompt;

        await scrollLatestUserMessageToTop();

        try {
            const started = await postJson(agent.chat.send().url, {
                message: prompt,
                conversation_id: conversation?.id ?? null,
                // Makes the retry above safe: a send the server already accepted
                // returns the same invocation instead of running the agent twice.
                idempotency_key: uuidv4()
            });

            stream = startInvocation(started.invocation);
            pendingPrompt = null;
            client?.setStreaming(true);

            await client?.subscribe(started.channel);

            if (conversation?.id !== started.conversation_id) {
                // The new conversation's page resumes this run from its own
                // invocation record, so nothing is lost by navigating mid-stream.
                router.visit(agent.chat.show(started.conversation_id).url, {
                    replace: true,
                    preserveScroll: true
                });

                return;
            }

            // Whether or not the subscription landed, anything the agent emitted
            // before it did is still waiting in the invocation record.
            void reconcile();
        } catch {
            // Nothing was lost: put the message back so it can be sent again.
            message = prompt;
            pendingPrompt = null;
            error = 'The agent could not start. Your message was not sent — try again.';
            client?.setStreaming(false);
        }
    }

    async function join(channel: string) {
        const joined = await client?.subscribe(channel);

        if (!joined) {
            void reconcile();
        }
    }

    function handleEvent(event: Record<string, unknown>) {
        const wasStreaming = isStreaming(stream);

        stream = applyStreamEvent(stream, event);

        if (wasStreaming && !isStreaming(stream)) {
            finishStreaming();
        }

        // The library's end-of-stream marker is a hint, not a verdict — only the
        // invocation record decides that a run is over.
        if (event.type === 'stream_end') {
            void reconcile();
        }
    }

    /**
     * Replace local state with the server's record of the run.
     *
     * Called on reconnect, on tab focus, after a silent stretch, and whenever a
     * subscription could not be established — every case in which events may
     * have been missed.
     */
    async function reconcile() {
        const conversationId = conversation?.id;

        if (!conversationId || reconciling) {
            return;
        }

        reconciling = true;

        try {
            const state = await getJson(
                agent.chat.state(conversationId, {
                    query: stream.invocationId ? { invocation: stream.invocationId } : {}
                }).url
            );

            const wasStreaming = isStreaming(stream);

            stream = applyServerState(stream, {
                invocation: state.invocation,
                activities: state.activities ?? []
            });

            if (wasStreaming && !isStreaming(stream)) {
                finishStreaming();
            }
        } catch {
            // The server is unreachable; the watchdog will try again.
        } finally {
            reconciling = false;
        }
    }

    function finishStreaming() {
        client?.setStreaming(false);
        error = stream.error;

        router.reload({
            only: ['messages', 'activities', 'conversation', 'conversations', 'invocation', 'agentConversations']
        });

        void scrollLatestUserMessageToTop('instant');
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
            behavior
        });
    }

    function csrfToken(): string {
        return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? '';
    }

    async function getJson(url: string) {
        const response = await fetch(url, {
            headers: { Accept: 'application/json' }
        });

        if (!response.ok) {
            throw new Error('Request failed.');
        }

        return await response.json();
    }

    /**
     * POST with one retry.
     *
     * Safe because every send carries an idempotency key: a request that reached
     * the server but whose response was lost resolves to the same invocation.
     */
    async function postJson(url: string, body: Record<string, unknown>, attempt = 0): Promise<any> {
        let response: Response;

        try {
            response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'X-CSRF-TOKEN': csrfToken()
                },
                body: JSON.stringify(body)
            });
        } catch (exception) {
            // The request never completed, so the server may or may not have
            // accepted it. Retrying is safe only because of the idempotency key.
            if (attempt >= 1) {
                throw exception;
            }

            return await postJson(url, body, attempt + 1);
        }

        // A response that arrived and was rejected is a real answer; retrying it
        // would only fail the same way.
        if (!response.ok) {
            throw new Error('Request failed.');
        }

        return await response.json();
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
                {#if renderedMessages.length === 0 && !stream.text && !streaming}
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
                    <div class="mx-auto flex max-w-4xl flex-col gap-5 {streaming ? 'pb-[65vh]' : 'pb-6'}">
                        {#each renderedMessages as message (message.id)}
                            <ChatMessageBubble
                                {message}
                                latestUserMessage={message.role === 'user' && message.id === latestUserMessageId}
                            />
                        {/each}
                        {#if streaming || stream.text || stream.activities.length > 0}
                            <StreamingAssistantMessage content={stream.text} activities={stream.activities} />
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
                            disabled={streaming || !message.trim()}>
                        <Send class="size-4" />
                    </Button>
                </div>
                <p class="mt-2 text-center text-xs text-muted-foreground">Press Enter to send, Shift+Enter for a new
                    line.</p>
            </form>
        </div>
    </div>
</AppLayout>
