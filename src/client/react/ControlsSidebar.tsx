import type { ReactNode } from 'react';

// Dismissable right-hand sidebar hosting a bench's control panel (Holo Cards,
// Procedural Landscape, …). Mirrors the left Sidebar's collapse behaviour but
// slides in from the right. Rendered only when the active bench has controls.
export function ControlsSidebar({
  collapsed,
  onToggle,
  children,
}: {
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  if (collapsed) {
    return (
      <button
        type="button"
        className="controls-open"
        onClick={onToggle}
        title="Show controls"
        aria-label="Show controls"
      >
        ⚙
      </button>
    );
  }
  return (
    <aside className="controls-sidebar">
      <div className="controls-sidebar-head">
        <button
          type="button"
          className="sidebar-collapse"
          onClick={onToggle}
          title="Hide controls"
          aria-label="Hide controls"
        >
          ›
        </button>
        <span>Controls</span>
      </div>
      <div className="controls-sidebar-body">{children}</div>
    </aside>
  );
}
