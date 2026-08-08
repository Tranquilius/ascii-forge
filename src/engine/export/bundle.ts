import { downloadZip } from 'client-zip';
import type { AsciiFrame } from '../types';
import type { RenderOptions } from '../render/canvas';
import { exportPng } from './png';
import { exportSvg } from './svg';
import { exportTxt } from './txt';
import { exportAnsi } from './ansi';
import { exportHtml } from './html';
import { exportJson } from './json';

export interface BundleOptions extends RenderOptions {
  baseName?: string;
}

/** Zip every export format into one Blob for the "Download all" button. */
export async function exportAllZip(frame: AsciiFrame, opts: BundleOptions): Promise<Blob> {
  const baseName = opts.baseName ?? 'ascii';
  const png = await exportPng(frame, opts);
  // HTML only gets a background rule when the user chose a solid background; transparent
  // should stay transparent in the exported markup, same as the PNG/SVG do.
  const htmlBgColor = opts.bgMode === 'solid' ? opts.bgColor : undefined;

  return downloadZip([
    { name: `${baseName}.png`, input: png },
    { name: `${baseName}.svg`, input: exportSvg(frame, opts) },
    { name: `${baseName}.txt`, input: exportTxt(frame) },
    { name: `${baseName}.html`, input: exportHtml(frame, { fontFamily: opts.fontFamily, bgColor: htmlBgColor }) },
    { name: `${baseName}.json`, input: exportJson(frame) },
    { name: `${baseName}.ansi.txt`, input: exportAnsi(frame) },
  ]).blob();
}
