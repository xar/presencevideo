/**
 * Text layout shared by every surface that draws text.
 *
 * `drawtext` cannot wrap, so the renderer and the preview have always disagreed
 * about where a line breaks. Layout is therefore decided ONCE here, in project
 * pixels, and every consumer draws the line boxes it is handed: the canvas
 * compositor strokes them, the inspector measures them, and the server render
 * receives them already broken rather than re-deciding.
 */

export type TextAlign = 'left' | 'center' | 'right';
export type VerticalAlign = 'top' | 'middle' | 'bottom';

export type TextLayoutInput = {
    text: string;
    /** Box the text is laid out into, in project pixels. */
    width: number;
    height: number;
    fontSize: number;
    fontFamily: string;
    fontWeight: 'normal' | 'bold';
    /** Inner padding applied on all four sides, in project pixels. */
    padding?: number;
    align?: TextAlign;
    verticalAlign?: VerticalAlign;
    /** Multiple of font size; 1.2 matches the browser's default body leading. */
    lineHeight?: number;
    /** Extra tracking between characters, in project pixels. */
    letterSpacing?: number;
    /** When false, text overflows the box on one line instead of wrapping. */
    wrap?: boolean;
};

export type TextLine = {
    text: string;
    /** Left edge of the line, already resolved for the alignment. */
    x: number;
    /** Baseline-independent top edge of the line box. */
    y: number;
    width: number;
    height: number;
};

export type TextLayout = {
    lines: TextLine[];
    lineHeightPx: number;
    /** Union of the line boxes, used to draw the background box and to fit. */
    blockWidth: number;
    blockHeight: number;
    /** True when the laid-out text is taller than the box allows. */
    overflows: boolean;
};

/** Measures the advance width of a string at the current layout settings. */
export type MeasureText = (text: string) => number;

export const DEFAULT_LINE_HEIGHT = 1.2;

/**
 * Build the CSS `font` shorthand for a layout.
 *
 * Both the preview and the export measure through the same string, so a font
 * that falls back on one surface falls back identically on the other instead of
 * silently producing two different wraps.
 */
export function cssFontShorthand(
    input: Pick<TextLayoutInput, 'fontSize' | 'fontFamily' | 'fontWeight'>,
): string {
    return `${input.fontWeight} ${input.fontSize}px ${input.fontFamily}`;
}

/**
 * Approximate measurement used when no real text metrics are available
 * (server-side pre-flight, unit tests, SSR). Deliberately crude: callers that
 * can measure for real must pass their own `measure`.
 */
export function approximateMeasure(
    input: Pick<TextLayoutInput, 'fontSize' | 'letterSpacing'>,
): MeasureText {
    const perChar = input.fontSize * 0.5;
    const tracking = input.letterSpacing ?? 0;
    return (text: string) => text.length * (perChar + tracking);
}

/**
 * Break one paragraph into lines that fit `maxWidth`.
 *
 * Words longer than the line (URLs, long compounds) are broken character by
 * character rather than allowed to overflow, matching `overflow-wrap: anywhere`
 * in the preview.
 */
function wrapParagraph(
    paragraph: string,
    maxWidth: number,
    measure: MeasureText,
): string[] {
    if (paragraph === '') {
        return [''];
    }

    const words = paragraph.split(/(\s+)/).filter((part) => part !== '');
    const lines: string[] = [];
    let current = '';

    const pushCurrent = () => {
        if (current !== '') {
            lines.push(current.trimEnd());
            current = '';
        }
    };

    for (const word of words) {
        const isWhitespace = /^\s+$/.test(word);

        if (isWhitespace) {
            // Leading whitespace on a fresh line is dropped, as in CSS.
            if (current !== '') {
                current += word;
            }
            continue;
        }

        const candidate = current + word;
        if (measure(candidate) <= maxWidth || current === '') {
            if (measure(word) > maxWidth && current === '') {
                // A single word wider than the box: break it by character.
                let chunk = '';
                for (const character of word) {
                    if (chunk !== '' && measure(chunk + character) > maxWidth) {
                        lines.push(chunk);
                        chunk = character;
                    } else {
                        chunk += character;
                    }
                }
                current = chunk;
                continue;
            }

            current = candidate;
            continue;
        }

        pushCurrent();
        current = word;
    }

    pushCurrent();

    return lines.length > 0 ? lines : [''];
}

function alignedX(
    lineWidth: number,
    contentLeft: number,
    contentWidth: number,
    align: TextAlign,
): number {
    if (align === 'center') {
        return contentLeft + (contentWidth - lineWidth) / 2;
    }
    if (align === 'right') {
        return contentLeft + contentWidth - lineWidth;
    }
    return contentLeft;
}

/**
 * Lay text out into positioned line boxes, in project pixels, relative to the
 * element's own top-left corner.
 */
export function layoutText(
    input: TextLayoutInput,
    measure?: MeasureText,
): TextLayout {
    const padding = Math.max(0, input.padding ?? 0);
    const align = input.align ?? 'left';
    const verticalAlign = input.verticalAlign ?? 'top';
    const lineHeightPx =
        input.fontSize * (input.lineHeight ?? DEFAULT_LINE_HEIGHT);
    const measureText = measure ?? approximateMeasure(input);

    const contentLeft = padding;
    const contentTop = padding;
    const contentWidth = Math.max(0, input.width - padding * 2);
    const contentHeight = Math.max(0, input.height - padding * 2);

    const paragraphs = (input.text ?? '').split('\n');
    const wrapped =
        input.wrap === false || contentWidth <= 0
            ? paragraphs
            : paragraphs.flatMap((paragraph) =>
                  wrapParagraph(paragraph, contentWidth, measureText),
              );

    const blockHeight = wrapped.length * lineHeightPx;

    let offsetY = contentTop;
    if (verticalAlign === 'middle') {
        offsetY = contentTop + (contentHeight - blockHeight) / 2;
    } else if (verticalAlign === 'bottom') {
        offsetY = contentTop + contentHeight - blockHeight;
    }

    let blockWidth = 0;
    const lines: TextLine[] = wrapped.map((text, index) => {
        const width = measureText(text);
        blockWidth = Math.max(blockWidth, width);

        return {
            text,
            x: alignedX(width, contentLeft, contentWidth, align),
            y: offsetY + index * lineHeightPx,
            width,
            height: lineHeightPx,
        };
    });

    return {
        lines,
        lineHeightPx,
        blockWidth,
        blockHeight,
        overflows: blockHeight > contentHeight || blockWidth > contentWidth,
    };
}

/**
 * Largest font size at which the text still fits the box, found by bisection.
 *
 * Used by "shrink to fit" in the inspector and by caption presets that must not
 * spill on long lines.
 */
export function fitFontSize(
    input: TextLayoutInput,
    makeMeasure: (fontSize: number) => MeasureText,
    minFontSize = 8,
): number {
    let low = minFontSize;
    let high = input.fontSize;

    if (!layoutText(input, makeMeasure(high)).overflows) {
        return high;
    }

    for (let i = 0; i < 12 && high - low > 0.5; i++) {
        const middle = (low + high) / 2;
        const candidate = { ...input, fontSize: middle };
        if (layoutText(candidate, makeMeasure(middle)).overflows) {
            high = middle;
        } else {
            low = middle;
        }
    }

    return Math.max(minFontSize, Math.floor(low));
}
