import { useAppStore } from '@/store';
import type { BackgroundMode, BlendMode } from '@/engine/types';
import { Panel } from '@/ui/Panel';
import { SegmentedControl } from '@/ui/controls/SegmentedControl';
import { ColorField } from '@/ui/controls/ColorField';
import { Slider } from '@/ui/controls/Slider';
import { ToggleButton } from '@/ui/controls/ToggleButton';

const REMOVAL_MODE_OPTIONS = [
  { value: 'edges', label: 'Edges only', title: 'Only background connected to the frame border' },
  { value: 'all', label: 'All matching', title: 'Every cell matching the key colour, anywhere' },
];

const BG_MODE_OPTIONS: { value: BackgroundMode; label: string }[] = [
  { value: 'transparent', label: 'Transparent' },
  { value: 'solid', label: 'Solid' },
];

const BLEND_MODE_OPTIONS: { value: BlendMode; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'darken', label: 'Darken' },
  { value: 'lighten', label: 'Lighten' },
  { value: 'color-dodge', label: 'Color Dodge' },
  { value: 'color-burn', label: 'Color Burn' },
  { value: 'soft-light', label: 'Soft Light' },
  { value: 'hard-light', label: 'Hard Light' },
];

export function BackgroundPanel() {
  const { bgMode, bgColor, blendMode, bgRemove, bgKeyColor, bgTolerance, bgContiguous, bgFeather } =
    useAppStore((s) => s.params);
  const setParam = useAppStore((s) => s.setParam);
  const setParams = useAppStore((s) => s.setParams);
  const pickingKeyColor = useAppStore((s) => s.pickingKeyColor);
  const setPickingKeyColor = useAppStore((s) => s.setPickingKeyColor);

  return (
    <Panel title="Background">
      <div className="flex flex-col gap-2 rounded-md border border-[var(--panel-border)] p-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-[var(--text)]">Remove background</span>
          <ToggleButton
            label={bgRemove ? 'On' : 'Off'}
            active={bgRemove}
            onClick={() => setParam('bgRemove', !bgRemove)}
            title="Cut the background out, leaving those characters blank"
          />
        </div>

        {bgRemove && (
          <>
            <SegmentedControl
              value={bgContiguous ? 'edges' : 'all'}
              options={REMOVAL_MODE_OPTIONS}
              onChange={(v) => setParam('bgContiguous', v === 'edges')}
            />

            <ColorField
              label={bgKeyColor ? 'Key colour' : 'Key colour · auto-detected'}
              value={bgKeyColor || '#000000'}
              onChange={(v) => setParam('bgKeyColor', v)}
            />
            {!bgKeyColor && (
              // Without this the swatch reads as "black is the key colour", when in Auto mode
              // the field is inert and the real key comes from the image border.
              <span className="text-xs text-[var(--text-dim)]">
                Taken from the edge of the image. Pick a colour to override.
              </span>
            )}
            <div className="flex gap-1.5">
              <ToggleButton
                label="Auto"
                active={bgKeyColor === ''}
                onClick={() => setParams({ bgKeyColor: '' })}
                title="Detect the background colour from the edge of the image"
              />
              <ToggleButton
                label={pickingKeyColor ? 'Click image…' : 'Pick'}
                active={pickingKeyColor}
                onClick={() => setPickingKeyColor(!pickingKeyColor)}
                title="Click a pixel in the preview to use its colour"
              />
            </div>

            <Slider
              label="Tolerance"
              value={bgTolerance}
              min={0}
              max={100}
              step={1}
              onChange={(v) => setParam('bgTolerance', v)}
            />
            <Slider
              label="Feather"
              value={bgFeather}
              min={0}
              max={3}
              step={1}
              format={(v) => (v === 0 ? 'Hard' : `${v} cell${v > 1 ? 's' : ''}`)}
              onChange={(v) => setParam('bgFeather', v)}
            />
            {bgMode === 'solid' && (
              <span className="text-xs text-[var(--text-dim)]">
                Removed areas show the solid colour below. Switch to Transparent to export a cutout.
              </span>
            )}
          </>
        )}
      </div>

      <SegmentedControl value={bgMode} options={BG_MODE_OPTIONS} onChange={(v) => setParam('bgMode', v)} />
      <ColorField
        label="Color"
        value={bgColor}
        disabled={bgMode !== 'solid'}
        onChange={(v) => setParam('bgColor', v)}
      />
      <SegmentedControl
        label="Blend mode"
        value={blendMode}
        options={BLEND_MODE_OPTIONS}
        onChange={(v) => setParam('blendMode', v)}
      />
    </Panel>
  );
}
