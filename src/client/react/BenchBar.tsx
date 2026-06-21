import type { BenchDef } from '../bench/types';

export function BenchBar({
  benches,
  activeId,
  onSelect,
}: {
  benches: BenchDef[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="bench-bar">
      {benches.map((b) => (
        <button
          key={b.id}
          className={b.id === activeId ? 'chip active' : 'chip'}
          onClick={() => onSelect(b.id)}
          title={b.blurb}
        >
          {b.label}
        </button>
      ))}
    </div>
  );
}
