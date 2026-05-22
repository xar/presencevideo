import { queryParams, type RouteQueryOptions, type RouteDefinition, type RouteFormDefinition, applyUrlDefaults } from './../../../wayfinder'
/**
* @see \App\Http\Controllers\Agent\ChatController::index
* @see app/Http/Controllers/Agent/ChatController.php:19
* @route '/agent'
*/
export const index = (options?: RouteQueryOptions): RouteDefinition<'get'> => ({
    url: index.url(options),
    method: 'get',
})

index.definition = {
    methods: ["get","head"],
    url: '/agent',
} satisfies RouteDefinition<["get","head"]>

/**
* @see \App\Http\Controllers\Agent\ChatController::index
* @see app/Http/Controllers/Agent/ChatController.php:19
* @route '/agent'
*/
index.url = (options?: RouteQueryOptions) => {
    return index.definition.url + queryParams(options)
}

/**
* @see \App\Http\Controllers\Agent\ChatController::index
* @see app/Http/Controllers/Agent/ChatController.php:19
* @route '/agent'
*/
index.get = (options?: RouteQueryOptions): RouteDefinition<'get'> => ({
    url: index.url(options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Agent\ChatController::index
* @see app/Http/Controllers/Agent/ChatController.php:19
* @route '/agent'
*/
index.head = (options?: RouteQueryOptions): RouteDefinition<'head'> => ({
    url: index.url(options),
    method: 'head',
})

/**
* @see \App\Http\Controllers\Agent\ChatController::index
* @see app/Http/Controllers/Agent/ChatController.php:19
* @route '/agent'
*/
const indexForm = (options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: index.url(options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Agent\ChatController::index
* @see app/Http/Controllers/Agent/ChatController.php:19
* @route '/agent'
*/
indexForm.get = (options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: index.url(options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Agent\ChatController::index
* @see app/Http/Controllers/Agent/ChatController.php:19
* @route '/agent'
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
* @see \App\Http\Controllers\Agent\ChatController::latest
* @see app/Http/Controllers/Agent/ChatController.php:80
* @route '/agent/conversations/latest'
*/
export const latest = (options?: RouteQueryOptions): RouteDefinition<'get'> => ({
    url: latest.url(options),
    method: 'get',
})

latest.definition = {
    methods: ["get","head"],
    url: '/agent/conversations/latest',
} satisfies RouteDefinition<["get","head"]>

/**
* @see \App\Http\Controllers\Agent\ChatController::latest
* @see app/Http/Controllers/Agent/ChatController.php:80
* @route '/agent/conversations/latest'
*/
latest.url = (options?: RouteQueryOptions) => {
    return latest.definition.url + queryParams(options)
}

/**
* @see \App\Http\Controllers\Agent\ChatController::latest
* @see app/Http/Controllers/Agent/ChatController.php:80
* @route '/agent/conversations/latest'
*/
latest.get = (options?: RouteQueryOptions): RouteDefinition<'get'> => ({
    url: latest.url(options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Agent\ChatController::latest
* @see app/Http/Controllers/Agent/ChatController.php:80
* @route '/agent/conversations/latest'
*/
latest.head = (options?: RouteQueryOptions): RouteDefinition<'head'> => ({
    url: latest.url(options),
    method: 'head',
})

/**
* @see \App\Http\Controllers\Agent\ChatController::latest
* @see app/Http/Controllers/Agent/ChatController.php:80
* @route '/agent/conversations/latest'
*/
const latestForm = (options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: latest.url(options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Agent\ChatController::latest
* @see app/Http/Controllers/Agent/ChatController.php:80
* @route '/agent/conversations/latest'
*/
latestForm.get = (options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: latest.url(options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Agent\ChatController::latest
* @see app/Http/Controllers/Agent/ChatController.php:80
* @route '/agent/conversations/latest'
*/
latestForm.head = (options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: latest.url({
        [options?.mergeQuery ? 'mergeQuery' : 'query']: {
            _method: 'HEAD',
            ...(options?.query ?? options?.mergeQuery ?? {}),
        }
    }),
    method: 'get',
})

latest.form = latestForm

/**
* @see \App\Http\Controllers\Agent\ChatController::show
* @see app/Http/Controllers/Agent/ChatController.php:19
* @route '/agent/conversations/{conversation}'
*/
export const show = (args: { conversation: string | { id: string } } | [conversation: string | { id: string } ] | string | { id: string }, options?: RouteQueryOptions): RouteDefinition<'get'> => ({
    url: show.url(args, options),
    method: 'get',
})

show.definition = {
    methods: ["get","head"],
    url: '/agent/conversations/{conversation}',
} satisfies RouteDefinition<["get","head"]>

/**
* @see \App\Http\Controllers\Agent\ChatController::show
* @see app/Http/Controllers/Agent/ChatController.php:19
* @route '/agent/conversations/{conversation}'
*/
show.url = (args: { conversation: string | { id: string } } | [conversation: string | { id: string } ] | string | { id: string }, options?: RouteQueryOptions) => {
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

    return show.definition.url
            .replace('{conversation}', parsedArgs.conversation.toString())
            .replace(/\/+$/, '') + queryParams(options)
}

/**
* @see \App\Http\Controllers\Agent\ChatController::show
* @see app/Http/Controllers/Agent/ChatController.php:19
* @route '/agent/conversations/{conversation}'
*/
show.get = (args: { conversation: string | { id: string } } | [conversation: string | { id: string } ] | string | { id: string }, options?: RouteQueryOptions): RouteDefinition<'get'> => ({
    url: show.url(args, options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Agent\ChatController::show
* @see app/Http/Controllers/Agent/ChatController.php:19
* @route '/agent/conversations/{conversation}'
*/
show.head = (args: { conversation: string | { id: string } } | [conversation: string | { id: string } ] | string | { id: string }, options?: RouteQueryOptions): RouteDefinition<'head'> => ({
    url: show.url(args, options),
    method: 'head',
})

/**
* @see \App\Http\Controllers\Agent\ChatController::show
* @see app/Http/Controllers/Agent/ChatController.php:19
* @route '/agent/conversations/{conversation}'
*/
const showForm = (args: { conversation: string | { id: string } } | [conversation: string | { id: string } ] | string | { id: string }, options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: show.url(args, options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Agent\ChatController::show
* @see app/Http/Controllers/Agent/ChatController.php:19
* @route '/agent/conversations/{conversation}'
*/
showForm.get = (args: { conversation: string | { id: string } } | [conversation: string | { id: string } ] | string | { id: string }, options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
    action: show.url(args, options),
    method: 'get',
})

/**
* @see \App\Http\Controllers\Agent\ChatController::show
* @see app/Http/Controllers/Agent/ChatController.php:19
* @route '/agent/conversations/{conversation}'
*/
showForm.head = (args: { conversation: string | { id: string } } | [conversation: string | { id: string } ] | string | { id: string }, options?: RouteQueryOptions): RouteFormDefinition<'get'> => ({
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
* @see \App\Http\Controllers\Agent\ChatController::store
* @see app/Http/Controllers/Agent/ChatController.php:42
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
* @see app/Http/Controllers/Agent/ChatController.php:42
* @route '/agent/messages'
*/
store.url = (options?: RouteQueryOptions) => {
    return store.definition.url + queryParams(options)
}

/**
* @see \App\Http\Controllers\Agent\ChatController::store
* @see app/Http/Controllers/Agent/ChatController.php:42
* @route '/agent/messages'
*/
store.post = (options?: RouteQueryOptions): RouteDefinition<'post'> => ({
    url: store.url(options),
    method: 'post',
})

/**
* @see \App\Http\Controllers\Agent\ChatController::store
* @see app/Http/Controllers/Agent/ChatController.php:42
* @route '/agent/messages'
*/
const storeForm = (options?: RouteQueryOptions): RouteFormDefinition<'post'> => ({
    action: store.url(options),
    method: 'post',
})

/**
* @see \App\Http\Controllers\Agent\ChatController::store
* @see app/Http/Controllers/Agent/ChatController.php:42
* @route '/agent/messages'
*/
storeForm.post = (options?: RouteQueryOptions): RouteFormDefinition<'post'> => ({
    action: store.url(options),
    method: 'post',
})

store.form = storeForm

/**
* @see \App\Http\Controllers\Agent\ChatController::stream
* @see app/Http/Controllers/Agent/ChatController.php:52
* @route '/agent/messages/stream'
*/
export const stream = (options?: RouteQueryOptions): RouteDefinition<'post'> => ({
    url: stream.url(options),
    method: 'post',
})

stream.definition = {
    methods: ["post"],
    url: '/agent/messages/stream',
} satisfies RouteDefinition<["post"]>

/**
* @see \App\Http\Controllers\Agent\ChatController::stream
* @see app/Http/Controllers/Agent/ChatController.php:52
* @route '/agent/messages/stream'
*/
stream.url = (options?: RouteQueryOptions) => {
    return stream.definition.url + queryParams(options)
}

/**
* @see \App\Http\Controllers\Agent\ChatController::stream
* @see app/Http/Controllers/Agent/ChatController.php:52
* @route '/agent/messages/stream'
*/
stream.post = (options?: RouteQueryOptions): RouteDefinition<'post'> => ({
    url: stream.url(options),
    method: 'post',
})

/**
* @see \App\Http\Controllers\Agent\ChatController::stream
* @see app/Http/Controllers/Agent/ChatController.php:52
* @route '/agent/messages/stream'
*/
const streamForm = (options?: RouteQueryOptions): RouteFormDefinition<'post'> => ({
    action: stream.url(options),
    method: 'post',
})

/**
* @see \App\Http\Controllers\Agent\ChatController::stream
* @see app/Http/Controllers/Agent/ChatController.php:52
* @route '/agent/messages/stream'
*/
streamForm.post = (options?: RouteQueryOptions): RouteFormDefinition<'post'> => ({
    action: stream.url(options),
    method: 'post',
})

stream.form = streamForm

const chat = {
    index: Object.assign(index, index),
    latest: Object.assign(latest, latest),
    show: Object.assign(show, show),
    store: Object.assign(store, store),
    stream: Object.assign(stream, stream),
}

export default chat