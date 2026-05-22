export function formatSeconds(ms: number): string {
    return (ms / 1000).toFixed(1);
}

export function parseSeconds(value: string, minimumMs = 0): number {
    const seconds = parseFloat(value) || 0;

    return Math.max(minimumMs, Math.round(seconds * 1000));
}

export function formatClockTime(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function formatTimelineTime(ms: number): string {
    const centiseconds = Math.floor((ms % 1000) / 10);

    return `${formatClockTime(ms)}.${centiseconds.toString().padStart(2, '0')}`;
}

export function parseTimelineTime(value: string): number {
    const parts = value.split(':');
    const seconds =
        parts.length === 2
            ? parseInt(parts[0], 10) * 60 + parseFloat(parts[1])
            : parseFloat(parts[0]) || 0;

    return Math.max(0, Math.round(seconds * 1000));
}

export function parseOptionalTimelineTime(value: string): number | null {
    const parts = value.match(/^(?:(\d+):)?(\d+)(?:\.(\d{1,3}))?$/);

    if (!parts) {
        return null;
    }

    const minutes = parts[1] ? parseInt(parts[1], 10) : 0;
    const seconds = parseInt(parts[2], 10);
    const fraction = parts[3] ? parts[3].padEnd(3, '0') : '000';

    return (minutes * 60 + seconds) * 1000 + parseInt(fraction, 10);
}

export function formatFileSize(bytes: number): string {
    if (bytes < 1024) {
        return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
