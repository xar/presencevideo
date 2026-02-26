import { queryParams, type RouteQueryOptions, type RouteDefinition, type RouteFormDefinition, applyUrlDefaults } from './../../../../../wayfinder'
/**
* @see \App\Http\Controllers\Editor\AssetStreamController::show
* @see app/Http/Controllers/Editor/AssetStreamController.php:15
* @route '/editor/assets/{asset}/stream'
*/
export const show = (args: { asset: number | { id: number } } | [asset: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions): RouteDefinition<'get'> => ({
    url: show.url(args, options),
    method: 'get',
})

show.definition = {
    methods: ["get","head"],
    url: '/editor/assets/{asset}/stream',
} satisfies RouteDefinition<["get","head"]>

/**
* @see \App\Http\Controllers\Editor\AssetStreamController::show
* @see app/Http/Controllers/Editor/AssetStreamController.php:15
* @route '/editor/assets/{asset}/stream'
*/
show.url = (args: { asset: number | { id: number } } | [asset: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions) => {
    if (typeof args === 'string' || typeof args === 'number') {
        args = { asset: args }
    }

    if (typeof args === 'object' && !Array.isArray(args) && 'id' in args) {
        args = { asset: args.id }
    }

    if (Array.isArray(args)) {
        args = {
            asset: args[0],
        }
    }

    args = applyUrlDefaults(args)

    const parsedArgs = {
        asset: typeof args.asset === 'object'
        ? args.asset.id
        : args.asset,
    }

    return show.definition.url
            .replace('{asset}', parsedArgs.asset.toString())
            .replace(/\/+$/, '') + queryParams(options)
}

/**
* @see \App\Http\Controllers\Editor\AssetStreamController::show
* @see app/Http/Controllers/Editor/AssetStreamController.php:15
* @route '/editor/assets/{asset}/stream'
*/
show.get = (args: { asset: number | { id: number } } | [asset: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions): RouteDefinition<'get'> => ({
    url: show.url(args, options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Editor\AssetStreamController::show
* @see app/Http/Controllers/Editor/AssetStreamController.php:15
* @route '/editor/assets/{asset}/stream'
*/
show.head = (args: { asset: number | { id: number } } | [asset: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions): RouteDefinition<'head'> => ({
    url: show.url(args, options),
    method: 'head',
})

/**
* @see \App\Http\Controllers\Editor\AssetStreamController::show
* @see app/Http/Controllers/Editor/AssetStreamController.php:15
* @route '/editor/assets/{asset}/stream'
*/
const showForm = (args: { asset: number | { id: number } } | [asset: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: show.url(args, options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Editor\AssetStreamController::show
* @see app/Http/Controllers/Editor/AssetStreamController.php:15
* @route '/editor/assets/{asset}/stream'
*/
showForm.get = (args: { asset: number | { id: number } } | [asset: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: show.url(args, options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Editor\AssetStreamController::show
* @see app/Http/Controllers/Editor/AssetStreamController.php:15
* @route '/editor/assets/{asset}/stream'
*/
showForm.head = (args: { asset: number | { id: number } } | [asset: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: show.url(args, {
        [options?.mergeQuery ? 'mergeQuery' : 'query']: {
            _method: 'HEAD',
            ...(options?.query ?? options?.mergeQuery ?? {}),
        }
    }),
    method: 'get',
})

show.form = showForm

/**
* @see \App\Http\Controllers\Editor\AssetStreamController::thumbnail
* @see app/Http/Controllers/Editor/AssetStreamController.php:33
* @route '/editor/assets/{asset}/thumbnail'
*/
export const thumbnail = (args: { asset: number | { id: number } } | [asset: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions): RouteDefinition<'get'> => ({
    url: thumbnail.url(args, options),
    method: 'get',
})

thumbnail.definition = {
    methods: ["get","head"],
    url: '/editor/assets/{asset}/thumbnail',
} satisfies RouteDefinition<["get","head"]>

/**
* @see \App\Http\Controllers\Editor\AssetStreamController::thumbnail
* @see app/Http/Controllers/Editor/AssetStreamController.php:33
* @route '/editor/assets/{asset}/thumbnail'
*/
thumbnail.url = (args: { asset: number | { id: number } } | [asset: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions) => {
    if (typeof args === 'string' || typeof args === 'number') {
        args = { asset: args }
    }

    if (typeof args === 'object' && !Array.isArray(args) && 'id' in args) {
        args = { asset: args.id }
    }

    if (Array.isArray(args)) {
        args = {
            asset: args[0],
        }
    }

    args = applyUrlDefaults(args)

    const parsedArgs = {
        asset: typeof args.asset === 'object'
        ? args.asset.id
        : args.asset,
    }

    return thumbnail.definition.url
            .replace('{asset}', parsedArgs.asset.toString())
            .replace(/\/+$/, '') + queryParams(options)
}

/**
* @see \App\Http\Controllers\Editor\AssetStreamController::thumbnail
* @see app/Http/Controllers/Editor/AssetStreamController.php:33
* @route '/editor/assets/{asset}/thumbnail'
*/
thumbnail.get = (args: { asset: number | { id: number } } | [asset: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions): RouteDefinition<'get'> => ({
    url: thumbnail.url(args, options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Editor\AssetStreamController::thumbnail
* @see app/Http/Controllers/Editor/AssetStreamController.php:33
* @route '/editor/assets/{asset}/thumbnail'
*/
thumbnail.head = (args: { asset: number | { id: number } } | [asset: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions): RouteDefinition<'head'> => ({
    url: thumbnail.url(args, options),
    method: 'head',
})

/**
* @see \App\Http\Controllers\Editor\AssetStreamController::thumbnail
* @see app/Http/Controllers/Editor/AssetStreamController.php:33
* @route '/editor/assets/{asset}/thumbnail'
*/
const thumbnailForm = (args: { asset: number | { id: number } } | [asset: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: thumbnail.url(args, options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Editor\AssetStreamController::thumbnail
* @see app/Http/Controllers/Editor/AssetStreamController.php:33
* @route '/editor/assets/{asset}/thumbnail'
*/
thumbnailForm.get = (args: { asset: number | { id: number } } | [asset: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: thumbnail.url(args, options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Editor\AssetStreamController::thumbnail
* @see app/Http/Controllers/Editor/AssetStreamController.php:33
* @route '/editor/assets/{asset}/thumbnail'
*/
thumbnailForm.head = (args: { asset: number | { id: number } } | [asset: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: thumbnail.url(args, {
        [options?.mergeQuery ? 'mergeQuery' : 'query']: {
            _method: 'HEAD',
            ...(options?.query ?? options?.mergeQuery ?? {}),
        }
    }),
    method: 'get',
})

thumbnail.form = thumbnailForm

const AssetStreamController = { show, thumbnail }

export default AssetStreamController