import { queryParams, type RouteQueryOptions, type RouteDefinition, type RouteFormDefinition, applyUrlDefaults } from './../../../../../wayfinder'
/**
* @see \App\Http\Controllers\Editor\RenderController::store
* @see app/Http/Controllers/Editor/RenderController.php:20
* @route '/editor/projects/{project}/render'
*/
export const store = (args: { project: number | { id: number } } | [project: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions): RouteDefinition<'post'> => ({
    url: store.url(args, options),
    method: 'post',
})

store.definition = {
    methods: ["post"],
    url: '/editor/projects/{project}/render',
} satisfies RouteDefinition<["post"]>

/**
* @see \App\Http\Controllers\Editor\RenderController::store
* @see app/Http/Controllers/Editor/RenderController.php:20
* @route '/editor/projects/{project}/render'
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
* @see \App\Http\Controllers\Editor\RenderController::store
* @see app/Http/Controllers/Editor/RenderController.php:20
* @route '/editor/projects/{project}/render'
*/
store.post = (args: { project: number | { id: number } } | [project: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions): RouteDefinition<'post'> => ({
    url: store.url(args, options),
    method: 'post',
})

/**
* @see \App\Http\Controllers\Editor\RenderController::store
* @see app/Http/Controllers/Editor/RenderController.php:20
* @route '/editor/projects/{project}/render'
*/
const storeForm = (args: { project: number | { id: number } } | [project: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions): RouteFormDefinition<'post'> => ({
    action: store.url(args, options),
    method: 'post',
})

/**
* @see \App\Http\Controllers\Editor\RenderController::store
* @see app/Http/Controllers/Editor/RenderController.php:20
* @route '/editor/projects/{project}/render'
*/
storeForm.post = (args: { project: number | { id: number } } | [project: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions): RouteFormDefinition<'post'> => ({
    action: store.url(args, options),
    method: 'post',
})

store.form = storeForm

/**
* @see \App\Http\Controllers\Editor\RenderController::show
* @see app/Http/Controllers/Editor/RenderController.php:41
* @route '/editor/renders/{render}'
*/
export const show = (args: { render: number | { id: number } } | [render: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions): RouteDefinition<'get'> => ({
    url: show.url(args, options),
    method: 'get',
})

show.definition = {
    methods: ["get","head"],
    url: '/editor/renders/{render}',
} satisfies RouteDefinition<["get","head"]>

/**
* @see \App\Http\Controllers\Editor\RenderController::show
* @see app/Http/Controllers/Editor/RenderController.php:41
* @route '/editor/renders/{render}'
*/
show.url = (args: { render: number | { id: number } } | [render: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions) => {
    if (typeof args === 'string' || typeof args === 'number') {
        args = { render: args }
    }

    if (typeof args === 'object' && !Array.isArray(args) && 'id' in args) {
        args = { render: args.id }
    }

    if (Array.isArray(args)) {
        args = {
            render: args[0],
        }
    }

    args = applyUrlDefaults(args)

    const parsedArgs = {
        render: typeof args.render === 'object'
        ? args.render.id
        : args.render,
    }

    return show.definition.url
            .replace('{render}', parsedArgs.render.toString())
            .replace(/\/+$/, '') + queryParams(options)
}

/**
* @see \App\Http\Controllers\Editor\RenderController::show
* @see app/Http/Controllers/Editor/RenderController.php:41
* @route '/editor/renders/{render}'
*/
show.get = (args: { render: number | { id: number } } | [render: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions): RouteDefinition<'get'> => ({
    url: show.url(args, options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Editor\RenderController::show
* @see app/Http/Controllers/Editor/RenderController.php:41
* @route '/editor/renders/{render}'
*/
show.head = (args: { render: number | { id: number } } | [render: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions): RouteDefinition<'head'> => ({
    url: show.url(args, options),
    method: 'head',
})

/**
* @see \App\Http\Controllers\Editor\RenderController::show
* @see app/Http/Controllers/Editor/RenderController.php:41
* @route '/editor/renders/{render}'
*/
const showForm = (args: { render: number | { id: number } } | [render: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: show.url(args, options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Editor\RenderController::show
* @see app/Http/Controllers/Editor/RenderController.php:41
* @route '/editor/renders/{render}'
*/
showForm.get = (args: { render: number | { id: number } } | [render: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: show.url(args, options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Editor\RenderController::show
* @see app/Http/Controllers/Editor/RenderController.php:41
* @route '/editor/renders/{render}'
*/
showForm.head = (args: { render: number | { id: number } } | [render: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
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
* @see \App\Http\Controllers\Editor\RenderController::download
* @see app/Http/Controllers/Editor/RenderController.php:53
* @route '/editor/renders/{render}/download'
*/
export const download = (args: { render: number | { id: number } } | [render: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions): RouteDefinition<'get'> => ({
    url: download.url(args, options),
    method: 'get',
})

download.definition = {
    methods: ["get","head"],
    url: '/editor/renders/{render}/download',
} satisfies RouteDefinition<["get","head"]>

/**
* @see \App\Http\Controllers\Editor\RenderController::download
* @see app/Http/Controllers/Editor/RenderController.php:53
* @route '/editor/renders/{render}/download'
*/
download.url = (args: { render: number | { id: number } } | [render: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions) => {
    if (typeof args === 'string' || typeof args === 'number') {
        args = { render: args }
    }

    if (typeof args === 'object' && !Array.isArray(args) && 'id' in args) {
        args = { render: args.id }
    }

    if (Array.isArray(args)) {
        args = {
            render: args[0],
        }
    }

    args = applyUrlDefaults(args)

    const parsedArgs = {
        render: typeof args.render === 'object'
        ? args.render.id
        : args.render,
    }

    return download.definition.url
            .replace('{render}', parsedArgs.render.toString())
            .replace(/\/+$/, '') + queryParams(options)
}

/**
* @see \App\Http\Controllers\Editor\RenderController::download
* @see app/Http/Controllers/Editor/RenderController.php:53
* @route '/editor/renders/{render}/download'
*/
download.get = (args: { render: number | { id: number } } | [render: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions): RouteDefinition<'get'> => ({
    url: download.url(args, options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Editor\RenderController::download
* @see app/Http/Controllers/Editor/RenderController.php:53
* @route '/editor/renders/{render}/download'
*/
download.head = (args: { render: number | { id: number } } | [render: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions): RouteDefinition<'head'> => ({
    url: download.url(args, options),
    method: 'head',
})

/**
* @see \App\Http\Controllers\Editor\RenderController::download
* @see app/Http/Controllers/Editor/RenderController.php:53
* @route '/editor/renders/{render}/download'
*/
const downloadForm = (args: { render: number | { id: number } } | [render: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: download.url(args, options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Editor\RenderController::download
* @see app/Http/Controllers/Editor/RenderController.php:53
* @route '/editor/renders/{render}/download'
*/
downloadForm.get = (args: { render: number | { id: number } } | [render: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: download.url(args, options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Editor\RenderController::download
* @see app/Http/Controllers/Editor/RenderController.php:53
* @route '/editor/renders/{render}/download'
*/
downloadForm.head = (args: { render: number | { id: number } } | [render: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: download.url(args, {
        [options?.mergeQuery ? 'mergeQuery' : 'query']: {
            _method: 'HEAD',
            ...(options?.query ?? options?.mergeQuery ?? {}),
        }
    }),
    method: 'get',
})

download.form = downloadForm

const RenderController = { store, show, download }

export default RenderController