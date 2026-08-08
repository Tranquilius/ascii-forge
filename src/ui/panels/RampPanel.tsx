import { useAppStore } from '@/store';
import { RAMP_PRESET_HINTS, RAMP_PRESET_LABELS, resolveRamp } from '@/engine/ramps';
import { LANGUAGE_SETS, findLanguageSet } from '@/engine/languages';
import { RENDER_FONT_FAMILY } from '@/engine/pipeline';
import type { RampPreset } from '@/engine/types';
import { Panel } from '@/ui/Panel';
import { SegmentedControl } from '@/ui/controls/SegmentedControl';
import { Slider } from '@/ui/controls/Slider';
import { ToggleButton } from '@/ui/controls/ToggleButton';

const RAMP_OPTIONS = (
  ['standard', 'blocks', 'detailed', 'detailedPlus', 'minimal', 'custom', 'language'] as RampPreset[]
).map((value) => ({
  value,
  label: RAMP_PRESET_LABELS[value],
  title: RAMP_PRESET_HINTS[value],
}));

export function RampPanel() {
  const { ramp, customRamp, languageId, levels, densityBias, invert } = useAppStore((s) => s.params);
  const randomizeBias = useAppStore((s) => s.randomizeBias);
  const setParam = useAppStore((s) => s.setParam);
  const setParams = useAppStore((s) => s.setParams);
  const toggleInvert = useAppStore((s) => s.toggleInvert);
  const setRandomizeBias = useAppStore((s) => s.setRandomizeBias);

  // The field always shows the glyphs actually in use, whether they came from a preset
  // or from a hand-edited string — so the ramp reads as one live value rather than a
  // mode you have to switch into before you can see anything.
  const activeRamp =
    ramp === 'custom'
      ? customRamp
      : resolveRamp(ramp, '', RENDER_FONT_FAMILY, languageId).join('');
  const fullRamp = resolveRamp(ramp, customRamp, RENDER_FONT_FAMILY, languageId);
  const glyphCount = fullRamp.length;
  const activeLanguage = findLanguageSet(languageId);
  // levels 0 means "use them all"; the slider reads as the count actually in play.
  const activeLevels = levels >= 2 && levels < glyphCount ? levels : glyphCount;

  /** Typing anywhere in the field takes over the ramp, seeding from what's on screen. */
  function editRamp(next: string) {
    setParams({ ramp: 'custom', customRamp: next });
  }

  function selectPreset(next: RampPreset) {
    // Switching to Custom used to leave the field empty, which silently fell back to
    // Standard. Seed it with the glyphs already on screen so it's an edit, not a reset.
    if (next === 'custom') {
      setParams({ ramp: 'custom', customRamp: customRamp || activeRamp });
      return;
    }
    setParam('ramp', next);
  }

  return (
    <Panel title="Character ramp">
      <SegmentedControl value={ramp} options={RAMP_OPTIONS} onChange={selectPreset} />

      {ramp === 'language' && (
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-[var(--text-dim)]">Alphabet</span>
          <select
            value={languageId}
            onChange={(e) => setParam('languageId', e.target.value)}
            className="w-full rounded-md border border-[var(--panel-border)] bg-[var(--panel)] px-2 py-1.5 text-xs text-[var(--text)]"
          >
            {LANGUAGE_SETS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
          {activeLanguage?.note && (
            <span className="text-xs text-[var(--text-dim)]">{activeLanguage.note}</span>
          )}
        </label>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="flex items-center justify-between text-xs text-[var(--text-dim)]">
          <span>Glyphs · dark → light</span>
          <span className="font-mono text-[var(--text)]">{glyphCount}</span>
        </span>
        <input
          type="text"
          value={activeRamp}
          onChange={(e) => editRamp(e.target.value)}
          placeholder="e.g.  .:-=+*#%@"
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          className="w-full rounded-md border border-[var(--panel-border)] bg-transparent px-2 py-1.5 font-mono text-xs text-[var(--text)]"
        />
      </label>

      <Slider
        label="Levels"
        value={activeLevels}
        min={2}
        max={glyphCount}
        step={1}
        // At the top of the range the full ramp is in use, which is worth saying plainly
        // rather than showing a number the user has to compare against the glyph count.
        format={(v) => (v >= glyphCount ? `Full (${glyphCount})` : String(v))}
        onChange={(v) => setParam('levels', v >= glyphCount ? 0 : v)}
      />

      <Slider
        label="Density bias"
        value={densityBias}
        min={0.2}
        max={3}
        step={0.01}
        format={(v) => v.toFixed(2)}
        onChange={(v) => setParam('densityBias', v)}
      />
      <div className="flex gap-1.5">
        <ToggleButton
          label="Random"
          active={randomizeBias}
          onClick={() => setRandomizeBias(!randomizeBias)}
          title="Generate rerolls density bias to a random value"
        />
        <ToggleButton label="Invert" active={invert} onClick={toggleInvert} />
      </div>
    </Panel>
  );
}
