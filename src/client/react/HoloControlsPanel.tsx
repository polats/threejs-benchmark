import { useEffect } from 'react';
import { useHoloStore, LAYERS, SLIDERS, PRESETS, CARD_VIEWS } from '../bench/holoStore';

// Real-DOM control panel for the Holo Cards bench, rendered in the sidebar (outside
// the R3F canvas). Big touch targets; never conflicts with OrbitControls.
export function HoloControlsPanel() {
  const { tune, layers, preset, cardSlug, view, mode, cards, setTune, toggleLayer, setPreset, setCardSlug, setView, setMode, setCards } =
    useHoloStore();

  useEffect(() => {
    fetch('cards/manifest.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (Array.isArray(j) && j.length) setCards(j);
      })
      .catch(() => {});
  }, [setCards]);

  return (
    <section className="holo-panel">
      <h2>Holo Cards</h2>

      <div className="holo-row">
        <button type="button" className={mode === 'hero' ? 'hp-chip on' : 'hp-chip'} onClick={() => setMode('hero')}>
          ◆ Hero
        </button>
        <button type="button" className={mode === 'grid' ? 'hp-chip on' : 'hp-chip'} onClick={() => setMode('grid')}>
          ▦ Grid
        </button>
      </div>

      {mode === 'hero' ? (
        <>
          <label className="hp-label">Card</label>
          <div className="holo-row">
            <button type="button" className={!cardSlug ? 'hp-chip on' : 'hp-chip'} onClick={() => setCardSlug(null)}>
              Procedural
            </button>
            {cards.map((c) => (
              <button key={c.slug} type="button" className={cardSlug === c.slug ? 'hp-chip on' : 'hp-chip'} onClick={() => setCardSlug(c.slug)}>
                {c.name}
              </button>
            ))}
          </div>

          {cardSlug ? (
            <>
              <label className="hp-label">View stage</label>
              <div className="holo-row">
                {CARD_VIEWS.map((v) => (
                  <button key={v} type="button" className={view === v ? 'hp-chip on' : 'hp-chip'} onClick={() => setView(v)}>
                    {v === '3d' ? '3D' : v}
                  </button>
                ))}
              </div>
            </>
          ) : null}

          <label className="hp-label">Layers</label>
          <div className="holo-row">
            {LAYERS.map((l) => (
              <button key={l.key} type="button" className={layers[l.key] ? 'hp-chip on' : 'hp-chip'} onClick={() => toggleLayer(l.key)}>
                {l.label}
              </button>
            ))}
          </div>

          {!cardSlug ? (
            <>
              <label className="hp-label">Preset</label>
              <div className="holo-row">
                {PRESETS.map((p, i) => (
                  <button key={p.name} type="button" className={i === preset ? 'hp-chip on' : 'hp-chip'} onClick={() => setPreset(i)}>
                    {p.name}
                  </button>
                ))}
              </div>
            </>
          ) : null}

          <label className="hp-label">Material</label>
          <div className="holo-sliders2">
            {SLIDERS.map((s) => (
              <div key={s.key} className="hp-slider">
                <span>{s.label}</span>
                <input
                  type="range"
                  min={s.min}
                  max={s.max}
                  step={s.step}
                  value={tune[s.key]}
                  onChange={(e) => setTune({ [s.key]: parseFloat(e.target.value) })}
                />
                <em>{tune[s.key].toFixed(2)}</em>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="hp-note">Grid: ramping holo cards. Switch to Hero to inspect + tune a card.</p>
      )}
    </section>
  );
}
