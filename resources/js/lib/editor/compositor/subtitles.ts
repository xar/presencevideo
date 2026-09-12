import type { ResolvedSubtitle, ResolvedSubtitleWord } from '../model/frame';
import { layoutText, cssFontShorthand } from '../model/text-layout';
import { applyLetterSpacing, traceRoundedRect } from './context';
import type { Canvas2D } from './context';
import { outwardStrokeWidth } from './geometry';

/**
 * Subtitle painting, always the topmost layer of a frame.
 *
 * The old surfaces disagreed about both order and karaoke: the export burned
 * ASS subtitles above everything while the preview rendered them in the DOM
 * BELOW overlay clips, and only the export honoured `\k` word timing. Painting
 * them here, last, from the resolved word flags, removes both differences.
 */

/** Leading used for subtitle blocks, as a multiple of the font size. */
const SUBTITLE_LINE_HEIGHT = 1.25;

/** Emphasis applied to the word the playhead is currently inside. */
export const CURRENT_WORD_SCALE = 1.08;

/** Box padding, as a multiple of the font size. */
const BOX_PADDING_RATIO = 0.3;

/** Box corner radius, as a multiple of the font size. */
const BOX_RADIUS_RATIO = 0.22;

/**
 * Split laid-out lines back into their words, pairing each with its karaoke
 * state.
 *
 * Wrapping happens on the whole caption string, so the word flags — which are
 * a flat list for the entry — have to be walked in step with the tokens of each
 * line. Kept pure and exported because the pairing is exactly the kind of
 * off-by-one that only shows up on a wrapped caption.
 */
export function assignWordsToLines(
    lineTexts: string[],
    words: ResolvedSubtitleWord[],
): ResolvedSubtitleWord[][] {
    let cursor = 0;

    return lineTexts.map((line) => {
        const tokens = line.split(/\s+/).filter((token) => token !== '');

        return tokens.map((token) => {
            const word = words[cursor];
            cursor += 1;

            // Fall back to the token's own text when the resolver produced no
            // word timings at all, so a plain caption still paints.
            return word
                ? { ...word, text: word.text || token }
                : { text: token, active: false, current: false };
        });
    });
}

function measureFor(ctx: Canvas2D, native: boolean, letterSpacing: number) {
    return (text: string): number => {
        const width = ctx.measureText(text).width;

        return native ? width : width + letterSpacing * text.length;
    };
}

function paintWord(
    ctx: Canvas2D,
    word: ResolvedSubtitleWord,
    x: number,
    baselineY: number,
    width: number,
    fontSize: number,
    subtitle: ResolvedSubtitle,
): void {
    ctx.save();
    try {
        if (word.current) {
            // Emphasis is about the word's OWN centre so neighbouring words do
            // not appear to shift as the playhead moves through the line.
            const cx = x + width / 2;
            ctx.translate(cx, baselineY);
            ctx.scale(CURRENT_WORD_SCALE, CURRENT_WORD_SCALE);
            ctx.translate(-cx, -baselineY);
        }

        const stroke = outwardStrokeWidth(subtitle.strokeWidth);
        if (subtitle.strokeColor && stroke > 0) {
            ctx.lineWidth = stroke;
            ctx.lineJoin = 'round';
            ctx.miterLimit = 2;
            ctx.strokeStyle = subtitle.strokeColor;
            ctx.strokeText(word.text, x, baselineY);
        }

        // A word stays highlighted once reached, matching ASS `\k`.
        ctx.fillStyle =
            word.active && subtitle.highlightColor
                ? subtitle.highlightColor
                : subtitle.color;
        ctx.fillText(word.text, x, baselineY);
    } finally {
        ctx.restore();
    }
}

