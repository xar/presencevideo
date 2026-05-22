<script lang="ts">
    import { Link, useForm } from '@inertiajs/svelte';
    import AppHead from '@/components/AppHead.svelte';
    import { Button } from '@/components/ui/button';
    import { Card } from '@/components/ui/card';
    import AppLayout from '@/layouts/AppLayout.svelte';
    import agent from '@/routes/agent';
    import type { BreadcrumbItem } from '@/types';
    import { Bot, PenLine, Send, Sparkles, User } from 'lucide-svelte';

    type Conversation = {
        id: string;
        title: string | null;
        created_at: string;
        updated_at: string;
    };

    type ChatMessage = {
        id: string;
        role: 'user' | 'assistant' | 'system' | string;
        content: string;
        created_at: string;
    };

    let {
        conversation,
        messages,
    }: {
        conversation: Conversation | null;
        messages: ChatMessage[];
    } = $props();

    const breadcrumbs: BreadcrumbItem[] = [
        {
            title: 'Agent',
            href: agent.chat.index().url,
        },
    ];

    const form = useForm<{ message: string; conversation_id: string | null }>({
        message: '',
        conversation_id: null,
    });

    $effect(() => {
        $form.conversation_id = conversation?.id ?? null;
    });

    function submit() {
        if (!$form.message.trim()) {
            return;
        }

        $form.post(agent.chat.store().url, {
            preserveScroll: true,
            onSuccess: () => $form.reset('message'),
        });
    }

    function onKeydown(event: KeyboardEvent) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            submit();
        }
    }

</script>

<AppHead title="Agent Chat" />

<AppLayout {breadcrumbs}>
    <div class="mx-auto flex h-[calc(100vh-5rem)] w-full max-w-[1200px] p-4 lg:p-6">
        <Card class="flex min-w-0 flex-1 flex-col overflow-hidden rounded-3xl border-border/60 bg-background/80 shadow-sm backdrop-blur-xl">
            <header class="flex items-center justify-between border-b border-border/60 px-5 py-4">
                <div class="flex items-center gap-3">
                    <div class="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <Bot class="size-5" />
                    </div>
                    <div>
                        <h1 class="text-lg font-bold">Generic Agent</h1>
                        <p class="text-sm text-muted-foreground">A simple chat shell ready for future video tools.</p>
                    </div>
                </div>
                <Button variant="outline" class="hidden sm:inline-flex" asChild>
                    {#snippet children(props)}
                        <Link {...props} href={agent.chat.index().url}>
                            <PenLine class="mr-2 size-4" /> New chat
                        </Link>
                    {/snippet}
                </Button>
            </header>

            <div class="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-muted/20 to-background px-4 py-6 sm:px-8">
                {#if messages.length === 0}
                    <div class="mx-auto flex h-full max-w-2xl flex-col items-center justify-center text-center">
                        <div class="mb-6 flex size-16 items-center justify-center rounded-3xl bg-primary/10 text-primary shadow-inner">
                            <Sparkles class="size-8" />
                        </div>
                        <h2 class="text-3xl font-black tracking-tight">What should we create?</h2>
                        <p class="mt-3 text-muted-foreground">
                            Start a conversation with your new GenericAgent. Later, this space can drive project edits, generation, and timeline actions.
                        </p>
                    </div>
                {:else}
                    <div class="mx-auto flex max-w-4xl flex-col gap-5">
                        {#each messages as message (message.id)}
                            <div class="flex gap-3 {message.role === 'user' ? 'justify-end' : 'justify-start'}">
                                {#if message.role !== 'user'}
                                    <div class="mt-1 flex size-9 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                        <Bot class="size-4" />
                                    </div>
                                {/if}

                                <div class="max-w-[82%] rounded-3xl px-5 py-3 shadow-sm {message.role === 'user' ? 'bg-primary text-primary-foreground' : 'border border-border/60 bg-card text-card-foreground'}">
                                    <p class="whitespace-pre-wrap text-sm leading-6">{message.content}</p>
                                </div>

                                {#if message.role === 'user'}
                                    <div class="mt-1 flex size-9 shrink-0 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                                        <User class="size-4" />
                                    </div>
                                {/if}
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>

            <form onsubmit={(event) => { event.preventDefault(); submit(); }} class="border-t border-border/60 bg-card/80 p-4">
                {#if $form.errors.message}
                    <p class="mx-auto mb-2 max-w-4xl text-sm text-destructive">{$form.errors.message}</p>
                {/if}
                <div class="mx-auto flex max-w-4xl items-end gap-3 rounded-3xl border border-border/70 bg-background p-2 shadow-sm focus-within:ring-2 focus-within:ring-primary/20">
                    <textarea
                        bind:value={$form.message}
                        onkeydown={onKeydown}
                        rows="1"
                        placeholder="Message the agent..."
                        class="max-h-40 min-h-12 flex-1 resize-none bg-transparent px-3 py-3 text-sm outline-none placeholder:text-muted-foreground"
                    ></textarea>
                    <Button type="submit" size="icon" class="size-12 rounded-2xl" disabled={$form.processing || !$form.message.trim()}>
                        <Send class="size-4" />
                    </Button>
                </div>
                <p class="mt-2 text-center text-xs text-muted-foreground">Press Enter to send, Shift+Enter for a new line.</p>
            </form>
        </Card>
    </div>
</AppLayout>
