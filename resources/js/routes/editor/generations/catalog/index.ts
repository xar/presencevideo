import { queryParams, type RouteQueryOptions, type RouteDefinition, type RouteFormDefinition } from './../../../../wayfinder'
/**
* @see \App\Http\Controllers\Editor\GenerationController::model
* @see app/Http/Controllers/Editor/GenerationController.php:84
* @route '/editor/generations/catalog/model'
*/
export const model = (options?: RouteQueryOptions): RouteDefinition<'get'> => ({
    url: model.url(options),
    method: 'get',
})

model.definition = {
    methods: ["get","head"],
    url: '/editor/generations/catalog/model',
} satisfies RouteDefinition<["get","head"]>

/**
* @see \App\Http\Controllers\Editor\GenerationController::model
* @see app/Http/Controllers/Editor/GenerationController.php:84
* @route '/editor/generations/catalog/model'
*/
model.url = (options?: RouteQueryOptions) => {
    return model.definition.url + queryParams(options)
}

/**
* @see \App\Http\Controllers\Editor\GenerationController::model
* @see app/Http/Controllers/Editor/GenerationController.php:84
* @route '/editor/generations/catalog/model'
*/
model.get = (options?: RouteQueryOptions): RouteDefinition<'get'> => ({
    url: model.url(options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Editor\GenerationController::model
* @see app/Http/Controllers/Editor/GenerationController.php:84
* @route '/editor/generations/catalog/model'
*/
model.head = (options?: RouteQueryOptions): RouteDefinition<'head'> => ({
    url: model.url(options),
    method: 'head',
})

/**
* @see \App\Http\Controllers\Editor\GenerationController::model
* @see app/Http/Controllers/Editor/GenerationController.php:84
* @route '/editor/generations/catalog/model'
*/
const modelForm = (options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: model.url(options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Editor\GenerationController::model
* @see app/Http/Controllers/Editor/GenerationController.php:84
* @route '/editor/generations/catalog/model'
*/
modelForm.get = (options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: model.url(options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Editor\GenerationController::model
* @see app/Http/Controllers/Editor/GenerationController.php:84
* @route '/editor/generations/catalog/model'
*/
modelForm.head = (options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: model.url({
        [options?.mergeQuery ? 'mergeQuery' : 'query']: {
            _method: 'HEAD',
            ...(options?.query ?? options?.mergeQuery ?? {}),
        }
    }),
    method: 'get',
})

model.form = modelForm

const catalog = {
    model: Object.assign(model, model),
}

export default catalog