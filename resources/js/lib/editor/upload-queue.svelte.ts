import { router } from '@inertiajs/svelte';
import { appFetch } from '@/lib/http';
import type { MediaMetadata } from './mediabunny';
import { editorFeatures, mediaLimits } from './editor-features';
import { getMediaCapabilities } from './media-capabilities';
import { generateUuid } from '@/lib/utils';
import type { AssetType } from '@/types';

export type UploadStatus =
    | 'reading'
    | 'optimizing'
    | 'thumbnail'
    | 'uploading'
    | 'processing'
    | 'completed'
    | 'failed';

export type UploadQueueItem = {
    id: string;
    name: string;
    type: AssetType;
    status: UploadStatus;
    metadata: MediaMetadata | null;
    error: string | null;
};

const statusLabels: Record<UploadStatus, string> = {
    reading: 'Reading media metadata...',
    optimizing: 'Optimizing video for upload...',
    thumbnail: 'Generating preview thumbnail...',
    uploading: 'Uploading...',
    processing: 'Processing asset...',
    completed: 'Upload complete',
    failed: 'Upload failed',
};

let items = $state<UploadQueueItem[]>([]);
let isUploading = $state(false);

function createUploadQueue() {
    async function upload(
        projectId: number,
        files: FileList | File[],
        type: AssetType,
    ): Promise<void> {
        isUploading = true;
        items = [];

        for (const originalFile of Array.from(files)) {
            const item: UploadQueueItem = {
                id: generateUuid(),
                name: originalFile.name,
                type,
                status: 'reading',
                metadata: null,
                error: null,
            };

            items = [...items, item];

            try {
                const formData = await prepareUploadFormData(
                    originalFile,
                    type,
                    (updates) => updateItem(item.id, updates),
                );

                updateItem(item.id, { status: 'uploading' });
                const response = await appFetch(
                    `/editor/projects/${projectId}/assets`,
                    {
                        method: 'POST',
                        body: formData,
                    },
                );

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(
                        errorData.message ||
                            `Upload failed: ${response.status}`,
                    );
                }

                updateItem(item.id, { status: 'processing' });
                router.reload({ only: ['project'] });
                updateItem(item.id, { status: 'completed' });
            } catch (error) {
                console.error('Upload failed:', error);
                updateItem(item.id, {
                    status: 'failed',
                    error:
                        error instanceof Error
                            ? error.message
                            : 'Upload failed',
                });
            }
        }

        isUploading = false;
    }

    function dismiss(id?: string): void {
        items = id ? items.filter((item) => item.id !== id) : [];
    }

    return {
        get items() {
            return items;
        },
        get isUploading() {
            return isUploading;
        },
        get currentItem() {
            return (
                items.find((item) => item.status !== 'completed') ??
                items.at(-1) ??
                null
            );
        },
        upload,
        dismiss,
        getStatusLabel(status: UploadStatus): string {
            return statusLabels[status];
        },
    };
}

export const uploadQueue = createUploadQueue();

async function prepareUploadFormData(
    originalFile: File,
    type: AssetType,
    onUpdate: (updates: Partial<UploadQueueItem>) => void,
): Promise<FormData> {
    const capabilities = getMediaCapabilities();
    const mediaTools =
        editorFeatures.clientMetadata ||
        editorFeatures.clientThumbnails ||
        editorFeatures.clientVideoCompression
            ? await import('./mediabunny')
            : null;
    const metadata = editorFeatures.clientMetadata
        ? ((await mediaTools
              ?.readMediaMetadata(originalFile)
              .catch(() => null)) ?? null)
        : null;

    onUpdate({ metadata });

    let file = originalFile;
    if (
        type === 'video' &&
        editorFeatures.clientVideoCompression &&
        capabilities.canCompressVideo &&
        originalFile.size > mediaLimits.compressVideoAboveBytes
    ) {
        onUpdate({ status: 'optimizing' });
        file =
            (await mediaTools
                ?.compressVideoForUpload(originalFile)
                .catch(() => null)) ?? originalFile;
    }

    onUpdate({ status: 'thumbnail' });
    const thumbnail =
        type === 'video' && editorFeatures.clientThumbnails
            ? await mediaTools
                  ?.createVideoThumbnail(file, mediaLimits.uploadThumbnailWidth)
                  .catch(() => null)
            : null;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);

    if (metadata?.durationMs)
        formData.append('duration_ms', String(metadata.durationMs));
    if (metadata?.width) formData.append('width', String(metadata.width));
    if (metadata?.height) formData.append('height', String(metadata.height));
    if (thumbnail)
        formData.append('thumbnail', thumbnail, `${file.name}-thumbnail.jpg`);

    return formData;
}

function updateItem(id: string, updates: Partial<UploadQueueItem>): void {
    items = items.map((item) =>
        item.id === id ? { ...item, ...updates } : item,
    );
}
