import type { AsciiFrame } from '../types';
import { measureRampCell } from '../metrics';
import { buildRowRuns, rgbaToCss } from './runs';
import { CELL_FONT_SIZE } from './canvas';
import type { RenderOptions } from './canvas';

function escapeXml(text: string): string {
  return text.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'));
}

function escapeAttr(text: string): string {
  return escapeXml(text).replace(/"/g, '&quot;');
}

/** Render an AsciiFrame to a standalone SVG document string, at `opts.scale`x. */
export function renderToSVG(frame: AsciiFrame, opts: RenderOptions): string {
  const baseFontSize = opts.fontSize ?? CELL_FONT_SIZE;
  const { cellWidth, cellHeight } = measureRampCell(opts.fontFamily, baseFontSize, frame.ramp);
  const scaledCellWidth = cellWidth * opts.scale;
  const scaledCellHeight = cellHeight * opts.scale;
  const fontSize = baseFontSize * opts.scale;
  const width = Math.max(1, Math.round(frame.cols * scaledCellWidth));
  const height = Math.max(1, Math.round(frame.rows * scaledCellHeight));

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
  ];

  if (opts.bgMode === 'solid') {
    parts.push(`<rect width="${width}" height="${height}" fill="${escapeAttr(opts.bgColor)}"/>`);
  }

  parts.push(
    `<g font-family="${escapeAttr(opts.fontFamily)}" font-size="${fontSize}" xml:space="preserve">`,
  );

  for (let row = 0; row < frame.rows; row++) {
    // baseline sits ~0.8 of the em box down from the top of the cell for most monospace fonts
    const y = row * scaledCellHeight + fontSize * 0.8;
    for (const run of buildRowRuns(frame, row)) {
      const x = run.startCol * scaledCellWidth;
      parts.push(`<text x="${x}" y="${y}" fill="${rgbaToCss(run.color)}">${escapeXml(run.text)}</text>`);
    }
  }

  parts.push('</g></svg>');
  return parts.join('');
}
