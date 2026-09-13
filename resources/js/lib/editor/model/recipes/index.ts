import type { BrandKit } from '@/types/editor';
import { hookBodyCta } from './hook-body-cta';
import { listicle } from './listicle';
import { talkingCaption } from './talking-caption';
import type { Recipe, RecipeId, RecipeInput, RecipeOutput } from './types';

export type {
    BeatKind,
    Recipe,
    RecipeBeat,
    RecipeId,
    RecipeInput,
    RecipeOutput,
    RecipeSlots,
} from './types';

export const RECIPES: Record<RecipeId, Recipe> = {
    'tiktok-hook-body-cta': hookBodyCta,
    'tiktok-listicle': listicle,
    'tiktok-talking-caption': talkingCaption,
};

export const RECIPE_IDS = Object.keys(RECIPES) as RecipeId[];

export function isRecipeId(value: unknown): value is RecipeId {
    return typeof value === 'string' && value in RECIPES;
}

/** A plain description of every recipe, for the agent's `list_video_recipes`. */
export function listRecipes(): Array<
    Pick<Recipe, 'id' | 'name' | 'description' | 'slots'>
> {
    return RECIPE_IDS.map((id) => {
        const { id: recipeId, name, description, slots } = RECIPES[id];
        return { id: recipeId, name, description, slots };
    });
}

/**
 * Which brand slots the recipe reads that the kit does not provide.
 *
 * Every slot is optional at build time (the recipe falls back to literals or
 * skips the element), so this is advisory: it tells the agent, before any
 * media is generated, what the output will be missing.
 */
export function validateBrandKitForRecipe(
    kit: BrandKit | null | undefined,
    recipe: Recipe,
): { ok: boolean; missing: string[] } {
    const missing: string[] = [];
    const slots = recipe.slots;

    for (const role of slots.colors) {
        if (!kit?.colors?.[role]) {
            missing.push(`colors.${role}`);
        }
    }

    for (const role of slots.fonts) {
        if (!kit?.fonts?.[role]) {
            missing.push(`fonts.${role}`);
        }
    }

    if (
        slots.logo &&
        !Object.values(kit?.logos ?? {}).some(
            (value) => typeof value === 'number',
        )
    ) {
        missing.push('logos.mark');
    }

    if (slots.outro && typeof kit?.outro_asset_id !== 'number') {
        missing.push('outro_asset_id');
    }

    if (slots.watermark && typeof kit?.watermark?.asset_id !== 'number') {
        missing.push('watermark.asset_id');
    }

    if (slots.voice && !kit?.voice?.model_id) {
        missing.push('voice.model_id');
    }

    if (slots.music && !(kit?.music?.asset_ids?.length || kit?.music?.mood)) {
        missing.push('music');
    }

    return { ok: missing.length === 0, missing };
}

export function applyRecipe(id: RecipeId, input: RecipeInput): RecipeOutput {
    const recipe = RECIPES[id];
    if (!recipe) {
        throw new Error(
            `Unknown recipe "${String(id)}". Known: ${RECIPE_IDS.join(', ')}.`,
        );
    }

    if (!Array.isArray(input.beats) || input.beats.length === 0) {
        throw new Error('A recipe needs at least one beat.');
    }

    return recipe.build(input);
}
