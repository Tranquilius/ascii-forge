import type { AsciiFrame } from '../types';
import { renderToSVG } from '../render/svg';
import type { RenderOptions } from '../render/canvas';

export function exportSvg(frame: AsciiFrame, opts: RenderOptions): Blob {
  return new Blob([renderToSVG(frame, opts)], { type: 'image/svg+xml' });
}
