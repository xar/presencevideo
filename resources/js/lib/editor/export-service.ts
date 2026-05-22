import {
    download,
    show,
    store,
} from '@/actions/App/Http/Controllers/Editor/RenderController';
import { appFetch } from '@/lib/http';
import type { Project, Render } from '@/types/editor';

export async function startBackendRender(project: Project): Promise<Render> {
    const response = await appFetch(store.url(project.id), {
        method: 'POST',
        json: {},
    });

    if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message ?? `Export failed (${response.status})`);
    }

    const data = await response.json();

    return data.render;
}

export function pollRender(
    renderId: number,
    onUpdate: (render: Render) => void,
    intervalMs = 1500,
): ReturnType<typeof setInterval> {
    return setInterval(async () => {
        const response = await appFetch(show.url(renderId));
        if (!response.ok) return;

        const data = await response.json();
        onUpdate(data.render);
    }, intervalMs);
}

export function isRenderFinished(render: Render | null): boolean {
    return render?.status === 'completed' || render?.status === 'failed';
}

export function downloadRender(render: Render): void {
    window.location.href = download.url(render.id);
}
