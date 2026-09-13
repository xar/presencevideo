import { queryParams, type RouteQueryOptions, type RouteDefinition, type RouteFormDefinition, applyUrlDefaults } from './../../../../../wayfinder'
/**
* @see \App\Http\Controllers\Editor\HeadlessRenderController::page
* @see app/Http/Controllers/Editor/HeadlessRenderController.php:27
* @route '/editor/headless/{token}/page'
*/
export const page = (args: { token: string | number } | [token: string | number ] | string | number, options?: RouteQueryOptions): RouteDefinition<'get'> => ({
    url: page.url(args, options),
    method: 'get',
})

page.definition = {
    methods: ["get","head"],
    url: '/editor/headless/{token}/page',
} satisfies RouteDefinition<["get","head"]>

/**
* @see \App\Http\Controllers\Editor\HeadlessRenderController::page
* @see app/Http/Controllers/Editor/HeadlessRenderController.php:27
* @route '/editor/headless/{token}/page'
*/
page.url = (args: { token: string | number } | [token: string | number ] | string | number, options?: RouteQueryOptions) => {
    if (typeof args === 'string' || typeof args === 'number') {
        args = { token: args }
    }

    if (Array.isArray(args)) {
        args = {
            token: args[0],
        }
    }

    args = applyUrlDefaults(args)

    const parsedArgs = {
        token: args.token,
    }

    return page.definition.url
            .replace('{token}', parsedArgs.token.toString())
            .replace(/\/+$/, '') + queryParams(options)
}

