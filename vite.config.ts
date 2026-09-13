import { wayfinder } from '@laravel/vite-plugin-wayfinder';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import laravel from 'laravel-vite-plugin';
import { defineConfig } from 'vite';

// Skip Wayfinder generation in CI/Docker builds - files are pre-committed
const isCI = process.env.CI === 'true' || process.env.DOCKER_BUILD === 'true';

export default defineConfig({
    plugins: [
        laravel({
            input: [
                'resources/css/app.css',
                'resources/js/app.ts',
                'resources/js/islands/demo-editor.ts',
                // Headless server render: the browser export, run by Puppeteer.
                'resources/js/headless/render.ts',
            ],
            ssr: 'resources/js/ssr.ts',
            refresh: true,
            // The site is served over HTTPS (Herd-secured); Vite's dev server
            // must offer TLS too or the browser blocks it as mixed content.
            detectTls: 'videoeditor.test',
        }),
        tailwindcss(),
        svelte(),
        // Only use Wayfinder plugin in development (generates TypeScript route types)
        // In production/Docker, pre-committed files are used directly
        ...(!isCI
            ? [
                  wayfinder({
                      formVariants: true,
                  }),
              ]
            : []),
    ],
});
