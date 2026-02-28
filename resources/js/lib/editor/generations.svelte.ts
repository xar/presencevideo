import { router } from '@inertiajs/svelte';
import type { Generation, GenerationStatus } from '@/types';

type ActiveGeneration = {
    id: number;
    type: string;
    prompt: string;
    status: GenerationStatus;
    created_at: string;
};

let activeGenerations = $state<ActiveGeneration[]>([]);
let pollTimers = $state<Map<number, ReturnType<typeof setTimeout>>>(new Map());

const POLL_INTERVAL = 2000;
const MAX_POLLS = 150; // 5 min
let pollCounts = new Map<number, number>();

function init(serverGenerations: Generation[]): void {
    // Merge server-provided active generations with any client-tracked ones
    const existingIds = new Set(activeGenerations.map((g) => g.id));
    for (const gen of serverGenerations) {
        if (!existingIds.has(gen.id)) {
            activeGenerations = [
                ...activeGenerations,
                {
                    id: gen.id,
                    type: gen.type,
                    prompt: gen.prompt,
                    status: gen.status,
                    created_at: gen.created_at,
                },
            ];
            startPolling(gen.id);
        }
    }
}

function add(
    generation: {
        id: number;
        type: string;
        prompt: string;
        status: GenerationStatus;
        created_at: string;
    },
    options?: { skipPolling?: boolean },
): void {
    // Don't add duplicates
    if (activeGenerations.some((g) => g.id === generation.id)) return;

    activeGenerations = [
        {
            id: generation.id,
            type: generation.type,
            prompt: generation.prompt,
            status: generation.status,
            created_at: generation.created_at,
        },
        ...activeGenerations,
    ];
    if (!options?.skipPolling) {
        startPolling(generation.id);
    }
}

function remove(id: number): void {
    stopPolling(id);
    activeGenerations = activeGenerations.filter((g) => g.id !== id);
}

function updateStatus(id: number, status: GenerationStatus): void {
    activeGenerations = activeGenerations.map((g) =>
        g.id === id ? { ...g, status } : g,
    );
}

function startPolling(id: number): void {
    if (pollTimers.has(id)) return;
    pollCounts.set(id, 0);
    poll(id);
}

function stopPolling(id: number): void {
    const timer = pollTimers.get(id);
    if (timer) {
        clearTimeout(timer);
        pollTimers.delete(id);
    }
    pollCounts.delete(id);
}

async function poll(id: number): Promise<void> {
    const count = (pollCounts.get(id) ?? 0) + 1;
    pollCounts.set(id, count);

    if (count > MAX_POLLS) {
        updateStatus(id, 'failed');
        stopPolling(id);
        return;
    }

    try {
        const response = await fetch(`/editor/generations/${id}`);
        if (!response.ok) return;

        const data = await response.json();
        const status = data.generation.status as GenerationStatus;

        if (status === 'completed') {
            remove(id);
            // Reload project to get the new asset
            router.reload({ only: ['project'] });
        } else if (status === 'failed') {
            updateStatus(id, 'failed');
            // Keep failed ones visible briefly, then remove
            setTimeout(() => remove(id), 5000);
        } else {
            updateStatus(id, status);
            const timer = setTimeout(() => poll(id), POLL_INTERVAL);
            pollTimers.set(id, timer);
        }
    } catch {
        // Retry on network error
        const timer = setTimeout(() => poll(id), POLL_INTERVAL);
        pollTimers.set(id, timer);
    }
}

function cleanup(): void {
    for (const [id] of pollTimers) {
        stopPolling(id);
    }
    activeGenerations = [];
}

export type GenerationTracker = {
    readonly generations: ActiveGeneration[];
    init: (serverGenerations: Generation[]) => void;
    add: (
        generation: {
            id: number;
            type: string;
            prompt: string;
            status: GenerationStatus;
            created_at: string;
        },
        options?: { skipPolling?: boolean },
    ) => void;
    remove: (id: number) => void;
    cleanup: () => void;
};

export function createGenerationTracker(): GenerationTracker {
    return {
        get generations() {
            return activeGenerations;
        },
        init,
        add,
        remove,
        cleanup,
    };
}

export const generationTracker = createGenerationTracker();
