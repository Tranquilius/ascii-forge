import { useCallback, useRef, useState } from 'react';
import { useAppStore } from '@/store';
import { decodeFile, isAcceptedFile, isVideoFile } from '@/engine/decode';

export function DropZone() {
  const setFrames = useAppStore((s) => s.setFrames);
  const setLoading = useAppStore((s) => s.setLoading);
  const setError = useAppStore((s) => s.setError);
  const sourceFileName = useAppStore((s) => s.sourceFileName);
  const frameCount = useAppStore((s) => s.frames.length);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(
    async (file: File | undefined | null) => {
      if (!file) return;
      if (!isAcceptedFile(file)) {
        setError('Unsupported file type. Use PNG, JPG, WEBP, SVG, GIF, MP4, or WEBM.');
        return;
      }
      setLoading(true, isVideoFile(file) ? 'Extracting video frames…' : 'Decoding…');
      setError(null);
      try {
        const decoded = await decodeFile(file);
        if (decoded.length === 0) throw new Error('No frames found.');
        setFrames(decoded, file.name);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not decode that file.');
      } finally {
        setLoading(false);
      }
    },
    [setFrames, setLoading, setError],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        void handleFile(e.dataTransfer.files[0]);
      }}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors ${
        dragOver ? 'border-[var(--accent)] bg-[var(--accent-dim)]' : 'border-[var(--panel-border)]'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif,video/mp4,video/webm,video/quicktime"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
      <p className="text-sm text-[var(--text)]">{sourceFileName ?? 'Drop or browse'}</p>
      <p className="text-xs text-[var(--text-dim)]">
        {frameCount > 1 ? `${frameCount} frames · animated` : 'PNG, JPG, WEBP, SVG, GIF, MP4, WEBM'}
      </p>
    </div>
  );
}