function drawSubtitle(
    ctx: Canvas2D,
    subtitle: ResolvedSubtitle,
    frameWidth: number,
    frameHeight: number,
): void {
    const fontSize = subtitle.fontSize;
    if (!Number.isFinite(fontSize) || fontSize <= 0) {
        return;
    }

    const text = subtitle.uppercase
        ? (subtitle.text ?? '').toUpperCase()
        : (subtitle.text ?? '');
    if (text.trim() === '') {
        return;
    }

    const marginH = Math.max(0, subtitle.marginH);
    const marginV = Math.max(0, subtitle.marginV);
    const contentWidth = frameWidth - marginH * 2;
    if (!(contentWidth > 0)) {
        return;
    }

    ctx.save();
    try {
        ctx.font = cssFontShorthand({
            fontSize,
            fontFamily: subtitle.fontFamily,
            fontWeight: 'bold',
        });
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        const nativeSpacing = applyLetterSpacing(ctx, 0);
        const measure = measureFor(ctx, nativeSpacing, 0);

        const layout = layoutText(
            {
                text,
                width: contentWidth,
                height: frameHeight,
                fontSize,
                fontFamily: subtitle.fontFamily,
                fontWeight: 'bold',
                align: 'center',
                verticalAlign: 'top',
                lineHeight: SUBTITLE_LINE_HEIGHT,
                wrap: true,
            },
            measure,
        );

        const blockHeight = layout.lines.length * layout.lineHeightPx;
        const originX = marginH;
        const originY =
            subtitle.position === 'top'
                ? marginV
                : frameHeight - marginV - blockHeight;

        if (subtitle.backgroundColor) {
            const padding = fontSize * BOX_PADDING_RATIO;
            ctx.fillStyle = subtitle.backgroundColor;
            traceRoundedRect(
                ctx,
                {
                    x:
                        originX +
                        (contentWidth - layout.blockWidth) / 2 -
                        padding,
                    y: originY - padding,
                    width: layout.blockWidth + padding * 2,
                    height: blockHeight + padding * 2,
                },
                fontSize * BOX_RADIUS_RATIO,
            );
            ctx.fill();
        }

        // The uppercase flag has to reach the WORDS too, not just the string
        // that was laid out: the words are what actually get painted.
        const words = subtitle.uppercase
            ? (subtitle.words ?? []).map((word) => ({
                  ...word,
                  text: word.text.toUpperCase(),
              }))
            : (subtitle.words ?? []);

        const wordsPerLine = assignWordsToLines(
            layout.lines.map((line) => line.text),
            words,
        );
        const spaceWidth = measure(' ');

        layout.lines.forEach((line, index) => {
            const words = wordsPerLine[index] ?? [];
            if (words.length === 0) {
                return;
            }

            // Re-derive the line width from the words actually being painted:
            // the flags may carry normalised text that measures differently
            // from the raw source line.
            const widths = words.map((word) => measure(word.text));
            const lineWidth =
                widths.reduce((total, width) => total + width, 0) +
                spaceWidth * Math.max(0, words.length - 1);

            let x = originX + (contentWidth - lineWidth) / 2;
            // `line.y` is the top of the line box; glyphs sit on a baseline
            // roughly 80% of the way down the em box.
            const baselineY = originY + line.y + layout.lineHeightPx * 0.8;

            words.forEach((word, wordIndex) => {
                paintWord(
                    ctx,
                    word,
                    x,
                    baselineY,
                    widths[wordIndex],
                    fontSize,
                    subtitle,
                );
                x += widths[wordIndex] + spaceWidth;
            });
        });
    } finally {
        ctx.restore();
    }
}

/**
 * Paint every subtitle of a frame. Called after all elements, unconditionally:
 * subtitles are never occluded by an overlay clip.
 */
export function drawSubtitles(
    ctx: Canvas2D,
    subtitles: ResolvedSubtitle[],
    frameWidth: number,
    frameHeight: number,
): void {
    if (!subtitles || subtitles.length === 0) {
        return;
    }

    for (const subtitle of subtitles) {
        drawSubtitle(ctx, subtitle, frameWidth, frameHeight);
    }
}
