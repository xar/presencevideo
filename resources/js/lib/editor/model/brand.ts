import type {
    BrandColorRole,
    BrandFontRole,
    BrandKit,
    Layer,
    Project,
} from '@/types/editor';
import { BRAND_TOKEN_PREFIX } from '@/types/editor';

/**
 * Brand tokens.
 *
 * An element may store `font_color: "brand.primary"` or
 * `font_family: "brand.display"` instead of a literal. The token is what is
 * PERSISTED; it is resolved against the project's brand kit at resolve time
 * (`resolveFrame()`), so swapping the kit restyles the whole project without
 * rewriting a single element, and a literal value keeps meaning exactly what
 * it meant.
 *
 * Every helper here is pure and passes non-token values through untouched, so
 * production data that never heard of brand kits is unaffected.
 */

/** Painted when a colour token cannot be resolved (no kit, or role unset). */
export const FALLBACK_BRAND_COLOR = '#ffffff';

/** Used when a font token cannot be resolved. Matches the caption default. */
export const FALLBACK_BRAND_FONT = 'Arial, sans-serif';

export const BRAND_COLOR_ROLES: readonly BrandColorRole[] = [
    'primary',
    'secondary',
    'accent',
    'background',
    'text',
    'caption_highlight',
] as const;

export const BRAND_FONT_ROLES: readonly BrandFontRole[] = [
    'display',
    'body',
    'caption',
] as const;

export type BrandToken = `brand.${string}`;

export function isBrandToken(value: unknown): value is BrandToken {
    return typeof value === 'string' && value.startsWith(BRAND_TOKEN_PREFIX);
}

export function brandToken(role: BrandColorRole | BrandFontRole): string {
    return `${BRAND_TOKEN_PREFIX}${role}`;
}

/** The role named by a token, or null for a non-token. */
export function brandTokenRole(value: unknown): string | null {
    return isBrandToken(value) ? value.slice(BRAND_TOKEN_PREFIX.length) : null;
}

/**
 * Resolve a colour that may be a brand token.
 *
 * Literals (including '', 'transparent', null and undefined) pass through
 * unchanged so callers keep their own "do not paint" semantics.
 */
export function resolveBrandColor(
    value: string | null | undefined,
    kit: BrandKit | null | undefined,
): string | null | undefined {
    const role = brandTokenRole(value);
    if (role === null) {
        return value;
    }

    const color = kit?.colors?.[role as BrandColorRole];
    return typeof color === 'string' && color !== ''
        ? color
        : FALLBACK_BRAND_COLOR;
}

/** Resolve a font family that may be a brand token; see `resolveBrandColor`. */
export function resolveBrandFont(
    value: string | null | undefined,
    kit: BrandKit | null | undefined,
): string | null | undefined {
    const role = brandTokenRole(value);
    if (role === null) {
        return value;
    }

    const font = kit?.fonts?.[role as BrandFontRole];
    return typeof font === 'string' && font !== '' ? font : FALLBACK_BRAND_FONT;
}

/** Element colour fields that may carry a token. */
export const ELEMENT_COLOR_FIELDS = [
    'font_color',
    'background_color',
    'stroke_color',
    'fill_color',
    'border_color',
] as const;

/** Subtitle style colour fields that may carry a token. */
export const SUBTITLE_COLOR_FIELDS = [
    'font_color',
    'background_color',
    'stroke_color',
    'highlight_color',
] as const;

/**
 * Return a DEEP COPY of the project with every brand token replaced by its
 * literal value.
 *
 * `resolveFrame()` does not use this (it resolves inline so the preview never
 * pays for a copy per frame); it exists for the paths that hand the project to
 * something that cannot resolve tokens itself — the legacy export shims, the
 * JSON download, tests. The input is never mutated.
 */
export function resolveProjectBrand(project: Project): Project {
    const kit = project.brand_kit ?? null;
    const copy = structuredClone(project);

    const resolveElement = (element: Layer): void => {
        const raw = element as unknown as Record<string, unknown>;

        for (const field of ELEMENT_COLOR_FIELDS) {
            if (isBrandToken(raw[field])) {
                raw[field] = resolveBrandColor(raw[field] as string, kit);
            }
        }

        if (isBrandToken(raw.font_family)) {
            raw.font_family = resolveBrandFont(raw.font_family as string, kit);
        }
    };

    for (const scene of copy.scenes ?? []) {
        if (isBrandToken(scene.background_color)) {
            scene.background_color =
                resolveBrandColor(scene.background_color, kit) ?? undefined;
        }

        for (const layer of scene.layers ?? []) {
            resolveElement(layer);
        }
    }

    for (const track of copy.video_tracks ?? []) {
        for (const clip of track.clips ?? []) {
            resolveElement(clip);
        }
    }

    for (const track of copy.subtitle_tracks ?? []) {
        const style = track.style as unknown as
            | Record<string, unknown>
            | undefined;
        if (!style) {
            continue;
        }

        for (const field of SUBTITLE_COLOR_FIELDS) {
            if (isBrandToken(style[field])) {
                style[field] = resolveBrandColor(style[field] as string, kit);
            }
        }

        if (isBrandToken(style.font_family)) {
            style.font_family = resolveBrandFont(
                style.font_family as string,
                kit,
            );
        }
    }

    return copy;
}