/**
* @see \App\Http\Controllers\Editor\HeadlessRenderController::page
* @see app/Http/Controllers/Editor/HeadlessRenderController.php:27
* @route '/editor/headless/{token}/page'
*/
page.get = (args: { token: string | number } | [token: string | number ] | string | number, options?: RouteQueryOptions): RouteDefinition<'get'> => ({
    url: page.url(args, options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Editor\HeadlessRenderController::page
* @see app/Http/Controllers/Editor/HeadlessRenderController.php:27
* @route '/editor/headless/{token}/page'
*/
page.head = (args: { token: string | number } | [token: string | number ] | string | number, options?: RouteQueryOptions): RouteDefinition<'head'> => ({
    url: page.url(args, options),
    method: 'head',
})

/**
* @see \App\Http\Controllers\Editor\HeadlessRenderController::page
* @see app/Http/Controllers/Editor/HeadlessRenderController.php:27
* @route '/editor/headless/{token}/page'
*/
const pageForm = (args: { token: string | number } | [token: string | number ] | string | number, options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: page.url(args, options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Editor\HeadlessRenderController::page
* @see app/Http/Controllers/Editor/HeadlessRenderController.php:27
* @route '/editor/headless/{token}/page'
*/
pageForm.get = (args: { token: string | number } | [token: string | number ] | string | number, options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: page.url(args, options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Editor\HeadlessRenderController::page
* @see app/Http/Controllers/Editor/HeadlessRenderController.php:27
* @route '/editor/headless/{token}/page'
*/
pageForm.head = (args: { token: string | number } | [token: string | number ] | string | number, options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: page.url(args, {
        [options?.mergeQuery ? 'mergeQuery' : 'query']: {
            _method: 'HEAD',
            ...(options?.query ?? options?.mergeQuery ?? {}),
        }
    }),
    method: 'get',
})

page.form = pageForm

/**
* @see \App\Http\Controllers\Editor\HeadlessRenderController::asset
* @see app/Http/Controllers/Editor/HeadlessRenderController.php:43
* @route '/editor/headless/{token}/assets/{asset}'
*/
export const asset = (args: { token: string | number, asset: string | number | { id: string | number } } | [token: string | number, asset: string | number | { id: string | number } ], options?: RouteQueryOptions): RouteDefinition<'get'> => ({
    url: asset.url(args, options),
    method: 'get',
})

asset.definition = {
    methods: ["get","head"],
    url: '/editor/headless/{token}/assets/{asset}',
} satisfies RouteDefinition<["get","head"]>

/**
* @see \App\Http\Controllers\Editor\HeadlessRenderController::asset
* @see app/Http/Controllers/Editor/HeadlessRenderController.php:43
* @route '/editor/headless/{token}/assets/{asset}'
*/
asset.url = (args: { token: string | number, asset: string | number | { id: string | number } } | [token: string | number, asset: string | number | { id: string | number } ], options?: RouteQueryOptions) => {
    if (Array.isArray(args)) {
        args = {
            token: args[0],
            asset: args[1],
        }
    }

    args = applyUrlDefaults(args)

    const parsedArgs = {
        token: args.token,
        asset: typeof args.asset === 'object'
        ? args.asset.id
        : args.asset,
    }

    return asset.definition.url
            .replace('{token}', parsedArgs.token.toString())
            .replace('{asset}', parsedArgs.asset.toString())
            .replace(/\/+$/, '') + queryParams(options)
}

/**
* @see \App\Http\Controllers\Editor\HeadlessRenderController::asset
* @see app/Http/Controllers/Editor/HeadlessRenderController.php:43
* @route '/editor/headless/{token}/assets/{asset}'
*/
asset.get = (args: { token: string | number, asset: string | number | { id: string | number } } | [token: string | number, asset: string | number | { id: string | number } ], options?: RouteQueryOptions): RouteDefinition<'get'> => ({
    url: asset.url(args, options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Editor\HeadlessRenderController::asset
* @see app/Http/Controllers/Editor/HeadlessRenderController.php:43
* @route '/editor/headless/{token}/assets/{asset}'
*/
asset.head = (args: { token: string | number, asset: string | number | { id: string | number } } | [token: string | number, asset: string | number | { id: string | number } ], options?: RouteQueryOptions): RouteDefinition<'head'> => ({
    url: asset.url(args, options),
    method: 'head',
})

/**
* @see \App\Http\Controllers\Editor\HeadlessRenderController::asset
* @see app/Http/Controllers/Editor/HeadlessRenderController.php:43
* @route '/editor/headless/{token}/assets/{asset}'
*/
const assetForm = (args: { token: string | number, asset: string | number | { id: string | number } } | [token: string | number, asset: string | number | { id: string | number } ], options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: asset.url(args, options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Editor\HeadlessRenderController::asset
* @see app/Http/Controllers/Editor/HeadlessRenderController.php:43
* @route '/editor/headless/{token}/assets/{asset}'
*/
assetForm.get = (args: { token: string | number, asset: string | number | { id: string | number } } | [token: string | number, asset: string | number | { id: string | number } ], options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: asset.url(args, options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Editor\HeadlessRenderController::asset
* @see app/Http/Controllers/Editor/HeadlessRenderController.php:43
* @route '/editor/headless/{token}/assets/{asset}'
*/
assetForm.head = (args: { token: string | number, asset: string | number | { id: string | number } } | [token: string | number, asset: string | number | { id: string | number } ], options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: asset.url(args, {
        [options?.mergeQuery ? 'mergeQuery' : 'query']: {
            _method: 'HEAD',
            ...(options?.query ?? options?.mergeQuery ?? {}),
        }
    }),
    method: 'get',
})

asset.form = assetForm

/**
* @see \App\Http\Controllers\Editor\HeadlessRenderController::thumbnail
* @see app/Http/Controllers/Editor/HeadlessRenderController.php:65
* @route '/editor/headless/{token}/assets/{asset}/thumbnail'
*/
export const thumbnail = (args: { token: string | number, asset: string | number | { id: string | number } } | [token: string | number, asset: string | number | { id: string | number } ], options?: RouteQueryOptions): RouteDefinition<'get'> => ({
    url: thumbnail.url(args, options),
    method: 'get',
})

thumbnail.definition = {
    methods: ["get","head"],
    url: '/editor/headless/{token}/assets/{asset}/thumbnail',
} satisfies RouteDefinition<["get","head"]>

/**
* @see \App\Http\Controllers\Editor\HeadlessRenderController::thumbnail
* @see app/Http/Controllers/Editor/HeadlessRenderController.php:65
* @route '/editor/headless/{token}/assets/{asset}/thumbnail'
*/
thumbnail.url = (args: { token: string | number, asset: string | number | { id: string | number } } | [token: string | number, asset: string | number | { id: string | number } ], options?: RouteQueryOptions) => {
    if (Array.isArray(args)) {
        args = {
            token: args[0],
            asset: args[1],
        }
    }

    args = applyUrlDefaults(args)

    const parsedArgs = {
        token: args.token,
        asset: typeof args.asset === 'object'
        ? args.asset.id
        : args.asset,
    }

    return thumbnail.definition.url
            .replace('{token}', parsedArgs.token.toString())
            .replace('{asset}', parsedArgs.asset.toString())
            .replace(/\/+$/, '') + queryParams(options)
}

/**
* @see \App\Http\Controllers\Editor\HeadlessRenderController::thumbnail
* @see app/Http/Controllers/Editor/HeadlessRenderController.php:65
* @route '/editor/headless/{token}/assets/{asset}/thumbnail'
*/
thumbnail.get = (args: { token: string | number, asset: string | number | { id: string | number } } | [token: string | number, asset: string | number | { id: string | number } ], options?: RouteQueryOptions): RouteDefinition<'get'> => ({
    url: thumbnail.url(args, options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Editor\HeadlessRenderController::thumbnail
* @see app/Http/Controllers/Editor/HeadlessRenderController.php:65
* @route '/editor/headless/{token}/assets/{asset}/thumbnail'
*/
thumbnail.head = (args: { token: string | number, asset: string | number | { id: string | number } } | [token: string | number, asset: string | number | { id: string | number } ], options?: RouteQueryOptions): RouteDefinition<'head'> => ({
    url: thumbnail.url(args, options),
    method: 'head',
})

/**
* @see \App\Http\Controllers\Editor\HeadlessRenderController::thumbnail
* @see app/Http/Controllers/Editor/HeadlessRenderController.php:65
* @route '/editor/headless/{token}/assets/{asset}/thumbnail'
*/
const thumbnailForm = (args: { token: string | number, asset: string | number | { id: string | number } } | [token: string | number, asset: string | number | { id: string | number } ], options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: thumbnail.url(args, options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Editor\HeadlessRenderController::thumbnail
* @see app/Http/Controllers/Editor/HeadlessRenderController.php:65
* @route '/editor/headless/{token}/assets/{asset}/thumbnail'
*/
thumbnailForm.get = (args: { token: string | number, asset: string | number | { id: string | number } } | [token: string | number, asset: string | number | { id: string | number } ], options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: thumbnail.url(args, options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Editor\HeadlessRenderController::thumbnail
* @see app/Http/Controllers/Editor/HeadlessRenderController.php:65
* @route '/editor/headless/{token}/assets/{asset}/thumbnail'
*/
thumbnailForm.head = (args: { token: string | number, asset: string | number | { id: string | number } } | [token: string | number, asset: string | number | { id: string | number } ], options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: thumbnail.url(args, {
        [options?.mergeQuery ? 'mergeQuery' : 'query']: {
            _method: 'HEAD',
            ...(options?.query ?? options?.mergeQuery ?? {}),
        }
    }),
    method: 'get',
})

thumbnail.form = thumbnailForm

const HeadlessRenderController = { page, asset, thumbnail }

export default HeadlessRenderController