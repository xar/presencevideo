const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export type AppFetchOptions = RequestInit & {
    json?: unknown;
};

export function getCsrfToken(): string {
    return decodeURIComponent(
        document.cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1] ?? '',
    );
}

export function appFetch(
    input: RequestInfo | URL,
    options: AppFetchOptions = {},
): Promise<Response> {
    const method = (options.method ?? 'GET').toUpperCase();
    const headers = new Headers(options.headers);

    headers.set('Accept', headers.get('Accept') ?? 'application/json');
    headers.set(
        'X-Requested-With',
        headers.get('X-Requested-With') ?? 'XMLHttpRequest',
    );

    if (unsafeMethods.has(method)) {
        headers.set('X-XSRF-TOKEN', getCsrfToken());
    }

    let body = options.body;

    if (options.json !== undefined) {
        headers.set(
            'Content-Type',
            headers.get('Content-Type') ?? 'application/json',
        );
        body = JSON.stringify(options.json);
    }

    return fetch(input, {
        ...options,
        body,
        credentials: options.credentials ?? 'same-origin',
        headers,
        method,
    });
}
