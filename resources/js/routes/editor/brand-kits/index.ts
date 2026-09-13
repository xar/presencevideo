import { queryParams, type RouteQueryOptions, type RouteDefinition, type RouteFormDefinition, applyUrlDefaults } from './../../../wayfinder'
/**
* @see \App\Http\Controllers\Editor\BrandKitController::index
* @see app/Http/Controllers/Editor/BrandKitController.php:20
* @route '/editor/brand-kits'
*/
export const index = (options?: RouteQueryOptions): RouteDefinition<'get'> => ({
    url: index.url(options),
    method: 'get',
})

index.definition = {
    methods: ["get","head"],
    url: '/editor/brand-kits',
} satisfies RouteDefinition<["get","head"]>

/**
* @see \App\Http\Controllers\Editor\BrandKitController::index
* @see app/Http/Controllers/Editor/BrandKitController.php:20
* @route '/editor/brand-kits'
*/
index.url = (options?: RouteQueryOptions) => {
    return index.definition.url + queryParams(options)
}

/**
* @see \App\Http\Controllers\Editor\BrandKitController::index
* @see app/Http/Controllers/Editor/BrandKitController.php:20
* @route '/editor/brand-kits'
*/
index.get = (options?: RouteQueryOptions): RouteDefinition<'get'> => ({
    url: index.url(options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Editor\BrandKitController::index
* @see app/Http/Controllers/Editor/BrandKitController.php:20
* @route '/editor/brand-kits'
*/
index.head = (options?: RouteQueryOptions): RouteDefinition<'head'> => ({
    url: index.url(options),
    method: 'head',
})

/**
* @see \App\Http\Controllers\Editor\BrandKitController::index
* @see app/Http/Controllers/Editor/BrandKitController.php:20
* @route '/editor/brand-kits'
*/
const indexForm = (options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: index.url(options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Editor\BrandKitController::index
* @see app/Http/Controllers/Editor/BrandKitController.php:20
* @route '/editor/brand-kits'
*/
indexForm.get = (options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: index.url(options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Editor\BrandKitController::index
* @see app/Http/Controllers/Editor/BrandKitController.php:20
* @route '/editor/brand-kits'
*/
indexForm.head = (options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: index.url({
        [options?.mergeQuery ? 'mergeQuery' : 'query']: {
            _method: 'HEAD',
            ...(options?.query ?? options?.mergeQuery ?? {}),
        }
    }),
    method: 'get',
})

index.form = indexForm

/**
* @see \App\Http\Controllers\Editor\BrandKitController::store
* @see app/Http/Controllers/Editor/BrandKitController.php:35
* @route '/editor/brand-kits'
*/
export const store = (options?: RouteQueryOptions): RouteDefinition<'post'> => ({
    url: store.url(options),
    method: 'post',
})

store.definition = {
    methods: ["post"],
    url: '/editor/brand-kits',
} satisfies RouteDefinition<["post"]>

/**
* @see \App\Http\Controllers\Editor\BrandKitController::store
* @see app/Http/Controllers/Editor/BrandKitController.php:35
* @route '/editor/brand-kits'
*/
store.url = (options?: RouteQueryOptions) => {
    return store.definition.url + queryParams(options)
}

/**
* @see \App\Http\Controllers\Editor\BrandKitController::store
* @see app/Http/Controllers/Editor/BrandKitController.php:35
* @route '/editor/brand-kits'
*/
store.post = (options?: RouteQueryOptions): RouteDefinition<'post'> => ({
    url: store.url(options),
    method: 'post',
})

/**
* @see \App\Http\Controllers\Editor\BrandKitController::store
* @see app/Http/Controllers/Editor/BrandKitController.php:35
* @route '/editor/brand-kits'
*/
const storeForm = (options?: RouteQueryOptions): RouteFormDefinition<'post'> => ({
    action: store.url(options),
    method: 'post',
})

/**
* @see \App\Http\Controllers\Editor\BrandKitController::store
* @see app/Http/Controllers/Editor/BrandKitController.php:35
* @route '/editor/brand-kits'
*/
storeForm.post = (options?: RouteQueryOptions): RouteFormDefinition<'post'> => ({
    action: store.url(options),
    method: 'post',
})

store.form = storeForm

/**
* @see \App\Http\Controllers\Editor\BrandKitController::update
* @see app/Http/Controllers/Editor/BrandKitController.php:45
* @route '/editor/brand-kits/{brandKit}'
*/
export const update = (args: { brandKit: string | number | { id: string | number } } | [brandKit: string | number | { id: string | number } ] | string | number | { id: string | number }, options?: RouteQueryOptions): RouteDefinition<'put'> => ({
    url: update.url(args, options),
    method: 'put',
})

update.definition = {
    methods: ["put"],
    url: '/editor/brand-kits/{brandKit}',
} satisfies RouteDefinition<["put"]>

/**
* @see \App\Http\Controllers\Editor\BrandKitController::update
* @see app/Http/Controllers/Editor/BrandKitController.php:45
* @route '/editor/brand-kits/{brandKit}'
*/
update.url = (args: { brandKit: string | number | { id: string | number } } | [brandKit: string | number | { id: string | number } ] | string | number | { id: string | number }, options?: RouteQueryOptions) => {
    if (typeof args === 'string' || typeof args === 'number') {
        args = { brandKit: args }
    }

    if (typeof args === 'object' && !Array.isArray(args) && 'id' in args) {
        args = { brandKit: args.id }
    }

    if (Array.isArray(args)) {
        args = {
            brandKit: args[0],
        }
    }

    args = applyUrlDefaults(args)

    const parsedArgs = {
        brandKit: typeof args.brandKit === 'object'
        ? args.brandKit.id
        : args.brandKit,
    }

    return update.definition.url
            .replace('{brandKit}', parsedArgs.brandKit.toString())
            .replace(/\/+$/, '') + queryParams(options)
}

/**
* @see \App\Http\Controllers\Editor\BrandKitController::update
* @see app/Http/Controllers/Editor/BrandKitController.php:45
* @route '/editor/brand-kits/{brandKit}'
*/
update.put = (args: { brandKit: string | number | { id: string | number } } | [brandKit: string | number | { id: string | number } ] | string | number | { id: string | number }, options?: RouteQueryOptions): RouteDefinition<'put'> => ({
    url: update.url(args, options),
    method: 'put',
})

/**
* @see \App\Http\Controllers\Editor\BrandKitController::update
* @see app/Http/Controllers/Editor/BrandKitController.php:45
* @route '/editor/brand-kits/{brandKit}'
*/
const updateForm = (args: { brandKit: string | number | { id: string | number } } | [brandKit: string | number | { id: string | number } ] | string | number | { id: string | number }, options?: RouteQueryOptions): RouteFormDefinition<'post'> => ({
    action: update.url(args, {
        [options?.mergeQuery ? 'mergeQuery' : 'query']: {
            _method: 'PUT',
            ...(options?.query ?? options?.mergeQuery ?? {}),
        }
    }),
    method: 'post',
})

/**
* @see \App\Http\Controllers\Editor\BrandKitController::update
* @see app/Http/Controllers/Editor/BrandKitController.php:45
* @route '/editor/brand-kits/{brandKit}'
*/
updateForm.put = (args: { brandKit: string | number | { id: string | number } } | [brandKit: string | number | { id: string | number } ] | string | number | { id: string | number }, options?: RouteQueryOptions): RouteFormDefinition<'post'> => ({
    action: update.url(args, {
        [options?.mergeQuery ? 'mergeQuery' : 'query']: {
            _method: 'PUT',
            ...(options?.query ?? options?.mergeQuery ?? {}),
        }
    }),
    method: 'post',
})

update.form = updateForm

/**
* @see \App\Http\Controllers\Editor\BrandKitController::destroy
* @see app/Http/Controllers/Editor/BrandKitController.php:58
* @route '/editor/brand-kits/{brandKit}'
*/
export const destroy = (args: { brandKit: string | number | { id: string | number } } | [brandKit: string | number | { id: string | number } ] | string | number | { id: string | number }, options?: RouteQueryOptions): RouteDefinition<'delete'> => ({
    url: destroy.url(args, options),
    method: 'delete',
})

destroy.definition = {
    methods: ["delete"],
    url: '/editor/brand-kits/{brandKit}',
} satisfies RouteDefinition<["delete"]>

/**
* @see \App\Http\Controllers\Editor\BrandKitController::destroy
* @see app/Http/Controllers/Editor/BrandKitController.php:58
* @route '/editor/brand-kits/{brandKit}'
*/
destroy.url = (args: { brandKit: string | number | { id: string | number } } | [brandKit: string | number | { id: string | number } ] | string | number | { id: string | number }, options?: RouteQueryOptions) => {
    if (typeof args === 'string' || typeof args === 'number') {
        args = { brandKit: args }
    }

    if (typeof args === 'object' && !Array.isArray(args) && 'id' in args) {
        args = { brandKit: args.id }
    }

    if (Array.isArray(args)) {
        args = {
            brandKit: args[0],
        }
    }

    args = applyUrlDefaults(args)

    const parsedArgs = {
        brandKit: typeof args.brandKit === 'object'
        ? args.brandKit.id
        : args.brandKit,
    }

    return destroy.definition.url
            .replace('{brandKit}', parsedArgs.brandKit.toString())
            .replace(/\/+$/, '') + queryParams(options)
}

/**
* @see \App\Http\Controllers\Editor\BrandKitController::destroy
* @see app/Http/Controllers/Editor/BrandKitController.php:58
* @route '/editor/brand-kits/{brandKit}'
*/
destroy.delete = (args: { brandKit: string | number | { id: string | number } } | [brandKit: string | number | { id: string | number } ] | string | number | { id: string | number }, options?: RouteQueryOptions): RouteDefinition<'delete'> => ({
    url: destroy.url(args, options),
    method: 'delete',
})

/**
* @see \App\Http\Controllers\Editor\BrandKitController::destroy
* @see app/Http/Controllers/Editor/BrandKitController.php:58
* @route '/editor/brand-kits/{brandKit}'
*/
const destroyForm = (args: { brandKit: string | number | { id: string | number } } | [brandKit: string | number | { id: string | number } ] | string | number | { id: string | number }, options?: RouteQueryOptions): RouteFormDefinition<'post'> => ({
    action: destroy.url(args, {
        [options?.mergeQuery ? 'mergeQuery' : 'query']: {
            _method: 'DELETE',
            ...(options?.query ?? options?.mergeQuery ?? {}),
        }
    }),
    method: 'post',
})

/**
* @see \App\Http\Controllers\Editor\BrandKitController::destroy
* @see app/Http/Controllers/Editor/BrandKitController.php:58
* @route '/editor/brand-kits/{brandKit}'
*/
destroyForm.delete = (args: { brandKit: string | number | { id: string | number } } | [brandKit: string | number | { id: string | number } ] | string | number | { id: string | number }, options?: RouteQueryOptions): RouteFormDefinition<'post'> => ({
    action: destroy.url(args, {
        [options?.mergeQuery ? 'mergeQuery' : 'query']: {
            _method: 'DELETE',
            ...(options?.query ?? options?.mergeQuery ?? {}),
        }
    }),
    method: 'post',
})

destroy.form = destroyForm

const brandKits = {
    index: Object.assign(index, index),
    store: Object.assign(store, store),
    update: Object.assign(update, update),
    destroy: Object.assign(destroy, destroy),
}

export default brandKits