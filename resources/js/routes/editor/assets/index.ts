import { queryParams, type RouteQueryOptions, type RouteDefinition, type RouteFormDefinition, applyUrlDefaults } from './../../../wayfinder'
/**
* @see \App\Http\Controllers\Editor\AssetController::store
* @see app/Http/Controllers/Editor/AssetController.php:20
* @route '/editor/projects/{project}/assets'
*/
export const store = (args: { project: number | { id: number } } | [project: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions): RouteDefinition<'post'> => ({
    url: store.url(args, options),
    method: 'post',
})

store.definition = {
    methods: ["post"],
    url: '/editor/projects/{project}/assets',
} satisfies RouteDefinition<["post"]>

/**
* @see \App\Http\Controllers\Editor\AssetController::store
* @see app/Http/Controllers/Editor/AssetController.php:20
* @route '/editor/projects/{project}/assets'
*/
store.url = (args: { project: number | { id: number } } | [project: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions) => {
    if (typeof args === 'string' || typeof args === 'number') {
        args = { project: args }
    }

    if (typeof args === 'object' && !Array.isArray(args) && 'id' in args) {
        args = { project: args.id }
    }

    if (Array.isArray(args)) {
        args = {
            project: args[0],
        }
    }

    args = applyUrlDefaults(args)

    const parsedArgs = {
        project: typeof args.project === 'object'
        ? args.project.id
        : args.project,
    }

    return store.definition.url
            .replace('{project}', parsedArgs.project.toString())
            .replace(/\/+$/, '') + queryParams(options)
}

/**
* @see \App\Http\Controllers\Editor\AssetController::store
* @see app/Http/Controllers/Editor/AssetController.php:20
* @route '/editor/projects/{project}/assets'
*/
store.post = (args: { project: number | { id: number } } | [project: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions): RouteDefinition<'post'> => ({
    url: store.url(args, options),
    method: 'post',
})

/**
* @see \App\Http\Controllers\Editor\AssetController::store
* @see app/Http/Controllers/Editor/AssetController.php:20
* @route '/editor/projects/{project}/assets'
*/
const storeForm = (args: { project: number | { id: number } } | [project: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions): RouteFormDefinition<'post'> => ({
    action: store.url(args, options),
    method: 'post',
})

/**
* @see \App\Http\Controllers\Editor\AssetController::store
* @see app/Http/Controllers/Editor/AssetController.php:20
* @route '/editor/projects/{project}/assets'
*/
storeForm.post = (args: { project: number | { id: number } } | [project: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions): RouteFormDefinition<'post'> => ({
    action: store.url(args, options),
    method: 'post',
})

store.form = storeForm

/**
* @see \App\Http\Controllers\Editor\AssetStreamController::stream
* @see app/Http/Controllers/Editor/AssetStreamController.php:15
* @route '/editor/assets/{asset}/stream'
*/
export const stream = (args: { asset: number | { id: number } } | [asset: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions): RouteDefinition<'get'> => ({
    url: stream.url(args, options),
    method: 'get',
})

stream.definition = {
    methods: ["get","head"],
    url: '/editor/assets/{asset}/stream',
} satisfies RouteDefinition<["get","head"]>

/**
* @see \App\Http\Controllers\Editor\AssetStreamController::stream
* @see app/Http/Controllers/Editor/AssetStreamController.php:15
* @route '/editor/assets/{asset}/stream'
*/
stream.url = (args: { asset: number | { id: number } } | [asset: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions) => {
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

    return stream.definition.url
            .replace('{asset}', parsedArgs.asset.toString())
            .replace(/\/+$/, '') + queryParams(options)
}

/**
* @see \App\Http\Controllers\Editor\AssetStreamController::stream
* @see app/Http/Controllers/Editor/AssetStreamController.php:15
* @route '/editor/assets/{asset}/stream'
*/
stream.get = (args: { asset: number | { id: number } } | [asset: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions): RouteDefinition<'get'> => ({
    url: stream.url(args, options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Editor\AssetStreamController::stream
* @see app/Http/Controllers/Editor/AssetStreamController.php:15
* @route '/editor/assets/{asset}/stream'
*/
stream.head = (args: { asset: number | { id: number } } | [asset: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions): RouteDefinition<'head'> => ({
    url: stream.url(args, options),
    method: 'head',
})

/**
* @see \App\Http\Controllers\Editor\AssetStreamController::stream
* @see app/Http/Controllers/Editor/AssetStreamController.php:15
* @route '/editor/assets/{asset}/stream'
*/
const streamForm = (args: { asset: number | { id: number } } | [asset: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: stream.url(args, options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Editor\AssetStreamController::stream
* @see app/Http/Controllers/Editor/AssetStreamController.php:15
* @route '/editor/assets/{asset}/stream'
*/
streamForm.get = (args: { asset: number | { id: number } } | [asset: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: stream.url(args, options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Editor\AssetStreamController::stream
* @see app/Http/Controllers/Editor/AssetStreamController.php:15
* @route '/editor/assets/{asset}/stream'
*/
streamForm.head = (args: { asset: number | { id: number } } | [asset: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: stream.url(args, {
        [options?.mergeQuery ? 'mergeQuery' : 'query']: {
            _method: 'HEAD',
            ...(options?.query ?? options?.mergeQuery ?? {}),
        }
    }),
    method: 'get',
})

stream.form = streamForm

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

/**
* @see \App\Http\Controllers\Editor\AssetController::destroy
* @see app/Http/Controllers/Editor/AssetController.php:59
* @route '/editor/assets/{asset}'
*/
export const destroy = (args: { asset: number | { id: number } } | [asset: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions): RouteDefinition<'delete'> => ({
    url: destroy.url(args, options),
    method: 'delete',
})

destroy.definition = {
    methods: ["delete"],
    url: '/editor/assets/{asset}',
} satisfies RouteDefinition<["delete"]>

/**
* @see \App\Http\Controllers\Editor\AssetController::destroy
* @see app/Http/Controllers/Editor/AssetController.php:59
* @route '/editor/assets/{asset}'
*/
destroy.url = (args: { asset: number | { id: number } } | [asset: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions) => {
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

    return destroy.definition.url
            .replace('{asset}', parsedArgs.asset.toString())
            .replace(/\/+$/, '') + queryParams(options)
}

/**
* @see \App\Http\Controllers\Editor\AssetController::destroy
* @see app/Http/Controllers/Editor/AssetController.php:59
* @route '/editor/assets/{asset}'
*/
destroy.delete = (args: { asset: number | { id: number } } | [asset: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions): RouteDefinition<'delete'> => ({
    url: destroy.url(args, options),
    method: 'delete',
})

/**
* @see \App\Http\Controllers\Editor\AssetController::destroy
* @see app/Http/Controllers/Editor/AssetController.php:59
* @route '/editor/assets/{asset}'
*/
const destroyForm = (args: { asset: number | { id: number } } | [asset: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions): RouteFormDefinition<'post'> => ({
    action: destroy.url(args, {
        [options?.mergeQuery ? 'mergeQuery' : 'query']: {
            _method: 'DELETE',
            ...(options?.query ?? options?.mergeQuery ?? {}),
        }
    }),
    method: 'post',
})

/**
* @see \App\Http\Controllers\Editor\AssetController::destroy
* @see app/Http/Controllers/Editor/AssetController.php:59
* @route '/editor/assets/{asset}'
*/
destroyForm.delete = (args: { asset: number | { id: number } } | [asset: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions): RouteFormDefinition<'post'> => ({
    action: destroy.url(args, {
        [options?.mergeQuery ? 'mergeQuery' : 'query']: {
            _method: 'DELETE',
            ...(options?.query ?? options?.mergeQuery ?? {}),
        }
    }),
    method: 'post',
})

destroy.form = destroyForm

const assets = {
    store: Object.assign(store, store),
    stream: Object.assign(stream, stream),
    thumbnail: Object.assign(thumbnail, thumbnail),
    destroy: Object.assign(destroy, destroy),
}

export default assets