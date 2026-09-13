import { queryParams, type RouteQueryOptions, type RouteDefinition, type RouteFormDefinition, applyUrlDefaults } from './../../wayfinder'
import assets from './assets'
/**
* @see \App\Http\Controllers\Editor\BrandKitIntakeController::show
* @see app/Http/Controllers/Editor/BrandKitIntakeController.php:39
* @route '/brand-intake/{token}'
*/
export const show = (args: { token: string | number } | [token: string | number ] | string | number, options?: RouteQueryOptions): RouteDefinition<'get'> => ({
    url: show.url(args, options),
    method: 'get',
})

show.definition = {
    methods: ["get","head"],
    url: '/brand-intake/{token}',
} satisfies RouteDefinition<["get","head"]>

/**
* @see \App\Http\Controllers\Editor\BrandKitIntakeController::show
* @see app/Http/Controllers/Editor/BrandKitIntakeController.php:39
* @route '/brand-intake/{token}'
*/
show.url = (args: { token: string | number } | [token: string | number ] | string | number, options?: RouteQueryOptions) => {
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

    return show.definition.url
            .replace('{token}', parsedArgs.token.toString())
            .replace(/\/+$/, '') + queryParams(options)
}

/**
* @see \App\Http\Controllers\Editor\BrandKitIntakeController::show
* @see app/Http/Controllers/Editor/BrandKitIntakeController.php:39
* @route '/brand-intake/{token}'
*/
show.get = (args: { token: string | number } | [token: string | number ] | string | number, options?: RouteQueryOptions): RouteDefinition<'get'> => ({
    url: show.url(args, options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Editor\BrandKitIntakeController::show
* @see app/Http/Controllers/Editor/BrandKitIntakeController.php:39
* @route '/brand-intake/{token}'
*/
show.head = (args: { token: string | number } | [token: string | number ] | string | number, options?: RouteQueryOptions): RouteDefinition<'head'> => ({
    url: show.url(args, options),
    method: 'head',
})

/**
* @see \App\Http\Controllers\Editor\BrandKitIntakeController::show
* @see app/Http/Controllers/Editor/BrandKitIntakeController.php:39
* @route '/brand-intake/{token}'
*/
const showForm = (args: { token: string | number } | [token: string | number ] | string | number, options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: show.url(args, options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Editor\BrandKitIntakeController::show
* @see app/Http/Controllers/Editor/BrandKitIntakeController.php:39
* @route '/brand-intake/{token}'
*/
showForm.get = (args: { token: string | number } | [token: string | number ] | string | number, options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: show.url(args, options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Editor\BrandKitIntakeController::show
* @see app/Http/Controllers/Editor/BrandKitIntakeController.php:39
* @route '/brand-intake/{token}'
*/
showForm.head = (args: { token: string | number } | [token: string | number ] | string | number, options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
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
* @see \App\Http\Controllers\Editor\BrandKitIntakeController::update
* @see app/Http/Controllers/Editor/BrandKitIntakeController.php:53
* @route '/brand-intake/{token}'
*/
export const update = (args: { token: string | number } | [token: string | number ] | string | number, options?: RouteQueryOptions): RouteDefinition<'patch'> => ({
    url: update.url(args, options),
    method: 'patch',
})

update.definition = {
    methods: ["patch","post"],
    url: '/brand-intake/{token}',
} satisfies RouteDefinition<["patch","post"]>

/**
* @see \App\Http\Controllers\Editor\BrandKitIntakeController::update
* @see app/Http/Controllers/Editor/BrandKitIntakeController.php:53
* @route '/brand-intake/{token}'
*/
update.url = (args: { token: string | number } | [token: string | number ] | string | number, options?: RouteQueryOptions) => {
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

    return update.definition.url
            .replace('{token}', parsedArgs.token.toString())
            .replace(/\/+$/, '') + queryParams(options)
}

/**
* @see \App\Http\Controllers\Editor\BrandKitIntakeController::update
* @see app/Http/Controllers/Editor/BrandKitIntakeController.php:53
* @route '/brand-intake/{token}'
*/
update.patch = (args: { token: string | number } | [token: string | number ] | string | number, options?: RouteQueryOptions): RouteDefinition<'patch'> => ({
    url: update.url(args, options),
    method: 'patch',
})

/**
* @see \App\Http\Controllers\Editor\BrandKitIntakeController::update
* @see app/Http/Controllers/Editor/BrandKitIntakeController.php:53
* @route '/brand-intake/{token}'
*/
update.post = (args: { token: string | number } | [token: string | number ] | string | number, options?: RouteQueryOptions): RouteDefinition<'post'> => ({
    url: update.url(args, options),
    method: 'post',
})

/**
* @see \App\Http\Controllers\Editor\BrandKitIntakeController::update
* @see app/Http/Controllers/Editor/BrandKitIntakeController.php:53
* @route '/brand-intake/{token}'
*/
const updateForm = (args: { token: string | number } | [token: string | number ] | string | number, options?: RouteQueryOptions): RouteFormDefinition<'post'> => ({
    action: update.url(args, {
        [options?.mergeQuery ? 'mergeQuery' : 'query']: {
            _method: 'PATCH',
            ...(options?.query ?? options?.mergeQuery ?? {}),
        }
    }),
    method: 'post',
})

/**
* @see \App\Http\Controllers\Editor\BrandKitIntakeController::update
* @see app/Http/Controllers/Editor/BrandKitIntakeController.php:53
* @route '/brand-intake/{token}'
*/
updateForm.patch = (args: { token: string | number } | [token: string | number ] | string | number, options?: RouteQueryOptions): RouteFormDefinition<'post'> => ({
    action: update.url(args, {
        [options?.mergeQuery ? 'mergeQuery' : 'query']: {
            _method: 'PATCH',
            ...(options?.query ?? options?.mergeQuery ?? {}),
        }
    }),
    method: 'post',
})

/**
* @see \App\Http\Controllers\Editor\BrandKitIntakeController::update
* @see app/Http/Controllers/Editor/BrandKitIntakeController.php:53
* @route '/brand-intake/{token}'
*/
updateForm.post = (args: { token: string | number } | [token: string | number ] | string | number, options?: RouteQueryOptions): RouteFormDefinition<'post'> => ({
    action: update.url(args, options),
    method: 'post',
})

update.form = updateForm

const brandIntake = {
    show: Object.assign(show, show),
    update: Object.assign(update, update),
    assets: Object.assign(assets, assets),
}

export default brandIntake