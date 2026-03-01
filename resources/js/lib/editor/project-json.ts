import type { Project } from '@/types';

type ProjectData = Pick<
    Project,
    | 'name'
    | 'resolution_width'
    | 'resolution_height'
    | 'fps'
    | 'scenes'
    | 'audio_tracks'
    | 'video_tracks'
    | 'subtitle_tracks'
>;

type ValidationSuccess = { valid: true; data: ProjectData };
type ValidationError = { valid: false; error: string };
type ValidationResult = ValidationSuccess | ValidationError;

export function extractProjectData(project: Project): ProjectData {
    return {
        name: project.name,
        resolution_width: project.resolution_width,
        resolution_height: project.resolution_height,
        fps: project.fps,
        scenes: project.scenes,
        audio_tracks: project.audio_tracks,
        video_tracks: project.video_tracks,
        subtitle_tracks: project.subtitle_tracks,
    };
}

export function serializeProject(project: Project): string {
    return JSON.stringify(extractProjectData(project), null, 2);
}

export function validateProjectData(input: unknown): ValidationResult {
    if (typeof input !== 'object' || input === null) {
        return { valid: false, error: 'Root must be a JSON object' };
    }

    const obj = input as Record<string, unknown>;

    if (typeof obj.name !== 'string' || obj.name.trim().length === 0) {
        return { valid: false, error: '"name" must be a non-empty string' };
    }

    if (typeof obj.resolution_width !== 'number' || obj.resolution_width < 1) {
        return { valid: false, error: '"resolution_width" must be a positive number' };
    }

    if (typeof obj.resolution_height !== 'number' || obj.resolution_height < 1) {
        return { valid: false, error: '"resolution_height" must be a positive number' };
    }

    if (typeof obj.fps !== 'number' || obj.fps < 1) {
        return { valid: false, error: '"fps" must be a positive number' };
    }

    if (!Array.isArray(obj.scenes)) {
        return { valid: false, error: '"scenes" must be an array' };
    }

    if (!Array.isArray(obj.audio_tracks)) {
        return { valid: false, error: '"audio_tracks" must be an array' };
    }

    if (!Array.isArray(obj.video_tracks)) {
        return { valid: false, error: '"video_tracks" must be an array' };
    }

    if (!Array.isArray(obj.subtitle_tracks)) {
        return { valid: false, error: '"subtitle_tracks" must be an array' };
    }

    return {
        valid: true,
        data: {
            name: obj.name,
            resolution_width: obj.resolution_width,
            resolution_height: obj.resolution_height,
            fps: obj.fps,
            scenes: obj.scenes as Project['scenes'],
            audio_tracks: obj.audio_tracks as Project['audio_tracks'],
            video_tracks: obj.video_tracks as Project['video_tracks'],
            subtitle_tracks: obj.subtitle_tracks as Project['subtitle_tracks'],
        },
    };
}

export function downloadProjectJson(project: Project): void {
    const json = serializeProject(project);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/[^a-z0-9_-]/gi, '_').toLowerCase()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export function readProjectFile(file: File): Promise<ValidationResult> {
    return new Promise((resolve) => {
        const reader = new FileReader();

        reader.onload = () => {
            try {
                const parsed = JSON.parse(reader.result as string);
                resolve(validateProjectData(parsed));
            } catch {
                resolve({ valid: false, error: 'File does not contain valid JSON' });
            }
        };

        reader.onerror = () => {
            resolve({ valid: false, error: 'Failed to read file' });
        };

        reader.readAsText(file);
    });
}
