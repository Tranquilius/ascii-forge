import { describe, expect, it } from 'vitest';
import type { AsciiFrame } from '../types';
import { buildRowRuns } from './runs';

function frameFromRow(chars: number[], colors: Array<[number, number, number, number]>): AsciiFrame {
  const cols = chars.length;
  const rgba = new Uint8ClampedArray(cols * 4);
  colors.forEach((c, i) => rgba.set(c, i * 4));
  return {
    cols,
    rows: 1,
    chars: Uint16Array.from(chars),
    rgba,
    ramp: [' ', '.', ':', '#'],
    durationMs: 0,
  };
}

describe('buildRowRuns', () => {
  it('collapses a uniformly colored row into a single run', () => {
    const frame = frameFromRow([1, 2, 3], [
      [255, 0, 0, 255],
      [255, 0, 0, 255],
      [255, 0, 0, 255],
    ]);
    const runs = buildRowRuns(frame, 0);
    expect(runs).toHaveLength(1);
    expect(runs[0].text).toBe('.:#');
    expect(runs[0].startCol).toBe(0);
  });

  it('splits on every color change and preserves column offsets', () => {
    const frame = frameFromRow([1, 1, 2, 2, 2], [
      [255, 0, 0, 255],
      [255, 0, 0, 255],
      [0, 255, 0, 255],
      [0, 255, 0, 255],
      [0, 255, 0, 255],
    ]);
    const runs = buildRowRuns(frame, 0);
    expect(runs).toHaveLength(2);
    expect(runs[0]).toMatchObject({ startCol: 0, text: '..', color: [255, 0, 0, 255] });
    expect(runs[1]).toMatchObject({ startCol: 2, text: ':::', color: [0, 255, 0, 255] });
  });

  it('handles a single-cell row', () => {
    const frame = frameFromRow([3], [[1, 2, 3, 255]]);
    const runs = buildRowRuns(frame, 0);
    expect(runs).toEqual([{ startCol: 0, text: '#', color: [1, 2, 3, 255] }]);
  });

  // Background removal works by zeroing alpha, so a cell that has been matted out must read
  // as a space here — this one function is what every renderer builds its output from.
  it('renders a transparent cell as a space regardless of its ramp index', () => {
    const frame = frameFromRow([3], [[1, 2, 3, 0]]);
    expect(buildRowRuns(frame, 0)[0].text).toBe(' ');
  });

  it('keeps the run structure when only some cells are transparent', () => {
    const frame = frameFromRow([3, 3, 3], [
      [255, 0, 0, 255],
      [255, 0, 0, 0],
      [255, 0, 0, 255],
    ]);
    const runs = buildRowRuns(frame, 0);
    // Different alpha means a different colour, so the row splits into three runs.
    expect(runs.map((r) => r.text)).toEqual(['#', ' ', '#']);
  });

  it('treats a barely-visible cell as blank, not as a faint glyph', () => {
    const frame = frameFromRow([3], [[255, 255, 255, 3]]);
    expect(buildRowRuns(frame, 0)[0].text).toBe(' ');
  });
});
