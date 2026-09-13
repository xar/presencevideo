import { describe, expect, it } from 'vitest';
import {
    applyServerState,
    applyStreamEvent,
    createStreamState,
    isStreaming,
    startInvocation,
    type InvocationState,
    type StreamState,
} from './stream-state';

function invocation(overrides: Partial<InvocationState> = {}): InvocationState {
    return {
        id: 'inv-1',
        conversation_id: 'conv-1',
        status: 'queued',
        prompt: 'Make me a video',
        partial_text: '',
        last_seq: 0,
        error: null,
        updated_at: null,
        ...overrides,
    };
}

function running(overrides: Partial<StreamState> = {}): StreamState {
    return { ...startInvocation(invocation({ status: 'running' })), ...overrides };
}

function delta(seq: number, text: string) {
    return { type: 'text_delta', invocation_id: 'inv-1', seq, delta: text };
}

describe('applyStreamEvent', () => {
    it('appends text deltas in order', () => {
        let state = running();

        state = applyStreamEvent(state, delta(1, 'Hello'));
        state = applyStreamEvent(state, delta(2, ' world'));

        expect(state.text).toBe('Hello world');
        expect(state.lastSeq).toBe(2);
    });

    it('drops replayed events at or below the highest applied sequence', () => {
        let state = running();

        state = applyStreamEvent(state, delta(1, 'Hello'));
        state = applyStreamEvent(state, delta(1, 'Hello'));

        expect(state.text).toBe('Hello');
    });

    it('ignores events belonging to another invocation', () => {
        let state = running();

        state = applyStreamEvent(state, { type: 'text_delta', invocation_id: 'inv-2', seq: 1, delta: 'stray' });

        expect(state.text).toBe('');
        expect(state.lastSeq).toBe(0);
    });

    it('tracks a tool call through to its result', () => {
        let state = running();

        state = applyStreamEvent(state, {
            type: 'tool_call',
            invocation_id: 'inv-1',
            seq: 1,
            tool_id: 'tool-1',
            tool_name: 'GenerateFalAsset',
            arguments: { prompt: 'a cat' },
        });

        expect(state.activities).toHaveLength(1);
        expect(state.activities[0]!.status).toBe('running');

        state = applyStreamEvent(state, {
            type: 'tool_result',
            invocation_id: 'inv-1',
            seq: 2,
            tool_id: 'tool-1',
            tool_name: 'GenerateFalAsset',
            successful: true,
            result: { asset_id: 7 },
        });

        expect(state.activities).toHaveLength(1);
        expect(state.activities[0]!.status).toBe('completed');
        // The arguments from the call survive the result event.
        expect(state.activities[0]!.arguments).toEqual({ prompt: 'a cat' });
    });

    it('does not let an error event end the run on its own', () => {
        let state = running();

        state = applyStreamEvent(state, { type: 'stream_failed', invocation_id: 'inv-1', seq: 1, message: 'boom' });

        expect(state.error).toBe('boom');
        expect(isStreaming(state)).toBe(true);
    });

    it('ends the run when the invocation record says so', () => {
        let state = running();

        state = applyStreamEvent(state, {
            type: 'invocation_state',
            invocation: invocation({ status: 'completed', partial_text: 'Done.', last_seq: 5 }),
        });

        expect(isStreaming(state)).toBe(false);
        expect(state.text).toBe('Done.');
    });
});

describe('applyServerState', () => {
    it('fills in everything a client missed while disconnected', () => {
        const state = running();

        const reconciled = applyServerState(state, {
            invocation: invocation({ status: 'running', partial_text: 'Missed all of this', last_seq: 12 }),
        });

        expect(reconciled.text).toBe('Missed all of this');
        expect(reconciled.lastSeq).toBe(12);
    });

    it('never rolls the transcript backwards when the client is ahead', () => {
        let state = running();
        state = applyStreamEvent(state, delta(1, 'Hello'));
        state = applyStreamEvent(state, delta(2, ' world'));

        // A reconcile racing a throttled server write must not truncate.
        const reconciled = applyServerState(state, {
            invocation: invocation({ status: 'running', partial_text: 'Hello', last_seq: 1 }),
        });

        expect(reconciled.text).toBe('Hello world');
        expect(reconciled.lastSeq).toBe(2);
    });

    it('trusts a terminal record even when the client is ahead', () => {
        let state = running();
        state = applyStreamEvent(state, delta(9, 'partial'));

        const reconciled = applyServerState(state, {
            invocation: invocation({ status: 'completed', partial_text: 'the complete answer', last_seq: 4 }),
        });

        expect(reconciled.text).toBe('the complete answer');
        expect(isStreaming(reconciled)).toBe(false);
    });

    it('unsticks a client whose invocation was swept as failed', () => {
        const state = running();

        const reconciled = applyServerState(state, {
            invocation: invocation({ status: 'failed', error: 'The agent stopped responding.' }),
        });

        expect(isStreaming(reconciled)).toBe(false);
        expect(reconciled.error).toBe('The agent stopped responding.');
    });

    it('keeps locally streamed tool calls that were never persisted', () => {
        let state = running();
        state = applyStreamEvent(state, {
            type: 'tool_call',
            invocation_id: 'inv-1',
            seq: 1,
            tool_id: 'tool-local',
            tool_name: 'ScriptAgent',
        });

        const reconciled = applyServerState(state, {
            invocation: invocation({ status: 'running', last_seq: 1 }),
            activities: [{ id: 'activity-1', name: 'GenerateFalAsset', status: 'running' }],
        });

        expect(reconciled.activities.map((item) => item.id)).toEqual(['tool-local', 'activity-1']);
    });

    it('ignores a record for a different invocation', () => {
        let state = running();
        state = applyStreamEvent(state, delta(1, 'mine'));

        const reconciled = applyServerState(state, {
            invocation: invocation({ id: 'inv-other', status: 'completed', partial_text: 'theirs' }),
        });

        expect(reconciled.text).toBe('mine');
    });
});

describe('createStreamState', () => {
    it('is idle', () => {
        expect(isStreaming(createStreamState())).toBe(false);
    });
});
