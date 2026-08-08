import { useAppStore } from '@/store';
import { Panel } from '@/ui/Panel';
import { Slider } from '@/ui/controls/Slider';

export function TonePanel() {
  const { brightness, contrast, gamma } = useAppStore((s) => s.params);
  const setParam = useAppStore((s) => s.setParam);

  return (
    <Panel title="Tone">
      <Slider
        label="Brightness"
        value={brightness}
        min={-100}
        max={100}
        step={1}
        onChange={(v) => setParam('brightness', v)}
      />
      <Slider
        label="Contrast"
        value={contrast}
        min={-100}
        max={100}
        step={1}
        onChange={(v) => setParam('contrast', v)}
      />
      <Slider
        label="Gamma"
        value={gamma}
        min={0.2}
        max={3}
        step={0.01}
        format={(v) => v.toFixed(2)}
        onChange={(v) => setParam('gamma', v)}
      />
    </Panel>
  );
}
