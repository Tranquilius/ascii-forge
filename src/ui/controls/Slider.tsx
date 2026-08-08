interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
}

export function Slider({ label, value, min, max, step = 1, onChange, format }: SliderProps) {
  const display = format ? format(value) : String(value);
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center justify-between text-xs text-[var(--text-dim)]">
        <span>{label}</span>
        <span className="font-mono text-[var(--text)]">{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
