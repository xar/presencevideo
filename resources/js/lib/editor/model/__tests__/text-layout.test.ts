import { describe, expect, it } from 'vitest';
import {
    cssFontShorthand,
    fitFontSize,
    layoutText
    
    
} from '../text-layout';
import type {MeasureText, TextLayoutInput} from '../text-layout';

/** Deterministic 10px-per-character metrics so wrap points are exact. */
const measure: MeasureText = (text) => text.length * 10;
const measureAt = (fontSize: number): MeasureText => (text) => text.length * fontSize;

const base: TextLayoutInput = {
    text: '',
    width: 200,
    height: 200,
    fontSize: 20,
    fontFamily: 'Inter, sans-serif',
    fontWeight: 'normal',
    lineHeight: 1.2,
};

describe('layoutText', () => {
    it('keeps short text on one line', () => {
        const layout = layoutText({ ...base, text: 'hello' }, measure);
        expect(layout.lines.map((line) => line.text)).toEqual(['hello']);
        expect(layout.overflows).toBe(false);
    });

    it('wraps on word boundaries at the content width', () => {
        const layout = layoutText({ ...base, text: 'aaa bbb ccc ddd eee' }, measure);
        // 200px / 10px per char = 20 chars per line.
        expect(layout.lines.map((line) => line.text)).toEqual(['aaa bbb ccc ddd eee']);

        const narrower = layoutText({ ...base, width: 100, text: 'aaa bbb ccc ddd eee' }, measure);
        expect(narrower.lines.map((line) => line.text)).toEqual(['aaa bbb', 'ccc ddd', 'eee']);
    });

    it('honours explicit newlines as hard breaks', () => {
        const layout = layoutText({ ...base, text: 'one\ntwo' }, measure);
        expect(layout.lines.map((line) => line.text)).toEqual(['one', 'two']);
    });

    it('preserves an empty line between paragraphs', () => {
        const layout = layoutText({ ...base, text: 'one\n\ntwo' }, measure);
        expect(layout.lines.map((line) => line.text)).toEqual(['one', '', 'two']);
    });

    it('breaks a single word that is wider than the box', () => {
        const layout = layoutText({ ...base, width: 50, text: 'abcdefghij' }, measure);
        expect(layout.lines.map((line) => line.text)).toEqual(['abcde', 'fghij']);
    });

    it('does not wrap when wrapping is disabled', () => {
        const layout = layoutText({ ...base, width: 50, text: 'aaa bbb ccc' }, measure);
        expect(layout.lines.length).toBeGreaterThan(1);

        const unwrapped = layoutText({ ...base, width: 50, text: 'aaa bbb ccc', wrap: false }, measure);
        expect(unwrapped.lines.map((line) => line.text)).toEqual(['aaa bbb ccc']);
        expect(unwrapped.overflows).toBe(true);
    });

    it('insets the content by the padding on every side', () => {
        const layout = layoutText({ ...base, text: 'hi', padding: 15 }, measure);
        expect(layout.lines[0].x).toBe(15);
        expect(layout.lines[0].y).toBe(15);
    });

    it('wraps against the padded content width, not the box width', () => {
        const layout = layoutText({ ...base, width: 100, padding: 20, text: 'aaa bbb' }, measure);
        // Content width is 60px = 6 chars, so "aaa bbb" cannot stay on one line.
        expect(layout.lines.map((line) => line.text)).toEqual(['aaa', 'bbb']);
    });

    it('aligns lines left, centre and right within the content box', () => {
        const text = 'abcd';
        expect(layoutText({ ...base, text, align: 'left' }, measure).lines[0].x).toBe(0);
        expect(layoutText({ ...base, text, align: 'center' }, measure).lines[0].x).toBe(80);
        expect(layoutText({ ...base, text, align: 'right' }, measure).lines[0].x).toBe(160);
    });

    it('aligns the block vertically', () => {
        const text = 'abcd';
        const lineHeight = 24;

        expect(layoutText({ ...base, text, verticalAlign: 'top' }, measure).lines[0].y).toBe(0);
        expect(layoutText({ ...base, text, verticalAlign: 'middle' }, measure).lines[0].y).toBeCloseTo(
            (200 - lineHeight) / 2,
            6,
        );
        expect(layoutText({ ...base, text, verticalAlign: 'bottom' }, measure).lines[0].y).toBeCloseTo(
            200 - lineHeight,
            6,
        );
    });

    it('stacks lines by the line height', () => {
        const layout = layoutText({ ...base, width: 100, text: 'aaa bbb ccc' }, measure);
        expect(layout.lineHeightPx).toBe(24);
        expect(layout.lines[1].y - layout.lines[0].y).toBe(24);
    });

    it('reports overflow when the text is taller than the box', () => {
        const layout = layoutText({ ...base, width: 50, height: 30, text: 'aaa bbb ccc' }, measure);
        expect(layout.overflows).toBe(true);
    });

    it('handles empty text without producing zero lines', () => {
        const layout = layoutText({ ...base, text: '' }, measure);
        expect(layout.lines).toHaveLength(1);
        expect(layout.lines[0].text).toBe('');
    });

    it('measures the block width as the widest line', () => {
        const layout = layoutText({ ...base, width: 100, text: 'aaaaa bb ccccccc' }, measure);
        expect(layout.lines.map((line) => line.text)).toEqual(['aaaaa bb', 'ccccccc']);
        expect(layout.blockWidth).toBe(80);
    });
});

describe('cssFontShorthand', () => {
    it('produces a font string both surfaces can measure with', () => {
        expect(cssFontShorthand({ fontSize: 32, fontFamily: 'Inter', fontWeight: 'bold' })).toBe(
            'bold 32px Inter',
        );
    });
});

describe('fitFontSize', () => {
    it('keeps the requested size when the text already fits', () => {
        const input = { ...base, text: 'hi', fontSize: 20 };
        expect(fitFontSize(input, measureAt)).toBe(20);
    });

    it('shrinks until the text fits the box', () => {
        const input = { ...base, width: 100, height: 30, fontSize: 40, text: 'aaaa bbbb' };
        const fitted = fitFontSize(input, measureAt);

        expect(fitted).toBeLessThan(40);
        expect(layoutText({ ...input, fontSize: fitted }, measureAt(fitted)).overflows).toBe(false);
    });

    it('never goes below the floor', () => {
        const input = { ...base, width: 10, height: 10, fontSize: 40, text: 'a very long line of text' };
        expect(fitFontSize(input, measureAt, 8)).toBeGreaterThanOrEqual(8);
    });
});
