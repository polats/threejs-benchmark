import { useLandscapeStore, SPEEDS, TOGGLES } from '../bench/landscapeStore';

// Real-DOM "Debug Toolkit" for the Procedural Landscape bench, rendered in the
// sidebar (outside the R3F canvas, so it never fights OrbitControls). Reuses the
// holo-panel styles for a consistent look.
export function LandscapeControlsPanel() {
  const seed = useLandscapeStore((s) => s.seed);
  const speed = useLandscapeStore((s) => s.speed);
  const progress = useLandscapeStore((s) => s.progress);
  const gtao = useLandscapeStore((s) => s.gtao);
  const shadows = useLandscapeStore((s) => s.shadows);
  const gradient = useLandscapeStore((s) => s.gradient);
  const clouds = useLandscapeStore((s) => s.clouds);
  const shadowTint = useLandscapeStore((s) => s.shadowTint);
  const gi = useLandscapeStore((s) => s.gi);
  const godrays = useLandscapeStore((s) => s.godrays);
  const setSpeed = useLandscapeStore((s) => s.setSpeed);
  const setSeed = useLandscapeStore((s) => s.setSeed);
  const regenerate = useLandscapeStore((s) => s.regenerate);
  const toggle = useLandscapeStore((s) => s.toggle);

  const flags = { gtao, shadows, gradient, clouds, shadowTint, gi, godrays };

  return (
    <section className="holo-panel">
      <h2>Landscape Generator</h2>

      <label className="hp-label">
        Seed <em style={{ marginLeft: 6, opacity: 0.7 }}>· {progress} tiles</em>
      </label>
      <div className="holo-row">
        <button type="button" className="hp-chip" onClick={() => setSeed((seed - 1) >>> 0)}>
          ←
        </button>
        <input
          type="number"
          className="hp-seed"
          value={seed}
          onChange={(e) => setSeed(parseInt(e.target.value || '0', 10))}
          style={{ width: 120, textAlign: 'center' }}
        />
        <button type="button" className="hp-chip" onClick={() => setSeed((seed + 1) >>> 0)}>
          →
        </button>
      </div>

      <label className="hp-label">Build speed</label>
      <div className="holo-row">
        {SPEEDS.map((s) => (
          <button
            key={s.key}
            type="button"
            className={speed === s.key ? 'hp-chip on' : 'hp-chip'}
            onClick={() => setSpeed(s.key)}
          >
            {s.label}
          </button>
        ))}
        <button type="button" className="hp-chip" onClick={regenerate}>
          ⟳ Regenerate
        </button>
      </div>

      <label className="hp-label">Render</label>
      <div className="holo-row">
        {TOGGLES.map((t) => (
          <button
            key={t.key}
            type="button"
            className={flags[t.key] ? 'hp-chip on' : 'hp-chip'}
            onClick={() => toggle(t.key)}
          >
            {t.label} {flags[t.key] ? 'ON' : 'OFF'}
          </button>
        ))}
      </div>
    </section>
  );
}
