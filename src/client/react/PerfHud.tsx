import type { BenchDef, RampState } from '../bench/types';

export function PerfHud({
  bench,
  stats,
  onRestart,
}: {
  bench: BenchDef;
  stats: RampState;
  onRestart: () => void;
}) {
  return (
    <div className="perf">
      <div className="perf-title">{bench.label}</div>
      <div className="perf-row">
        <span className="perf-fps">{stats.fps}</span> fps
      </div>
      <div className="perf-row">
        {stats.count.toLocaleString()} {bench.unit}
      </div>
      {stats.done ? (
        <div className="perf-row done">
          capacity {stats.capacity.toLocaleString()} {bench.unit}
        </div>
      ) : (
        <div className="perf-row ramp">ramping…</div>
      )}
      <button className="restart" onClick={onRestart}>
        ↻ restart
      </button>
    </div>
  );
}
