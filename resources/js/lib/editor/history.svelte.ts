import type { Scene, AudioTrack, VideoTrack, SubtitleTrack } from '@/types';
import { projectStore } from './project.svelte';

type Snapshot = {
    scenes: Scene[];
    audio_tracks: AudioTrack[];
    video_tracks: VideoTrack[];
    subtitle_tracks: SubtitleTrack[];
};

const MAX_HISTORY = 50;

let undoStack = $state<Snapshot[]>([]);
let redoStack = $state<Snapshot[]>([]);
let batchDepth = $state(0);
/**
 * Applying a snapshot mutates the project, which fires the beforeMutate hook.
 * Without this guard, undo would push the restored state back onto the undo
 * stack and clear the redo stack, making redo unreachable.
 */
let isApplyingSnapshot = false;

function takeSnapshot(): Snapshot | null {
    const p = projectStore.project;
    if (!p) return null;
    // Use $state.snapshot() to unwrap Svelte 5 proxies before cloning
    return structuredClone($state.snapshot({
        scenes: p.scenes,
        audio_tracks: p.audio_tracks,
        video_tracks: p.video_tracks,
        subtitle_tracks: p.subtitle_tracks ?? [],
    }));
}

function pushUndo(): void {
    if (isApplyingSnapshot) return;
    // Don't push during batch operations (only the initial one counts)
    if (batchDepth > 0) return;

    const snapshot = takeSnapshot();
    if (!snapshot) return;

    undoStack = [...undoStack.slice(-(MAX_HISTORY - 1)), snapshot];
    // New action clears redo stack
    redoStack = [];
}

function undo(): void {
    if (undoStack.length === 0) return;

    const current = takeSnapshot();
    if (!current) return;

    const previous = undoStack[undoStack.length - 1];
    undoStack = undoStack.slice(0, -1);
    redoStack = [...redoStack, current];

    applySnapshot(previous);
}

function redo(): void {
    if (redoStack.length === 0) return;

    const current = takeSnapshot();
    if (!current) return;

    const next = redoStack[redoStack.length - 1];
    redoStack = redoStack.slice(0, -1);
    undoStack = [...undoStack, current];

    applySnapshot(next);
}

function applySnapshot(snapshot: Snapshot): void {
    isApplyingSnapshot = true;
    try {
        projectStore.updateProject({
            scenes: snapshot.scenes,
            audio_tracks: snapshot.audio_tracks,
            video_tracks: snapshot.video_tracks,
            subtitle_tracks: snapshot.subtitle_tracks,
        });
    } finally {
        isApplyingSnapshot = false;
    }
}

function beginBatch(): void {
    if (batchDepth === 0) {
        // Save snapshot at the start of the batch
        const snapshot = takeSnapshot();
        if (snapshot) {
            undoStack = [...undoStack.slice(-(MAX_HISTORY - 1)), snapshot];
            redoStack = [];
        }
    }
    batchDepth++;
}

function endBatch(): void {
    batchDepth = Math.max(0, batchDepth - 1);
}

/**
 * Run `fn` as a single undo step. The batch is always closed, even when `fn`
 * throws, so a failing mutation can never leave history stuck in batch mode.
 */
function transaction<T>(fn: () => T): T {
    beginBatch();
    try {
        return fn();
    } finally {
        endBatch();
    }
}

export type TransactionHandle = {
    /** Closes the batch. Safe to call more than once; only the first call counts. */
    end: () => void;
    readonly ended: boolean;
};

/**
 * Open a batch that spans multiple events (a pointer gesture). The returned
 * handle's `end` is idempotent, so a component may call it from both its
 * pointer-up handler and its teardown without unbalancing the depth counter.
 */
function beginTransaction(): TransactionHandle {
    beginBatch();
    let ended = false;

    return {
        get ended() {
            return ended;
        },
        end() {
            if (ended) return;
            ended = true;
            endBatch();
        },
    };
}

function clear(): void {
    undoStack = [];
    redoStack = [];
    batchDepth = 0;
}

export type HistoryStore = {
    canUndo: boolean;
    canRedo: boolean;
    pushUndo: () => void;
    undo: () => void;
    redo: () => void;
    beginBatch: () => void;
    endBatch: () => void;
    transaction: <T>(fn: () => T) => T;
    beginTransaction: () => TransactionHandle;
    clear: () => void;
    /** Current batch nesting depth; exposed for tests and diagnostics. */
    readonly batchDepth: number;
};

export function createHistoryStore(): HistoryStore {
    return {
        get canUndo() {
            return undoStack.length > 0;
        },
        get canRedo() {
            return redoStack.length > 0;
        },
        pushUndo,
        undo,
        redo,
        beginBatch,
        endBatch,
        transaction,
        beginTransaction,
        clear,
        get batchDepth() {
            return batchDepth;
        },
    };
}

export const historyStore = createHistoryStore();

// Register the history hook with the project store to capture snapshots before mutations
projectStore.onBeforeMutate(() => historyStore.pushUndo());
