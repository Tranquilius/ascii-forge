interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Optional hover hint, for options whose label alone doesn't explain the difference. */
  title?: string;
}

interface SegmentedControlProps<T extends string> {
  label?: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <span className="text-xs text-[var(--text-dim)]">{label}</span>}
      <div className="flex flex-wrap gap-1">
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              aria-pressed={active}
              title={opt.title}
              className={`rounded-md px-2.5 py-1 text-xs transition-colors border ${
                active
                  ? 'bg-[var(--accent-dim)] border-[var(--accent)] text-[var(--text)]'
                  : 'bg-transparent border-[var(--panel-border)] text-[var(--text-dim)] hover:text-[var(--text)]'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
