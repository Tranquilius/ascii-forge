import type { AsciiFrame } from '../types';
import { toHtml, type HtmlRenderOptions } from '../render/text';

export function exportHtml(frame: AsciiFrame, opts: HtmlRenderOptions): Blob {
  const body = toHtml(frame, opts);
  const doc = `<!doctype html>\n<html><head><meta charset="utf-8"><title>ASCII export</title></head><body>${body}</body></html>\n`;
  return new Blob([doc], { type: 'text/html;charset=utf-8' });
}
