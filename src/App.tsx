import { useAppStore } from '@/store';
import { useGenerateFrame } from '@/ui/useGenerateFrame';
import { usePlayback } from '@/ui/usePlayback';
import { AnimateBar } from '@/ui/AnimateBar';
import { Header } from '@/ui/Header';
import { Footer } from '@/ui/Footer';
import { Preview } from '@/ui/Preview';
import { Transport } from '@/ui/Transport';
import { DropZone } from '@/ui/DropZone';
import { RampPanel } from '@/ui/panels/RampPanel';
import { SamplingPanel } from '@/ui/panels/SamplingPanel';
import { TonePanel } from '@/ui/panels/TonePanel';
import { MixPanel } from '@/ui/panels/MixPanel';
import { BackgroundPanel } from '@/ui/panels/BackgroundPanel';
import { ExportPanel } from '@/ui/panels/ExportPanel';

function App() {
  useGenerateFrame();
  usePlayback();
  const error = useAppStore((s) => s.error);

  return (
    <div className="mx-auto flex min-h-svh max-w-6xl flex-col">
      <Header />

      {error && (
        <div className="mx-4 mt-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      <main className="flex flex-1 flex-col gap-4 p-4 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <DropZone />
          <Preview />
          <AnimateBar />
          <Transport />
        </div>

        <aside className="flex w-full flex-col rounded-lg border border-[var(--panel-border)] bg-[var(--panel)] lg:w-80 lg:shrink-0">
          <RampPanel />
          <SamplingPanel />
          <TonePanel />
          <MixPanel />
          <BackgroundPanel />
          <ExportPanel />
        </aside>
      </main>

      <Footer />
    </div>
  );
}

export default App;
