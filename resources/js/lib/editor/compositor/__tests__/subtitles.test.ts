import { describe, expect, it } from 'vitest';
import {
    assignWordsToLines,
    CURRENT_WORD_SCALE,
    drawSubtitles,
} from '../subtitles';
import { subtitle } from './factories';
import { createFakeContext, saveBalance } from './fake-context';

describe('assignWordsToLines', () => {
    it('walks the flat word list in step with the wrapped lines', () => {
        const words = ['a', 'b', 'c', 'd'].map((text, index) => ({
            text,
            active: index < 2,
            current: index === 1,
        }));

        const assigned = assignWordsToLines(['a b', 'c d'], words);

        expect(assigned.map((line) => line.map((word) => word.text))).toEqual([
            ['a', 'b'],
            ['c', 'd'],
        ]);
        expect(assigned[0][1].current).toBe(true);
        expect(assigned[1][0].active).toBe(false);
    });

    it('falls back to the line tokens when there are no word timings', () => {
        const assigned = assignWordsToLines(['hello world'], []);

        expect(assigned[0].map((word) => word.text)).toEqual([
            'hello',
            'world',
        ]);
        expect(assigned[0][0].active).toBe(false);
    });

    it('ignores empty lines and collapsed whitespace', () => {
        expect(assignWordsToLines(['', '   '], [])).toEqual([[], []]);
    });
});

describe('drawSubtitles', () => {
    it('draws nothing for an empty list', () => {
        const ctx = createFakeContext();

        drawSubtitles(ctx, [], 1920, 1080);

        expect(ctx.log).toHaveLength(0);
    });

    it('draws nothing for blank text and stays balanced', () => {
        const ctx = createFakeContext();

        drawSubtitles(ctx, [subtitle({ text: '   ', words: [] })], 1920, 1080);

        expect(ctx.calls('fillText')).toHaveLength(0);
        expect(saveBalance(ctx.log)).toEqual({ net: 0, min: 0 });
    });

    it('keeps a reached word highlighted for the rest of the entry', () => {
        const ctx = createFakeContext();

        drawSubtitles(
            ctx,
            [
                subtitle({
                    words: [
                        { text: 'one', active: true, current: false },
                        { text: 'two', active: false, current: false },
                    ],
                }),
            ],
            1920,
            1080,
        );

        // First word was reached earlier and stays in the highlight colour.
        expect(ctx.sets('fillStyle')).toEqual(['#ffff00', '#ffffff']);
    });

    it('uses the plain colour when no highlight colour is configured', () => {
        const ctx = createFakeContext();

        drawSubtitles(
            ctx,
            [
                subtitle({
                    highlightColor: null,
                    words: [{ text: 'one', active: true, current: false }],
                    text: 'one',
                }),
            ],
            1920,
            1080,
        );

        expect(ctx.sets('fillStyle')).toEqual(['#ffffff']);
    });

    it('emphasises only the current word, about its own centre', () => {
        const ctx = createFakeContext();

        drawSubtitles(
            ctx,
            [
                subtitle({
                    words: [
                        { text: 'one', active: true, current: true },
                        { text: 'two', active: false, current: false },
                    ],
                }),
            ],
            1920,
            1080,
        );

        const scales = ctx.calls('scale');
        expect(scales).toHaveLength(1);
        expect(scales[0].args).toEqual([
            CURRENT_WORD_SCALE,
            CURRENT_WORD_SCALE,
        ]);

        const translates = ctx.calls('translate');
        expect(translates).toHaveLength(2);
        // The emphasis translate is undone immediately afterwards.
        expect(translates[0].args[0]).toBeCloseTo(
            -Number(translates[1].args[0]),
            6,
        );
    });

    it('uppercases the text when asked', () => {
        const ctx = createFakeContext();

        drawSubtitles(ctx, [subtitle({ uppercase: true })], 1920, 1080);

        expect(ctx.calls('fillText').map((call) => call.args[0])).toEqual([
            'ONE',
            'TWO',
        ]);
    });

    it('sits above the bottom margin and below the top margin', () => {
        const bottom = createFakeContext();
        drawSubtitles(bottom, [subtitle({ position: 'bottom' })], 1920, 1080);
        const bottomY = Number(bottom.calls('fillText')[0].args[2]);

        const top = createFakeContext();
        drawSubtitles(top, [subtitle({ position: 'top' })], 1920, 1080);
        const topY = Number(top.calls('fillText')[0].args[2]);

        expect(topY).toBeLessThan(540);
        expect(bottomY).toBeGreaterThan(540);
        expect(bottomY).toBeLessThan(1080);
    });

    it('paints a rounded box behind the block when configured', () => {
        const ctx = createFakeContext();

        drawSubtitles(
            ctx,
            [subtitle({ backgroundColor: '#000000cc' })],
            1920,
            1080,
        );

        expect(ctx.calls('roundRect')).toHaveLength(1);
        const names = ctx.names();
        expect(names.indexOf('fill')).toBeLessThan(names.indexOf('fillText'));
    });

    it('strokes outward, under the fill', () => {
        const ctx = createFakeContext();

        drawSubtitles(
            ctx,
            [subtitle({ strokeColor: '#000000', strokeWidth: 4 })],
            1920,
            1080,
        );

        expect(ctx.sets('lineWidth')).toContain(8);
        const names = ctx.names();
        expect(names.indexOf('strokeText')).toBeLessThan(
            names.indexOf('fillText'),
        );
    });

    it('centres each line horizontally inside the margins', () => {
        const ctx = createFakeContext({ charWidth: 10 });

        drawSubtitles(
            ctx,
            [subtitle({ marginH: 100, text: 'ab', words: [] })],
            1000,
            500,
        );

        // "ab" measures 20px, centred in the 800px content band.
        expect(ctx.calls('fillText')[0].args[1]).toBeCloseTo(490, 6);
    });

    it('stays save/restore balanced across every option', () => {
        const ctx = createFakeContext();

        drawSubtitles(
            ctx,
            [
                subtitle(),
                subtitle({
                    backgroundColor: '#000',
                    strokeColor: '#000',
                    strokeWidth: 2,
                }),
                subtitle({ text: '', words: [] }),
                subtitle({ fontSize: 0 }),
                subtitle({ marginH: 5000 }),
            ],
            1920,
            1080,
        );

        expect(saveBalance(ctx.log)).toEqual({ net: 0, min: 0 });
    });
});
