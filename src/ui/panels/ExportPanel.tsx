import { useState } from 'react';
import { useAppStore } from '@/store';
import { RENDER_FONT_FAMILY } from '@/engine/pipeline';
import { glyphPixelSize, type RenderOptions } from '@/engine/render/canvas';
import { exportPng } from '@/engine/export/png';
import { exportSvg } from '@/engine/export/svg';
import { exportTxt } from '@/engine/export/txt';
import { exportAnsi } from '@/engine/export/ansi';
import { exportHtml } from '@/engine/export/html';
import { exportJson } from '@/engine/export/json';
import { exportAllZip } from '@/engine/export/bundle';
import { exportGif } from '@/engine/export/gif';
import { Panel } from '@/ui/Panel';
import { SegmentedControl } from '@/ui/controls/SegmentedControl';
import { triggerDownload } from '@/ui/download';

const SCALE_OPTIONS = [1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: `${n}x` }));

type Format = 'png' | 'svg' | 'txt' | 'html' | 'json' | 'ansi';
const FORMATS: { id: Format; label: string }[] = [
  { id: 'png', label: 'PNG' },
  { id: 'svg', label: 'SVG' },
  { id: 'txt', label: 'TXT' },
  { id: 'html', label: 'HTML' },
  { id: 'json', label: 'JSON' },
  { id: 'ansi', label: 'ANSI' },
];

export function ExportPanel() {
  const params = useAppStore((s) => s.params);
  const { exportScale, bgMode, bgColor, blendMode } = params;
  const setParam = useAppStore((s) => s.setParam);
  const frame = useAppStore((s) => s.frame);
  const frames = useAppStore((s) => s.frames);
  const sourceFileName = useAppStore((s) => s.sourceFileName);
  const setError = useAppStore((s) => s.setError);
  const setPlaying = useAppStore((s) => s.setPlaying);
  const [busy, setBusy] = useState<string | null>(null);
  const [gifProgress, setGifProgress] = useState(0);

  const isAnimated = frames.length > 1;

  const baseName = (sourceFileName?.replace(/\.[^.]+$/, '') || 'ascii').replace(/[^a-z0-9_-]+/gi, '_');
  const renderOpts: RenderOptions = {
    fontFamily: RENDER_FONT_FAMILY,
    scale: exportScale,
    fontSize: glyphPixelSize(params.charSize),
    bgMode,
    bgColor,
    blendMode,
  };
  const htmlBgColor = bgMode === 'solid' ? bgColor : undefined;

  async function downloadOne(id: Format) {
    if (!frame) return;
    setBusy(id);
    setError(null);
    try {
      switch (id) {
        case 'png':
          triggerDownload(await exportPng(frame, renderOpts), `${baseName}.png`);
          break;
        case 'svg':
          triggerDownload(exportSvg(frame, renderOpts), `${baseName}.svg`);
          break;
        case 'txt':
          triggerDownload(exportTxt(frame), `${baseName}.txt`);
          break;
        case 'html':
          triggerDownload(
            exportHtml(frame, { fontFamily: RENDER_FONT_FAMILY, bgColor: htmlBgColor }),
            `${baseName}.html`,
          );
          break;
        case 'json':
          triggerDownload(exportJson(frame), `${baseName}.json`);
          break;
        case 'ansi':
          triggerDownload(exportAnsi(frame), `${baseName}.ansi.txt`);
          break;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to export ${id.toUpperCase()}.`);
    } finally {
      setBusy(null);
    }
  }

  async function downloadAll() {
    if (!frame) return;
    setBusy('all');
    setError(null);
    try {
      const zip = await exportAllZip(frame, { ...renderOpts, baseName });
      triggerDownload(zip, `${baseName}.zip`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to build the export bundle.');
    } finally {
      setBusy(null);
    }
  }

  async function downloadGif() {
    if (frames.length === 0) return;
    // Encoding runs on the main thread; leaving playback running would fight it for
    // frame budget and make the export crawl.
    setPlaying(false);
    setBusy('gif');
    setGifProgress(0);
    setError(null);
    try {
      const blob = await exportGif(frames, params, {
        ...renderOpts,
        onProgress: setGifProgress,
      });
      triggerDownload(blob, `${baseName}.gif`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to encode the GIF.');
    } finally {
      setBusy(null);
      setGifProgress(0);
    }
  }

  return (
    <Panel title="Output">
      <SegmentedControl
        label="Scale"
        value={String(exportScale)}
        options={SCALE_OPTIONS}
        onChange={(v) => setParam('exportScale', Number(v))}
      />
      <div className="flex flex-wrap gap-1.5">
        {FORMATS.map((f) => (
          <button
            key={f.id}
            type="button"
            disabled={!frame || busy !== null}
            onClick={() => downloadOne(f.id)}
            className="rounded-md border border-[var(--panel-border)] px-2.5 py-1 text-xs text-[var(--text)] transition-colors hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy === f.id ? '…' : f.label}
          </button>
        ))}
      </div>

      {isAnimated && (
        <button
          type="button"
          disabled={busy !== null}
          onClick={downloadGif}
          className="w-full rounded-md border border-[var(--accent)] bg-[var(--accent-dim)] px-3 py-1.5 text-xs font-medium text-[var(--text)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy === 'gif'
            ? `Encoding GIF… ${Math.round(gifProgress * 100)}%`
            : `Animated GIF (${frames.length} frames)`}
        </button>
      )}
      <button
        type="button"
        disabled={!frame || busy !== null}
        onClick={downloadAll}
        className="w-full rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--bg)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy === 'all' ? 'Zipping…' : 'Download all'}
      </button>
    </Panel>
  );
}
