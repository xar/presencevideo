import { queryParams, type RouteQueryOptions, type RouteDefinition, type RouteFormDefinition } from './../../wayfinder'
import projects from './projects'
import brandKits from './brand-kits'
import assets from './assets'
import generations from './generations'
import renders from './renders'
import headless from './headless'
/**
* @see \App\Http\Controllers\Editor\ProjectController::index
* @see app/Http/Controllers/Editor/ProjectController.php:19
* @route '/editor'
*/
export const index = (options?: RouteQueryOptions): RouteDefinition<'get'> => ({
    url: index.url(options),
    method: 'get',
})

index.definition = {
    methods: ["get","head"],
    url: '/editor',
} satisfies RouteDefinition<["get","head"]>

/**
* @see \App\Http\Controllers\Editor\ProjectController::index
* @see app/Http/Controllers/Editor/ProjectController.php:19
* @route '/editor'
*/
index.url = (options?: RouteQueryOptions) => {
    return index.definition.url + queryParams(options)
}

/**
* @see \App\Http\Controllers\Editor\ProjectController::index
* @see app/Http/Controllers/Editor/ProjectController.php:19
* @route '/editor'
*/
index.get = (options?: RouteQueryOptions): RouteDefinition<'get'> => ({
    url: index.url(options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Editor\ProjectController::index
* @see app/Http/Controllers/Editor/ProjectController.php:19
* @route '/editor'
*/
index.head = (options?: RouteQueryOptions): RouteDefinition<'head'> => ({
    url: index.url(options),
    method: 'head',
})

/**
* @see \App\Http\Controllers\Editor\ProjectController::index
* @see app/Http/Controllers/Editor/ProjectController.php:19
* @route '/editor'
*/
const indexForm = (options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: index.url(options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Editor\ProjectController::index
* @see app/Http/Controllers/Editor/ProjectController.php:19
* @route '/editor'
*/
indexForm.get = (options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: index.url(options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Editor\ProjectController::index
* @see app/Http/Controllers/Editor/ProjectController.php:19
* @route '/editor'
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

const editor = {
    index: Object.assign(index, index),
    projects: Object.assign(projects, projects),
    brandKits: Object.assign(brandKits, brandKits),
    assets: Object.assign(assets, assets),
    generations: Object.assign(generations, generations),
    renders: Object.assign(renders, renders),
    headless: Object.assign(headless, headless),
}

export default editor