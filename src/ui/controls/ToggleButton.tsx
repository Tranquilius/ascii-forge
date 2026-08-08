interface ToggleButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
  title?: string;
}

export function ToggleButton({ label, active, onClick, title }: ToggleButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
        active
          ? 'bg-[var(--accent-dim)] border-[var(--accent)] text-[var(--text)]'
          : 'bg-transparent border-[var(--panel-border)] text-[var(--text-dim)] hover:text-[var(--text)]'
      }`}
    >
      {label}
    </button>
  );
}
