import { queryParams, type RouteQueryOptions, type RouteDefinition, type RouteFormDefinition, applyUrlDefaults } from './../../../../../wayfinder'
/**
* @see \App\Http\Controllers\Agent\ChatController::index
* @see app/Http/Controllers/Agent/ChatController.php:17
* @route '/agent'
*/
const indexe7033dc6fe826f76bf0c7217ed1bd69b = (options?: RouteQueryOptions): RouteDefinition<'get'> => ({
    url: indexe7033dc6fe826f76bf0c7217ed1bd69b.url(options),
    method: 'get',
})

indexe7033dc6fe826f76bf0c7217ed1bd69b.definition = {
    methods: ["get","head"],
    url: '/agent',
} satisfies RouteDefinition<["get","head"]>

/**
* @see \App\Http\Controllers\Agent\ChatController::index
* @see app/Http/Controllers/Agent/ChatController.php:17
* @route '/agent'
*/
indexe7033dc6fe826f76bf0c7217ed1bd69b.url = (options?: RouteQueryOptions) => {
    return indexe7033dc6fe826f76bf0c7217ed1bd69b.definition.url + queryParams(options)
}

/**
* @see \App\Http\Controllers\Agent\ChatController::index
* @see app/Http/Controllers/Agent/ChatController.php:17
* @route '/agent'
*/
indexe7033dc6fe826f76bf0c7217ed1bd69b.get = (options?: RouteQueryOptions): RouteDefinition<'get'> => ({
    url: indexe7033dc6fe826f76bf0c7217ed1bd69b.url(options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Agent\ChatController::index
* @see app/Http/Controllers/Agent/ChatController.php:17
* @route '/agent'
*/
indexe7033dc6fe826f76bf0c7217ed1bd69b.head = (options?: RouteQueryOptions): RouteDefinition<'head'> => ({
    url: indexe7033dc6fe826f76bf0c7217ed1bd69b.url(options),
    method: 'head',
})

/**
* @see \App\Http\Controllers\Agent\ChatController::index
* @see app/Http/Controllers/Agent/ChatController.php:17
* @route '/agent'
*/
const indexe7033dc6fe826f76bf0c7217ed1bd69bForm = (options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: indexe7033dc6fe826f76bf0c7217ed1bd69b.url(options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Agent\ChatController::index
* @see app/Http/Controllers/Agent/ChatController.php:17
* @route '/agent'
*/
indexe7033dc6fe826f76bf0c7217ed1bd69bForm.get = (options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: indexe7033dc6fe826f76bf0c7217ed1bd69b.url(options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Agent\ChatController::index
* @see app/Http/Controllers/Agent/ChatController.php:17
* @route '/agent'
*/
indexe7033dc6fe826f76bf0c7217ed1bd69bForm.head = (options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: indexe7033dc6fe826f76bf0c7217ed1bd69b.url({
        [options?.mergeQuery ? 'mergeQuery' : 'query']: {
            _method: 'HEAD',
            ...(options?.query ?? options?.mergeQuery ?? {}),
        }
    }),
    method: 'get',
})

indexe7033dc6fe826f76bf0c7217ed1bd69b.form = indexe7033dc6fe826f76bf0c7217ed1bd69bForm
/**
* @see \App\Http\Controllers\Agent\ChatController::index
* @see app/Http/Controllers/Agent/ChatController.php:17
* @route '/agent/conversations/{conversation}'
*/
const index19716d293052ba253e7e3b078fe44735 = (args: { conversation: string | { id: string } } | [conversation: string | { id: string } ] | string | { id: string }, options?: RouteQueryOptions): RouteDefinition<'get'> => ({
    url: index19716d293052ba253e7e3b078fe44735.url(args, options),
    method: 'get',
})

index19716d293052ba253e7e3b078fe44735.definition = {
    methods: ["get","head"],
    url: '/agent/conversations/{conversation}',
} satisfies RouteDefinition<["get","head"]>

/**
* @see \App\Http\Controllers\Agent\ChatController::index
* @see app/Http/Controllers/Agent/ChatController.php:17
* @route '/agent/conversations/{conversation}'
*/
index19716d293052ba253e7e3b078fe44735.url = (args: { conversation: string | { id: string } } | [conversation: string | { id: string } ] | string | { id: string }, options?: RouteQueryOptions) => {
    if (typeof args === 'string' || typeof args === 'number') {
        args = { conversation: args }
    }

    if (typeof args === 'object' && !Array.isArray(args) && 'id' in args) {
        args = { conversation: args.id }
    }

    if (Array.isArray(args)) {
        args = {
            conversation: args[0],
        }
    }

    args = applyUrlDefaults(args)

    const parsedArgs = {
        conversation: typeof args.conversation === 'object'
        ? args.conversation.id
        : args.conversation,
    }

    return index19716d293052ba253e7e3b078fe44735.definition.url
            .replace('{conversation}', parsedArgs.conversation.toString())
            .replace(/\/+$/, '') + queryParams(options)
}

/**
* @see \App\Http\Controllers\Agent\ChatController::index
* @see app/Http/Controllers/Agent/ChatController.php:17
* @route '/agent/conversations/{conversation}'
*/
index19716d293052ba253e7e3b078fe44735.get = (args: { conversation: string | { id: string } } | [conversation: string | { id: string } ] | string | { id: string }, options?: RouteQueryOptions): RouteDefinition<'get'> => ({
    url: index19716d293052ba253e7e3b078fe44735.url(args, options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Agent\ChatController::index
* @see app/Http/Controllers/Agent/ChatController.php:17
* @route '/agent/conversations/{conversation}'
*/
index19716d293052ba253e7e3b078fe44735.head = (args: { conversation: string | { id: string } } | [conversation: string | { id: string } ] | string | { id: string }, options?: RouteQueryOptions): RouteDefinition<'head'> => ({
    url: index19716d293052ba253e7e3b078fe44735.url(args, options),
    method: 'head',
})

/**
* @see \App\Http\Controllers\Agent\ChatController::index
* @see app/Http/Controllers/Agent/ChatController.php:17
* @route '/agent/conversations/{conversation}'
*/
const index19716d293052ba253e7e3b078fe44735Form = (args: { conversation: string | { id: string } } | [conversation: string | { id: string } ] | string | { id: string }, options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: index19716d293052ba253e7e3b078fe44735.url(args, options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Agent\ChatController::index
* @see app/Http/Controllers/Agent/ChatController.php:17
* @route '/agent/conversations/{conversation}'
*/
index19716d293052ba253e7e3b078fe44735Form.get = (args: { conversation: string | { id: string } } | [conversation: string | { id: string } ] | string | { id: string }, options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: index19716d293052ba253e7e3b078fe44735.url(args, options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Agent\ChatController::index
* @see app/Http/Controllers/Agent/ChatController.php:17
* @route '/agent/conversations/{conversation}'
*/
index19716d293052ba253e7e3b078fe44735Form.head = (args: { conversation: string | { id: string } } | [conversation: string | { id: string } ] | string | { id: string }, options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: index19716d293052ba253e7e3b078fe44735.url(args, {
        [options?.mergeQuery ? 'mergeQuery' : 'query']: {
            _method: 'HEAD',
            ...(options?.query ?? options?.mergeQuery ?? {}),
        }
    }),
    method: 'get',
})

index19716d293052ba253e7e3b078fe44735.form = index19716d293052ba253e7e3b078fe44735Form

/**
* Multiple routes resolve to \App\Http\Controllers\Agent\ChatController::index, so this export is a
* dictionary keyed by URI rather than a callable. Call a specific route with `index['<uri>'](...)`,
* or import the route by name from your generated `routes/` directory.
*/
export const index = {
    '/agent': indexe7033dc6fe826f76bf0c7217ed1bd69b,
    '/agent/conversations/{conversation}': index19716d293052ba253e7e3b078fe44735,
}

/**
* @see \App\Http\Controllers\Agent\ChatController::store
* @see app/Http/Controllers/Agent/ChatController.php:40
* @route '/agent/messages'
*/
export const store = (options?: RouteQueryOptions): RouteDefinition<'post'> => ({
    url: store.url(options),
    method: 'post',
})

store.definition = {
    methods: ["post"],
    url: '/agent/messages',
} satisfies RouteDefinition<["post"]>

/**
* @see \App\Http\Controllers\Agent\ChatController::store
* @see app/Http/Controllers/Agent/ChatController.php:40
* @route '/agent/messages'
*/
store.url = (options?: RouteQueryOptions) => {
    return store.definition.url + queryParams(options)
}

/**
* @see \App\Http\Controllers\Agent\ChatController::store
* @see app/Http/Controllers/Agent/ChatController.php:40
* @route '/agent/messages'
*/
store.post = (options?: RouteQueryOptions): RouteDefinition<'post'> => ({
    url: store.url(options),
    method: 'post',
})

/**
* @see \App\Http\Controllers\Agent\ChatController::store
* @see app/Http/Controllers/Agent/ChatController.php:40
* @route '/agent/messages'
*/
const storeForm = (options?: RouteQueryOptions): RouteFormDefinition<'post'> => ({
    action: store.url(options),
    method: 'post',
})

/**
* @see \App\Http\Controllers\Agent\ChatController::store
* @see app/Http/Controllers/Agent/ChatController.php:40
* @route '/agent/messages'
*/
storeForm.post = (options?: RouteQueryOptions): RouteFormDefinition<'post'> => ({
    action: store.url(options),
    method: 'post',
})

store.form = storeForm

const ChatController = { index, store }

export default ChatController