import type { AsciiFrame } from '../types';
import { renderToCanvas, type CanvasLike, type RenderOptions } from '../render/canvas';

/** Render a frame to a PNG Blob at `opts.scale`x — the same renderToCanvas the live preview uses. */
export async function exportPng(frame: AsciiFrame, opts: RenderOptions): Promise<Blob> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(1, 1);
    renderToCanvas(frame, canvas as unknown as CanvasLike, opts);
    return canvas.convertToBlob({ type: 'image/png' });
  }

  const canvas = document.createElement('canvas');
  renderToCanvas(frame, canvas, opts);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to encode PNG'));
    }, 'image/png');
  });
}
