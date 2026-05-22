<script lang="ts">
    import { Comark } from '@comark/svelte';

    let {
        content,
        streaming = false
    }: {
        content: string;
        streaming?: boolean;
    } = $props();
</script>

<Comark
    markdown={content}
    {streaming}
    caret={streaming}
    class="markdown-message text-sm leading-6"
/>

<style>
    :global(.markdown-message > * + *) {
        margin-top: 0.75rem;
    }

    :global(.markdown-message p) {
        white-space: pre-wrap;
    }

    :global(.markdown-message a) {
        color: hsl(var(--primary));
        text-decoration: underline;
        text-underline-offset: 3px;
    }

    :global(.markdown-message ul),
    :global(.markdown-message ol) {
        padding-left: 1.25rem;
    }

    :global(.markdown-message ul) {
        list-style: disc;
    }

    :global(.markdown-message ol) {
        list-style: decimal;
    }

    :global(.markdown-message li + li) {
        margin-top: 0.25rem;
    }

    :global(.markdown-message blockquote) {
        border-left: 3px solid hsl(var(--border));
        color: hsl(var(--muted-foreground));
        padding-left: 0.875rem;
    }

    :global(.markdown-message code) {
        border-radius: 0.375rem;
        background: hsl(var(--muted));
        padding: 0.125rem 0.35rem;
        font-size: 0.85em;
    }

    :global(.markdown-message pre) {
        max-width: 100%;
        overflow-x: auto;
        border-radius: 0.875rem;
        background: hsl(var(--muted));
        padding: 0.875rem;
        white-space: pre;
    }

    :global(.markdown-message pre code) {
        background: transparent;
        padding: 0;
    }

    :global(.markdown-message table) {
        width: 100%;
        border-collapse: collapse;
        overflow: hidden;
        font-size: 0.875em;
    }

    :global(.markdown-message th),
    :global(.markdown-message td) {
        border: 1px solid hsl(var(--border));
        padding: 0.4rem 0.55rem;
        text-align: left;
    }

    :global(.markdown-message th) {
        background: hsl(var(--muted));
        font-weight: 600;
    }

    :global(.markdown-message .comark-caret) {
        display: inline-block;
        width: 2px;
        height: 1em;
        margin-left: 1px;
        background: currentColor;
        animation: comark-caret-blink 1s step-end infinite;
        vertical-align: text-bottom;
    }

    @keyframes comark-caret-blink {
        50% {
            opacity: 0;
        }
    }
</style>
