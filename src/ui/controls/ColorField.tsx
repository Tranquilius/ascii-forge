interface ColorFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function ColorField({ label, value, onChange, disabled }: ColorFieldProps) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs text-[var(--text-dim)]">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={HEX_RE.test(value) ? value : '#000000'}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-9 cursor-pointer rounded border border-[var(--panel-border)] bg-transparent p-0.5 disabled:cursor-not-allowed disabled:opacity-40"
        />
        <input
          type="text"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          className="w-full rounded-md border border-[var(--panel-border)] bg-transparent px-2 py-1 font-mono text-xs text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-40"
        />
      </div>
    </label>
  );
}
