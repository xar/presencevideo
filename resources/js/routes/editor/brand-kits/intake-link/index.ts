import { queryParams, type RouteQueryOptions, type RouteDefinition, type RouteFormDefinition, applyUrlDefaults } from './../../../../wayfinder'
/**
* @see \App\Http\Controllers\Editor\BrandKitController::revoke
* @see app/Http/Controllers/Editor/BrandKitController.php:82
* @route '/editor/brand-kits/{brandKit}/intake-link'
*/
export const revoke = (args: { brandKit: number | { id: number } } | [brandKit: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions): RouteDefinition<'delete'> => ({
    url: revoke.url(args, options),
    method: 'delete',
})

revoke.definition = {
    methods: ["delete"],
    url: '/editor/brand-kits/{brandKit}/intake-link',
} satisfies RouteDefinition<["delete"]>

/**
* @see \App\Http\Controllers\Editor\BrandKitController::revoke
* @see app/Http/Controllers/Editor/BrandKitController.php:82
* @route '/editor/brand-kits/{brandKit}/intake-link'
*/
revoke.url = (args: { brandKit: number | { id: number } } | [brandKit: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions) => {
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

    return revoke.definition.url
            .replace('{brandKit}', parsedArgs.brandKit.toString())
            .replace(/\/+$/, '') + queryParams(options)
}

/**
* @see \App\Http\Controllers\Editor\BrandKitController::revoke
* @see app/Http/Controllers/Editor/BrandKitController.php:82
* @route '/editor/brand-kits/{brandKit}/intake-link'
*/
revoke.delete = (args: { brandKit: number | { id: number } } | [brandKit: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions): RouteDefinition<'delete'> => ({
    url: revoke.url(args, options),
    method: 'delete',
})

/**
* @see \App\Http\Controllers\Editor\BrandKitController::revoke
* @see app/Http/Controllers/Editor/BrandKitController.php:82
* @route '/editor/brand-kits/{brandKit}/intake-link'
*/
const revokeForm = (args: { brandKit: number | { id: number } } | [brandKit: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions): RouteFormDefinition<'post'> => ({
    action: revoke.url(args, {
        [options?.mergeQuery ? 'mergeQuery' : 'query']: {
            _method: 'DELETE',
            ...(options?.query ?? options?.mergeQuery ?? {}),
        }
    }),
    method: 'post',
})

/**
* @see \App\Http\Controllers\Editor\BrandKitController::revoke
* @see app/Http/Controllers/Editor/BrandKitController.php:82
* @route '/editor/brand-kits/{brandKit}/intake-link'
*/
revokeForm.delete = (args: { brandKit: number | { id: number } } | [brandKit: number | { id: number } ] | number | { id: number }, options?: RouteQueryOptions): RouteFormDefinition<'post'> => ({
    action: revoke.url(args, {
        [options?.mergeQuery ? 'mergeQuery' : 'query']: {
            _method: 'DELETE',
            ...(options?.query ?? options?.mergeQuery ?? {}),
        }
    }),
    method: 'post',
})

revoke.form = revokeForm

const intakeLink = {
    revoke: Object.assign(revoke, revoke),
}

export default intakeLink