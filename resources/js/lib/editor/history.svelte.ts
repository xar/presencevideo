import type { Scene, AudioTrack, VideoTrack } from '@/types';
import { projectStore } from './project.svelte';

type Snapshot = {
    scenes: Scene[];
    audio_tracks: AudioTrack[];
    video_tracks: VideoTrack[];
};

const MAX_HISTORY = 50;

let undoStack = $state<Snapshot[]>([]);
let redoStack = $state<Snapshot[]>([]);
let batchDepth = $state(0);

function takeSnapshot(): Snapshot | null {
    const p = projectStore.project;
    if (!p) return null;
    // Use $state.snapshot() to unwrap Svelte 5 proxies before cloning
    return structuredClone($state.snapshot({
        scenes: p.scenes,
        audio_tracks: p.audio_tracks,
        video_tracks: p.video_tracks,
    }));
}

function pushUndo(): void {
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
    projectStore.updateProject({
        scenes: snapshot.scenes,
        audio_tracks: snapshot.audio_tracks,
        video_tracks: snapshot.video_tracks,
    });
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
    clear: () => void;
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
        clear,
    };
}

export const historyStore = createHistoryStore();

// Register the history hook with the project store to capture snapshots before mutations
projectStore.onBeforeMutate(() => historyStore.pushUndo());
