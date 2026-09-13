import type { ToolActivity } from '@/components/agent/types';

/**
 * Pure reduction of agent stream events and server state into chat UI state.
 *
 * The websocket is a latency optimisation, not the source of truth: the server
 * persists every invocation as it streams, and the client reconciles against
 * that record whenever it may have missed something. Both inputs reduce through
 * here so a reconnect and a live event can never disagree about what is on
 * screen.
 */

export type InvocationStatus = 'queued' | 'running' | 'completed' | 'failed';

/** The invocation record as the server serialises it. */
export type InvocationState = {
    id: string;
    conversation_id: string;
    status: InvocationStatus;
    prompt: string;
    partial_text: string;
    last_seq: number;
    error: string | null;
    updated_at: string | null;
};

export type ServerState = {
    invocation: InvocationState | null;
    activities?: ToolActivity[];
};

export type StreamState = {
    invocationId: string | null;
    /** The prompt that started this run, shown optimistically until it is persisted. */
    prompt: string | null;
    status: InvocationStatus | null;
    text: string;
    /** Highest event sequence applied; events at or below it are replays. */
    lastSeq: number;
    activities: ToolActivity[];
    error: string | null;
};

export type StreamEvent = Record<string, unknown>;

const TERMINAL: InvocationStatus[] = ['completed', 'failed'];

export function createStreamState(): StreamState {
    return {
        invocationId: null,
        prompt: null,
        status: null,
        text: '',
        lastSeq: 0,
        activities: [],
        error: null,
    };
}

export function isTerminal(status: InvocationStatus | null): boolean {
    return status !== null && TERMINAL.includes(status);
}

/** Whether the UI should show the assistant as still working. */
export function isStreaming(state: StreamState): boolean {
    return state.status !== null && !isTerminal(state.status);
}

/** Begin following a new invocation, discarding any previous run's state. */
export function startInvocation(invocation: InvocationState): StreamState {
    return {
        invocationId: invocation.id,
        prompt: invocation.prompt,
        status: invocation.status,
        text: invocation.partial_text ?? '',
        lastSeq: invocation.last_seq ?? 0,
        activities: [],
        error: invocation.error,
    };
}

/**
 * Apply one broadcast event.
 *
 * Events for another invocation are ignored outright, which stops a stale or
 * duplicated run from interleaving its text into the current one. Events at or
 * below the highest sequence already applied are treated as replays and
 * dropped, which makes redelivery harmless.
 */
export function applyStreamEvent(state: StreamState, event: StreamEvent): StreamState {
    const type = typeof event.type === 'string' ? event.type : null;

    if (type === null) {
        return state;
    }

    const invocationId = typeof event.invocation_id === 'string' ? event.invocation_id : null;

    if (type === 'invocation_state') {
        return applyServerState(state, { invocation: event.invocation as InvocationState | null });
    }

    if (state.invocationId !== null && invocationId !== null && invocationId !== state.invocationId) {
        return state;
    }

    const seq = typeof event.seq === 'number' ? event.seq : null;

    if (seq !== null && seq <= state.lastSeq) {
        return state;
    }

    const next: StreamState = {
        ...state,
        lastSeq: seq ?? state.lastSeq,
        status: state.status === null || isTerminal(state.status) ? state.status : 'running',
    };

    switch (type) {
        case 'text_delta':
            return { ...next, text: next.text + (typeof event.delta === 'string' ? event.delta : '') };

        case 'tool_call':
            return {
                ...next,
                activities: upsertActivity(next.activities, {
                    id: activityId(event),
                    name: (event.tool_name as string) ?? 'Action',
                    arguments: event.arguments as ToolActivity['arguments'],
                    status: 'running',
                    timestamp: event.timestamp as number | undefined,
                }),
            };

        case 'tool_result':
            return {
                ...next,
                activities: upsertActivity(next.activities, {
                    id: activityId(event),
                    name: (event.tool_name as string) ?? 'Action',
                    result: event.result,
                    successful: event.successful as boolean | undefined,
                    error: (event.error as string | null) ?? null,
                    status: event.successful === false ? 'failed' : 'completed',
                    timestamp: event.timestamp as number | undefined,
                }),
            };

        case 'activity_updated': {
            const activity = event.activity as ToolActivity | undefined;

            return activity
                ? { ...next, activities: upsertActivity(next.activities, { ...activity, status: activity.status ?? 'running' }) }
                : next;
        }

        case 'stream_failed':
        case 'error':
            // Not terminal on its own: only the invocation record decides that,
            // so a transient error event cannot strand the UI.
            return { ...next, error: (event.message as string) ?? 'The agent stream failed.' };

        default:
            return next;
    }
}

/**
 * Reconcile against the server's record of the invocation.
 *
 * Whichever side is further along wins, so a reconcile triggered while events
 * are still flowing can never roll the transcript backwards. A terminal record
 * always wins, because it holds the complete final text.
 */
export function applyServerState(state: StreamState, server: ServerState): StreamState {
    const invocation = server.invocation;
    const activities = server.activities ? mergeActivities(state.activities, server.activities) : state.activities;

    if (invocation === null || invocation === undefined) {
        return { ...state, activities };
    }

    if (state.invocationId !== null && invocation.id !== state.invocationId) {
        return { ...state, activities };
    }

    const serverIsAuthoritative = isTerminal(invocation.status) || invocation.last_seq >= state.lastSeq;

    return {
        invocationId: invocation.id,
        prompt: invocation.prompt,
        status: invocation.status,
        text: serverIsAuthoritative ? (invocation.partial_text ?? '') : state.text,
        lastSeq: serverIsAuthoritative ? invocation.last_seq : state.lastSeq,
        activities,
        error: invocation.error ?? (isTerminal(invocation.status) ? null : state.error),
    };
}

function activityId(event: StreamEvent): string {
    return (event.tool_id as string) ?? (event.id as string) ?? 'unknown';
}

function upsertActivity(activities: ToolActivity[], activity: ToolActivity): ToolActivity[] {
    const index = activities.findIndex((item) => item.id === activity.id);

    if (index === -1) {
        return [...activities, activity];
    }

    return activities.map((item, position) =>
        position === index ? { ...item, ...activity, arguments: activity.arguments ?? item.arguments } : item,
    );
}

/**
 * Merge persisted activities over locally streamed ones.
 *
 * Server rows win for anything it knows about, but tool calls streamed live are
 * never persisted as activity rows, so locally known entries must survive a
 * reconcile or the tool list would empty out mid-run.
 */
function mergeActivities(local: ToolActivity[], server: ToolActivity[]): ToolActivity[] {
    return server.reduce(upsertActivity, local);
}
