export type MediaCapabilities = {
    canUseWebCodecs: boolean;
    canUseOffscreenCanvas: boolean;
    canReadLocalFiles: boolean;
    canCreateObjectUrls: boolean;
    canExportPreview: boolean;
    canCompressVideo: boolean;
};

export function getMediaCapabilities(): MediaCapabilities {
    const canUseWebCodecs = 'VideoEncoder' in window && 'VideoDecoder' in window;
    const canUseOffscreenCanvas = 'OffscreenCanvas' in window;
    const canCreateObjectUrls = 'URL' in window && typeof URL.createObjectURL === 'function';

    return {
        canUseWebCodecs,
        canUseOffscreenCanvas,
        canReadLocalFiles: 'FileReader' in window,
        canCreateObjectUrls,
        canExportPreview: canUseWebCodecs && canUseOffscreenCanvas,
        canCompressVideo: canUseWebCodecs,
    };
}
