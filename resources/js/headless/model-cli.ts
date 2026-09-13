/**
 * The Node door into the pure TypeScript model.
 *
 * The lint rules, the recipes and brand token resolution have exactly one
 * implementation, in `lib/editor/model`. PHP agents call them through this
 * entry instead of a port: `App\Services\ModelCliService` runs the esbuild
 * bundle (`npm run build:model-cli`) with ONE JSON request on stdin and reads
 * ONE JSON response from stdout. No rendering, no DOM, no network.
 *
 * Requests:
 *   { op: 'lint', project, profile? }
 *   { op: 'apply_recipe', recipe, input }
 *   { op: 'list_recipes' }
 *   { op: 'validate_brand_kit', recipe, brand_kit }
 * Responses:
 *   { ok: true, result }  |  { ok: false, error }
 */

import { lintProject } from '@/lib/editor/model/lint';
import type { LintProfileId } from '@/lib/editor/model/lint-profiles';
import {
    RECIPES,
    applyRecipe,
    validateBrandKitForRecipe,
} from '@/lib/editor/model/recipes';
import type { RecipeId, RecipeInput } from '@/lib/editor/model/recipes';
import { normalizeProject } from '@/lib/editor/normalize';
import type { BrandKit, Project } from '@/types/editor';

export type ModelRequest =
    | { op: 'lint'; project: Project; profile?: LintProfileId }
    | { op: 'apply_recipe'; recipe: RecipeId; input: RecipeInput }
    | { op: 'list_recipes' }
    | {
          op: 'validate_brand_kit';
          recipe: RecipeId;
          brand_kit: BrandKit | null;
      };

export type ModelResponse =
    | { ok: true; result: unknown }
    | { ok: false; error: string };

function recipeOrThrow(id: string) {
    const recipe = RECIPES[id as RecipeId];

    if (!recipe) {
        throw new Error(
            `Unknown recipe "${id}". Known recipes: ${Object.keys(RECIPES).join(', ')}.`,
        );
    }

    return recipe;
}

/**
 * Pure request handler, unit-tested directly; `main()` is only transport.
 */
export function handleModelRequest(request: unknown): ModelResponse {
    try {
        if (!request || typeof request !== 'object' || !('op' in request)) {
            throw new Error('A request must be an object with an "op".');
        }

        const req = request as ModelRequest;

        switch (req.op) {
            case 'lint': {
                if (!req.project || typeof req.project !== 'object') {
                    throw new Error('lint requires a "project" object.');
                }

                const project = normalizeProject(req.project);

                return {
                    ok: true,
                    result: lintProject(project, { profile: req.profile }),
                };
            }

            case 'apply_recipe': {
                const recipe = recipeOrThrow(req.recipe);

                if (!req.input || !Array.isArray(req.input.beats)) {
                    throw new Error(
                        'apply_recipe requires an "input" with a beats array.',
                    );
                }

                const built = applyRecipe(recipe.id, req.input);

                // Lint what was built, as the editor would see it: a project
                // shell around the recipe output, with the kit attached so
                // brand rules run.
                const project = normalizeProject({
                    id: 0,
                    user_id: 0,
                    name: 'recipe',
                    status: 'draft',
                    created_at: '',
                    updated_at: '',
                    brand_kit: req.input.brand ?? null,
                    ...structuredClone(built),
                } as Project);

                return {
                    ok: true,
                    result: { project: built, lint: lintProject(project) },
                };
            }

            case 'list_recipes':
                return {
                    ok: true,
                    result: Object.values(RECIPES).map((recipe) => ({
                        id: recipe.id,
                        name: recipe.name,
                        description: recipe.description,
                        slots: recipe.slots,
                    })),
                };

            case 'validate_brand_kit':
                return {
                    ok: true,
                    result: validateBrandKitForRecipe(
                        req.brand_kit,
                        recipeOrThrow(req.recipe),
                    ),
                };

            default:
                throw new Error(
                    `Unknown op "${String((req as { op: unknown }).op)}". Valid ops: lint, apply_recipe, list_recipes, validate_brand_kit.`,
                );
        }
    } catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

async function readStdin(): Promise<string> {
    const chunks: Buffer[] = [];

    for await (const chunk of process.stdin) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    return Buffer.concat(chunks).toString('utf8');
}

async function main(): Promise<void> {
    let request: unknown;

    try {
        request = JSON.parse(await readStdin());
    } catch (error) {
        process.stdout.write(
            `${JSON.stringify({ ok: false, error: `Invalid JSON request: ${error instanceof Error ? error.message : String(error)}` })}\n`,
        );
        process.exit(1);
    }

    process.stdout.write(`${JSON.stringify(handleModelRequest(request))}\n`);
}

// The bundle is the entry point; the Vitest import of `handleModelRequest`
// must not start reading stdin.
if (
    typeof process !== 'undefined' &&
    process.env.VITEST === undefined &&
    process.argv[1] !== undefined &&
    /model-cli\.(mjs|js|ts)$/.test(process.argv[1])
) {
    main().catch((error) => {
        process.stdout.write(
            `${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) })}\n`,
        );
        process.exit(1);
    });
}
