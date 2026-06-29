import { REVISION } from 'three';
import type { BenchDef, BenchGroup, RampState } from '../bench/types';
import type { ExternalShowcase } from '../externalShowcases';

const GROUP_LABELS: Record<BenchGroup, string> = {
  render: 'Rendering',
  visual: 'Visual',
  physics: 'Physics',
  simulation: 'Simulation',
  showcase: 'Showcase',
};
const GROUP_ORDER: BenchGroup[] = ['render', 'visual', 'physics', 'simulation', 'showcase'];

// Dismissable left sidebar (woid-style): grouped scene selection + live run status.
export function Sidebar({
  benches,
  active,
  stats,
  onSelect,
  onRestart,
  onToggle,
  externalShowcases,
  activeExternal,
}: {
  benches: BenchDef[];
  active: BenchDef;
  stats: RampState;
  onSelect: (id: string) => void;
  onRestart: () => void;
  onToggle: () => void;
  externalShowcases: ExternalShowcase[];
  activeExternal?: ExternalShowcase | undefined;
}) {
  const groups = GROUP_ORDER.map((g) => ({
    g,
    items: benches.filter((b) => b.group === g),
  })).filter((x) => x.items.length > 0);

  return (
    <aside className="sidebar">
      <div className="sidebar-title">
        <div className="sidebar-title-row">
          <strong>three.js bench</strong>
          <span className="sidebar-three-ver" title={`three.js r${REVISION}`}>
            r{REVISION}
          </span>
          <button
            type="button"
            className="sidebar-collapse"
            onClick={onToggle}
            title="Hide sidebar"
            aria-label="Hide sidebar"
          >
            ‹
          </button>
        </div>
        <p>WebGL stress tests — ramp until FPS drops</p>
      </div>

      <nav className="sidebar-nav">
        {groups.map(({ g, items }) => (
          <section key={g} className="sidebar-section">
            <h2>{GROUP_LABELS[g]}</h2>
            <ul>
              {items.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    className={!activeExternal && b.id === active.id ? 'sidebar-link active' : 'sidebar-link'}
                    onClick={() => onSelect(b.id)}
                    title={b.blurb}
                  >
                    {b.label}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {externalShowcases.length > 0 ? (
          <section className="sidebar-section external-showcase-section">
            <h2>External Showcase</h2>
            <ul>
              {externalShowcases.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={item.id === activeExternal?.id ? 'sidebar-link active' : 'sidebar-link'}
                    onClick={() => onSelect(item.id)}
                    title={item.blurb}
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </nav>

      <div className="sidebar-status">
        <div className="status-head">{activeExternal?.label ?? active.label}</div>
        {activeExternal ? (
          <>
            <div className="status-row ramp">local external capture</div>
            <a className="showcase-source" href={activeExternal.sourceUrl} target="_blank" rel="noreferrer">
              view source ↗
            </a>
          </>
        ) : (
          <>
            <div className="status-row">
              <span className="status-fps">{stats.fps}</span> fps
            </div>
            {active.showcase ? (
              <div className="status-row ramp">
                {stats.count > 0
                  ? `${stats.count.toLocaleString()} ${active.unit} · showcase`
                  : 'showcase scene'}
              </div>
            ) : (
              <>
                <div className="status-row">
                  {stats.count.toLocaleString()} {active.unit}
                </div>
                <div className={stats.done ? 'status-row done' : 'status-row ramp'}>
                  {stats.done ? `capacity ${stats.capacity.toLocaleString()}` : 'ramping…'}
                </div>
              </>
            )}
          </>
        )}
        <button type="button" className="sidebar-action" onClick={onRestart}>
          ↻ {activeExternal ? 'reload showcase' : 'restart run'}
        </button>
      </div>
    </aside>
  );
}
