import { useAppStore } from '@/store';
import { FULL_TAB_ID } from '@/store';

/**
 * Browser-style tab strip over the preview: one tab per open view of the source.
 *
 * The first tab is always the whole image; each crop opens another. This is what makes
 * cropping non-destructive — the full frame is always one click away, and several framings
 * of the same source can be compared without re-drawing them.
 *
 * Hidden entirely while only the full view exists, so a tab strip never appears until it
 * has something to switch between.
 */
export function CropTabs() {
  const tabs = useAppStore((s) => s.tabs);
  const activeTabId = useAppStore((s) => s.activeTabId);
  const selectTab = useAppStore((s) => s.selectTab);
  const closeTab = useAppStore((s) => s.closeTab);

  if (tabs.length <= 1) return null;

  return (
    <div
      role="tablist"
      aria-label="Cropped views"
      className="flex flex-wrap items-end gap-1 border-b border-[var(--panel-border)] px-1"
    >
      {tabs.map((tab) => {
        const active = tab.id === activeTabId;
        const closable = tab.id !== FULL_TAB_ID;
        const crop = tab.params.crop;
        const pct = crop
          ? `${Math.round(crop.w * 100)}×${Math.round(crop.h * 100)}%`
          : 'whole image';

        return (
          <div
            key={tab.id}
            className={`group flex items-center gap-1 rounded-t-md border border-b-0 px-2.5 py-1.5 text-xs transition-colors ${
              active
                ? 'border-[var(--panel-border)] bg-[var(--panel)] text-[var(--text)]'
                : 'border-transparent text-[var(--text-dim)] hover:text-[var(--text)]'
            }`}
          >
            <button
              type="button"
              role="tab"
              aria-selected={active}
              title={`${tab.label} — ${pct} of the source`}
              onClick={() => selectTab(tab.id)}
              className="max-w-40 truncate"
            >
              {tab.label}
            </button>

            {closable && (
              <button
                type="button"
                aria-label={`Close ${tab.label}`}
                title={`Close ${tab.label}`}
                onClick={(e) => {
                  // Without this the click also lands on the tab button behind it, which
                  // would select the tab a moment before removing it.
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-[var(--text-dim)] hover:bg-[var(--panel-border)] hover:text-[var(--text)]"
              >
                ×
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
