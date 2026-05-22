<script lang="ts">
    import { CheckCircle2, ChevronDown, LoaderCircle, XCircle } from 'lucide-svelte';
    import type { ToolActivity, ToolCall, ToolResult } from './types';

    let {
        activities = [],
        toolCalls = [],
        toolResults = []
    }: {
        activities?: ToolActivity[];
        toolCalls?: ToolCall[] | null;
        toolResults?: ToolResult[] | null;
    } = $props();

    const persistedActivities = $derived(buildPersistedActivities(toolCalls ?? [], toolResults ?? []));
    const visibleActivities = $derived(activities.length > 0 ? activities : persistedActivities);

    function buildPersistedActivities(calls: ToolCall[], results: ToolResult[]): ToolActivity[] {
        const mapped = new Map<string, ToolActivity>();

        for (const call of calls) {
            const id = call.tool_id ?? call.id ?? crypto.randomUUID();

            mapped.set(id, {
                id,
                name: call.tool_name ?? 'Action',
                arguments: call.arguments,
                status: 'running',
                timestamp: call.timestamp
            });
        }

        for (const result of results) {
            const id = result.tool_id ?? result.id ?? crypto.randomUUID();
            const existing = mapped.get(id);

            mapped.set(id, {
                id,
                name: result.tool_name ?? existing?.name ?? 'Action',
                arguments: existing?.arguments,
                result: result.result,
                successful: result.successful,
                error: result.error,
                status: result.successful === false ? 'failed' : 'completed',
                timestamp: result.timestamp ?? existing?.timestamp
            });
        }

        return Array.from(mapped.values());
    }

    function formatToolName(name: string): string {
        return name
            .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
            .replace(/[_-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function readableValue(value: unknown): string {
        if (value === null || value === undefined || value === '') {
            return '';
        }

        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            return String(value);
        }

        return JSON.stringify(value);
    }

    function importantItems(payload: unknown): { label: string; value: string }[] {
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            return [];
        }

        const source = payload as Record<string, unknown>;
        const priority = [
            'project_id',
            'generation_id',
            'asset_id',
            'render_id',
            'title',
            'status',
            'url',
            'output_asset_id'
        ];

        return priority
            .filter((key) => key in source && readableValue(source[key]) !== '')
            .map((key) => ({ label: key.replace(/_/g, ' '), value: readableValue(source[key]) }));
    }

    function resultSummary(result: unknown): string {
        if (typeof result === 'string') {
            return result;
        }

        if (!result || typeof result !== 'object' || Array.isArray(result)) {
            return readableValue(result);
        }

        const source = result as Record<string, unknown>;

        for (const key of ['message', 'summary', 'description', 'title', 'status']) {
            const value = readableValue(source[key]);

            if (value) {
                return value;
            }
        }

        return '';
    }
</script>

{#if visibleActivities.length > 0}
    <div class="mt-3 space-y-2">
        {#each visibleActivities as activity (activity.id)}
            {@const items = importantItems(activity.result)}
            <details class="group rounded-2xl border border-border/60 bg-muted/30 px-3 py-2 text-xs" open={activity.status === 'running'}>
                <summary class="flex cursor-pointer list-none items-center gap-2 text-muted-foreground">
                    {#if activity.status === 'running'}
                        <LoaderCircle class="size-3.5 animate-spin text-primary" />
                    {:else if activity.status === 'failed'}
                        <XCircle class="size-3.5 text-destructive" />
                    {:else}
                        <CheckCircle2 class="size-3.5 text-emerald-500" />
                    {/if}
                    <span class="font-medium text-foreground">{formatToolName(activity.name)}</span>
                    <span class="ml-auto text-[11px] text-muted-foreground">
                        {activity.status === 'running' ? 'In progress' : activity.status === 'failed' ? 'Needs attention' : 'Done'}
                    </span>
                    <ChevronDown class="size-3.5 transition group-open:rotate-180" />
                </summary>

                <div class="mt-2 space-y-2">
                    {#if activity.error}
                        <div class="rounded-xl bg-destructive/10 p-3 text-destructive">{activity.error}</div>
                    {:else if resultSummary(activity.result)}
                        <p class="rounded-xl bg-background/80 p-3 text-foreground">{resultSummary(activity.result)}</p>
                    {/if}

                    {#if items.length > 0}
                        <div class="flex flex-wrap gap-2">
                            {#each items as item}
                                <span class="rounded-full border border-border/60 bg-background/80 px-2.5 py-1 text-[11px] text-muted-foreground">
                                    <span class="capitalize">{item.label}</span>: <span class="font-medium text-foreground">{item.value}</span>
                                </span>
                            {/each}
                        </div>
                    {:else if activity.status === 'running'}
                        <p class="text-muted-foreground">Working on this now…</p>
                    {/if}
                </div>
            </details>
        {/each}
    </div>
{/if}
