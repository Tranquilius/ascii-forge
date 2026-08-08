import { useAppStore } from '@/store';
import type { MixMode } from '@/engine/types';
import { Panel } from '@/ui/Panel';
import { SegmentedControl } from '@/ui/controls/SegmentedControl';
import { ColorField } from '@/ui/controls/ColorField';

const MIX_OPTIONS: { value: MixMode; label: string }[] = [
  { value: 'mono', label: 'Mono' },
  { value: 'multi', label: 'Multi' },
  { value: 'original', label: 'Original' },
];

export function MixPanel() {
  const { mixMode, monoColor } = useAppStore((s) => s.params);
  const setParam = useAppStore((s) => s.setParam);

  return (
    <Panel title="Mix mode">
      <SegmentedControl value={mixMode} options={MIX_OPTIONS} onChange={(v) => setParam('mixMode', v)} />
      <ColorField
        label="Color"
        value={monoColor}
        disabled={mixMode !== 'mono'}
        onChange={(v) => setParam('monoColor', v)}
      />
    </Panel>
  );
}
