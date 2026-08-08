import type { ReactNode } from 'react';

interface PanelProps {
  title: string;
  children: ReactNode;
}

export function Panel({ title, children }: PanelProps) {
  return (
    <section className="flex flex-col gap-3 border-b border-[var(--panel-border)] px-4 py-4 last:border-b-0">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-dim)]">{title}</h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}
