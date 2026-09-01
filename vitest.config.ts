import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Frontend unit tests. Only the Svelte plugin is loaded (no Laravel/Wayfinder
 * plugins) so `.svelte.ts` rune modules compile and tests run without PHP.
 */
export default defineConfig({
    plugins: [svelte({ hot: false })],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./resources/js', import.meta.url)),
        },
        conditions: ['browser'],
    },
    test: {
        environment: 'jsdom',
        include: ['resources/js/**/*.test.ts'],
        globals: false,
    },
});
