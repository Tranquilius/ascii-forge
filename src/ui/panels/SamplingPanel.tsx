import { useAppStore } from '@/store';
import { Panel } from '@/ui/Panel';
import { Slider } from '@/ui/controls/Slider';

export function SamplingPanel() {
  const { cols, heightScale, pixelate, charSize } = useAppStore((s) => s.params);
  const setParam = useAppStore((s) => s.setParam);

  return (
    <Panel title="Sampling">
      <Slider label="Width" value={cols} min={20} max={400} step={1} onChange={(v) => setParam('cols', v)} />
      <Slider
        label="Height scale"
        value={heightScale}
        min={0.2}
        max={2}
        step={0.01}
        format={(v) => v.toFixed(2)}
        onChange={(v) => setParam('heightScale', v)}
      />
      <Slider
        label="Pixelate"
        value={pixelate}
        min={0}
        max={20}
        step={1}
        onChange={(v) => setParam('pixelate', v)}
      />
      <Slider
        label="Character size"
        value={charSize}
        min={1}
        max={12}
        step={1}
        // Grid cells per character. Raising it coarsens the grid and enlarges the glyph by
        // the same factor, so the output stays the same size but shows fewer, bigger,
        // more legible characters.
        format={(v) => (v === 1 ? '1× (finest)' : `${v}× — 1 char per ${v}×${v}`)}
        onChange={(v) => setParam('charSize', v)}
      />
    </Panel>
  );
}
