import { queryParams, type RouteQueryOptions, type RouteDefinition, type RouteFormDefinition, applyUrlDefaults } from './../../../wayfinder'
import catalogC6a558 from './catalog'
/**
* @see \App\Http\Controllers\Editor\GenerationController::models
* @see app/Http/Controllers/Editor/GenerationController.php:27
* @route '/editor/generations/models'
*/
export const models = (options?: RouteQueryOptions): RouteDefinition<'get'> => ({
    url: models.url(options),
    method: 'get',
})

models.definition = {
    methods: ["get","head"],
    url: '/editor/generations/models',
} satisfies RouteDefinition<["get","head"]>

/**
* @see \App\Http\Controllers\Editor\GenerationController::models
* @see app/Http/Controllers/Editor/GenerationController.php:27
* @route '/editor/generations/models'
*/
models.url = (options?: RouteQueryOptions) => {
    return models.definition.url + queryParams(options)
}

/**
* @see \App\Http\Controllers\Editor\GenerationController::models
* @see app/Http/Controllers/Editor/GenerationController.php:27
* @route '/editor/generations/models'
*/
models.get = (options?: RouteQueryOptions): RouteDefinition<'get'> => ({
    url: models.url(options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Editor\GenerationController::models
* @see app/Http/Controllers/Editor/GenerationController.php:27
* @route '/editor/generations/models'
*/
models.head = (options?: RouteQueryOptions): RouteDefinition<'head'> => ({
    url: models.url(options),
    method: 'head',
})

/**
* @see \App\Http\Controllers\Editor\GenerationController::models
* @see app/Http/Controllers/Editor/GenerationController.php:27
* @route '/editor/generations/models'
*/
const modelsForm = (options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: models.url(options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Editor\GenerationController::models
* @see app/Http/Controllers/Editor/GenerationController.php:27
* @route '/editor/generations/models'
*/
modelsForm.get = (options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: models.url(options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Editor\GenerationController::models
* @see app/Http/Controllers/Editor/GenerationController.php:27
* @route '/editor/generations/models'
*/
modelsForm.head = (options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: models.url({
        [options?.mergeQuery ? 'mergeQuery' : 'query']: {
            _method: 'HEAD',
            ...(options?.query ?? options?.mergeQuery ?? {}),
        }
    }),
    method: 'get',
})

models.form = modelsForm

/**
* @see \App\Http\Controllers\Editor\GenerationController::catalog
* @see app/Http/Controllers/Editor/GenerationController.php:47
* @route '/editor/generations/catalog'
*/
export const catalog = (options?: RouteQueryOptions): RouteDefinition<'get'> => ({
    url: catalog.url(options),
    method: 'get',
})

catalog.definition = {
    methods: ["get","head"],
    url: '/editor/generations/catalog',
} satisfies RouteDefinition<["get","head"]>

/**
* @see \App\Http\Controllers\Editor\GenerationController::catalog
* @see app/Http/Controllers/Editor/GenerationController.php:47
* @route '/editor/generations/catalog'
*/
catalog.url = (options?: RouteQueryOptions) => {
    return catalog.definition.url + queryParams(options)
}

/**
* @see \App\Http\Controllers\Editor\GenerationController::catalog
* @see app/Http/Controllers/Editor/GenerationController.php:47
* @route '/editor/generations/catalog'
*/
catalog.get = (options?: RouteQueryOptions): RouteDefinition<'get'> => ({
    url: catalog.url(options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Editor\GenerationController::catalog
* @see app/Http/Controllers/Editor/GenerationController.php:47
* @route '/editor/generations/catalog'
*/
catalog.head = (options?: RouteQueryOptions): RouteDefinition<'head'> => ({
    url: catalog.url(options),
    method: 'head',
})

/**
* @see \App\Http\Controllers\Editor\GenerationController::catalog
* @see app/Http/Controllers/Editor/GenerationController.php:47
* @route '/editor/generations/catalog'
*/
const catalogForm = (options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: catalog.url(options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Editor\GenerationController::catalog
* @see app/Http/Controllers/Editor/GenerationController.php:47
* @route '/editor/generations/catalog'
*/
catalogForm.get = (options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: catalog.url(options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Editor\GenerationController::catalog
* @see app/Http/Controllers/Editor/GenerationController.php:47
* @route '/editor/generations/catalog'
*/
catalogForm.head = (options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: catalog.url({
        [options?.mergeQuery ? 'mergeQuery' : 'query']: {
            _method: 'HEAD',
            ...(options?.query ?? options?.mergeQuery ?? {}),
        }
    }),
    method: 'get',
})

catalog.form = catalogForm

/**
* @see \App\Http\Controllers\Editor\GenerationController::store
* @see app/Http/Controllers/Editor/GenerationController.php:258
* @route '/editor/projects/{project}/generate/{type}'
*/
export const store = (args: { project: number | { id: number }, type: string | number } | [project: number | { id: number }, type: string | number ], options?: RouteQueryOptions): RouteDefinition<'post'> => ({
    url: store.url(args, options),
    method: 'post',
})

store.definition = {
    methods: ["post"],
    url: '/editor/projects/{project}/generate/{type}',
} satisfies RouteDefinition<["post"]>

/**
* @see \App\Http\Controllers\Editor\GenerationController::store
* @see app/Http/Controllers/Editor/GenerationController.php:258
* @route '/editor/projects/{project}/generate/{type}'
*/
store.url = (args: { project: number | { id: number }, type: string | number } | [project: number | { id: number }, type: string | number ], options?: RouteQueryOptions) => {
    if (Array.isArray(args)) {
        args = {
            project: args[0],
            type: args[1],
        }
    }

    args = applyUrlDefaults(args)

    const parsedArgs = {
        project: typeof args.project === 'object'
        ? args.project.id
        : args.project,
        type: args.type,
    }

    return store.definition.url
            .replace('{project}', parsedArgs.project.toString())
            .replace('{type}', parsedArgs.type.toString())
            .replace(/\/+$/, '') + queryParams(options)
}

/**
* @see \App\Http\Controllers\Editor\GenerationController::store
* @see app/Http/Controllers/Editor/GenerationController.php:258
* @route '/editor/projects/{project}/generate/{type}'
*/
store.post = (args: { project: number | { id: number }, type: string | number } | [project: number | { id: number }, type: string | number ], options?: RouteQueryOptions): RouteDefinition<'post'> => ({
    url: store.url(args, options),
    method: 'post',
})

/**
* @see \App\Http\Controllers\Editor\GenerationController::store
* @see app/Http/Controllers/Editor/GenerationController.php:258
* @route '/editor/projects/{project}/generate/{type}'
*/
const storeForm = (args: { project: number | { id: number }, type: string | number } | [project: number | { id: number }, type: string | number ], options?: RouteQueryOptions): RouteFormDefinition<'post'> => ({
    action: store.url(args, options),
    method: 'post',
})

/**
* @see \App\Http\Controllers\Editor\GenerationController::store
* @see app/Http/Controllers/Editor/GenerationController.php:258
* @route '/editor/projects/{project}/generate/{type}'
*/
storeForm.post = (args: { project: number | { id: number }, type: string | number } | [project: number | { id: number }, type: string | number ], options?: RouteQueryOptions): RouteFormDefinition<'post'> => ({
    action: store.url(args, options),
    method: 'post',
})

store.form = storeForm

/**
* @see \App\Http\Controllers\Editor\GenerationController::show
* @see app/Http/Controllers/Editor/GenerationController.php:353
* @route '/editor/generations/{generation}'
*/
export const show = (args: { generation: number | { id: number } } | [generation: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions): RouteDefinition<'get'> => ({
    url: show.url(args, options),
    method: 'get',
})

show.definition = {
    methods: ["get","head"],
    url: '/editor/generations/{generation}',
} satisfies RouteDefinition<["get","head"]>

/**
* @see \App\Http\Controllers\Editor\GenerationController::show
* @see app/Http/Controllers/Editor/GenerationController.php:353
* @route '/editor/generations/{generation}'
*/
show.url = (args: { generation: number | { id: number } } | [generation: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions) => {
    if (typeof args === 'string' || typeof args === 'number') {
        args = { generation: args }
    }

    if (typeof args === 'object' && !Array.isArray(args) && 'id' in args) {
        args = { generation: args.id }
    }

    if (Array.isArray(args)) {
        args = {
            generation: args[0],
        }
    }

    args = applyUrlDefaults(args)

    const parsedArgs = {
        generation: typeof args.generation === 'object'
        ? args.generation.id
        : args.generation,
    }

    return show.definition.url
            .replace('{generation}', parsedArgs.generation.toString())
            .replace(/\/+$/, '') + queryParams(options)
}

/**
* @see \App\Http\Controllers\Editor\GenerationController::show
* @see app/Http/Controllers/Editor/GenerationController.php:353
* @route '/editor/generations/{generation}'
*/
show.get = (args: { generation: number | { id: number } } | [generation: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions): RouteDefinition<'get'> => ({
    url: show.url(args, options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Editor\GenerationController::show
* @see app/Http/Controllers/Editor/GenerationController.php:353
* @route '/editor/generations/{generation}'
*/
show.head = (args: { generation: number | { id: number } } | [generation: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions): RouteDefinition<'head'> => ({
    url: show.url(args, options),
    method: 'head',
})

/**
* @see \App\Http\Controllers\Editor\GenerationController::show
* @see app/Http/Controllers/Editor/GenerationController.php:353
* @route '/editor/generations/{generation}'
*/
const showForm = (args: { generation: number | { id: number } } | [generation: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: show.url(args, options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Editor\GenerationController::show
* @see app/Http/Controllers/Editor/GenerationController.php:353
* @route '/editor/generations/{generation}'
*/
showForm.get = (args: { generation: number | { id: number } } | [generation: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: show.url(args, options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Editor\GenerationController::show
* @see app/Http/Controllers/Editor/GenerationController.php:353
* @route '/editor/generations/{generation}'
*/
showForm.head = (args: { generation: number | { id: number } } | [generation: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: show.url(args, {
        [options?.mergeQuery ? 'mergeQuery' : 'query']: {
            _method: 'HEAD',
            ...(options?.query ?? options?.mergeQuery ?? {}),
        }
    }),
    method: 'get',
})

show.form = showForm

const generations = {
    models: Object.assign(models, models),
    catalog: Object.assign(catalog, catalogC6a558),
    store: Object.assign(store, store),
    show: Object.assign(show, show),
}

export default generations