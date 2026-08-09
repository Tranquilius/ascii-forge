import { useAppStore } from '@/store';
import type { MixMode } from '@/engine/types';
import { Panel } from '@/ui/Panel';
import { SegmentedControl } from '@/ui/controls/SegmentedControl';
import { ColorField } from '@/ui/controls/ColorField';

// Original first, and the default: keeping each cell's true source colour is the result
// people expect from "convert this image", and the flatter looks are the deliberate choice.
const MIX_OPTIONS: { value: MixMode; label: string; title: string }[] = [
  { value: 'original', label: 'Original', title: "Each character keeps its source pixel's exact color" },
  { value: 'multi', label: 'Multi', title: 'Source color reduced to a flat 64-color palette' },
  { value: 'mono', label: 'Mono', title: 'One color for every character' },
];

export function MixPanel() {
  const { mixMode, monoColor } = useAppStore((s) => s.params);
  const setParam = useAppStore((s) => s.setParam);

  return (
    <Panel title="Glyph color">
      <SegmentedControl value={mixMode} options={MIX_OPTIONS} onChange={(v) => setParam('mixMode', v)} />
      <ColorField
        label="Mono color"
        value={monoColor}
        disabled={mixMode !== 'mono'}
        onChange={(v) => setParam('monoColor', v)}
      />
    </Panel>
  );
}
