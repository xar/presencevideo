/**
 * The Node half of the headless server render.
 *
 * PHP cannot drive Chrome directly, so `HeadlessRenderService` runs this script
 * and talks to it over a line protocol: a JSON spec file in, NDJSON on stdout.
 * Everything that decides a pixel lives in the page (`render.ts`), which runs
 * the ordinary browser export; this file only opens a browser, installs the two
 * bindings the page hands its output through, and writes the bytes to disk.
 *
 * Run as:  node driver.mjs <spec.json>
 *
 * Spec: { url, outputPath, timeoutMs, chromeBinary?, ignoreCertificateErrors? }
 */

import { once } from 'node:events';
import { createWriteStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import puppeteer from 'puppeteer';

/** Emit one protocol line. Anything else printed is ignored by PHP. */
function emit(message) {
    process.stdout.write(`${JSON.stringify(message)}\n`);
}

/**
 * Chrome flags.
 *
 * `--no-sandbox` is required in the container (no user namespaces); the
 * swiftshader flags keep Chrome from failing over to a GPU it does not have,
 * and `--autoplay-policy` matters because the export builds real AudioContexts
 * with no user gesture behind them. WebCodecs itself needs no flag -- it is on
 * by default in Chrome for Testing -- but it IS gated on a secure context, so
 * the spec URL must be https or a localhost origin.
 */
function chromeArgs(spec) {
    const args = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--enable-unsafe-swiftshader',
        '--autoplay-policy=no-user-gesture-required',
        '--mute-audio',
        '--hide-scrollbars',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
    ];

    if (spec.ignoreCertificateErrors) {
        args.push('--ignore-certificate-errors');
    }

    return args;
}

async function main() {
    const specPath = process.argv[2];

    if (!specPath) {
        emit({ type: 'error', message: 'No render spec was given to the driver.' });
        process.exit(2);
    }

    const spec = JSON.parse(await readFile(specPath, 'utf8'));

    const browser = await puppeteer.launch({
        headless: true,
        executablePath: spec.chromeBinary || undefined,
        args: chromeArgs(spec),
        protocolTimeout: spec.timeoutMs,
    });

    const output = createWriteStream(spec.outputPath);
    let bytesWritten = 0;

    try {
        const page = await browser.newPage();
        page.setDefaultTimeout(spec.timeoutMs);
        page.setDefaultNavigationTimeout(spec.timeoutMs);

        page.on('console', (message) => {
            emit({ type: 'log', level: message.type(), message: message.text() });
        });
        page.on('pageerror', (error) => {
            emit({ type: 'log', level: 'error', message: String(error?.message ?? error) });
        });

        // Bindings must exist before the page script runs, or the export has
        // nowhere to put its output and fails on the first chunk.
        await page.exposeFunction('__headlessProgress', (progress) => {
            emit({ type: 'progress', ...progress });
        });

        await page.exposeFunction('__headlessChunk', async (base64) => {
            const buffer = Buffer.from(base64, 'base64');
            bytesWritten += buffer.byteLength;

            // Respect the stream's high-water mark: this is the backpressure
            // that keeps a long render from buffering the whole MP4 in Node.
            if (!output.write(buffer)) {
                await once(output, 'drain');
            }
        });

        const response = await page.goto(spec.url, { waitUntil: 'load' });

        if (!response || !response.ok()) {
            throw new Error(
                `The render page returned HTTP ${response ? response.status() : 'no response'}. The render token may have expired.`,
            );
        }

        await page.waitForFunction(() => typeof window.__headlessRender === 'function', {
            timeout: spec.timeoutMs,
        });

        const summary = await page.evaluate(() => window.__headlessRender());

        await new Promise((resolve, reject) => {
            output.end((error) => (error ? reject(error) : resolve()));
        });

        if (bytesWritten === 0) {
            throw new Error('The headless render produced no video data.');
        }

        emit({ type: 'done', ...summary, bytesWritten });
    } catch (error) {
        output.destroy();
        emit({ type: 'error', message: String(error?.message ?? error) });
        await browser.close().catch(() => undefined);
        process.exit(1);
    }

    await browser.close().catch(() => undefined);
    process.exit(0);
}

main().catch((error) => {
    emit({ type: 'error', message: String(error?.message ?? error) });
    process.exit(1);
});
