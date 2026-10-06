// Drop the logo at src/assets/sentralert-logo.png (svg/webp/jpg also work).
// Until then the shield fallback below renders, so the build never breaks.
const found = import.meta.glob('../assets/sentralert-hori.{png,svg,webp,jpg}', {
  eager: true,
  import: 'default',
});
export const LOGO_SRC = Object.values(found)[0] ?? null;

function ShieldFallback() {
  return (
    <svg viewBox="0 0 48 56" width="44" height="52" aria-hidden="true">
      <path d="M24 2 4 9v17c0 13 8.5 22 20 28 11.5-6 20-15 20-28V9L24 2Z" fill="#0E2240" />
      <path d="M24 13c2 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3 2-4 .5 1.5 1.5 2 2.500 2 1-2 .5-5.500.5-9Z" fill="#2F6CFF" />
    </svg>
  );
}

export function BrandHeader({ incidents, highestAlarm }) {
  return (
    <header className="sa-head">
      {LOGO_SRC ? (
        <div className="sa-logo-frame">
          <img className="sa-logo" src={LOGO_SRC} alt="SentraLERT — multi-hazard public safety monitoring" draggable="false" />
        </div>
      ) : (
        <div className="sa-fallback">
          <ShieldFallback />
          <div>
            <h1>SENTRA<em>L</em>ERT</h1>
            <p>Multi-hazard public safety monitoring</p>
          </div>
        </div>
      )}
      <div className="sa-pills">
        <span className={`sa-pill ${incidents.length ? 'is-live' : 'is-ok'}`}>
          <i />{incidents.length ? `${incidents.length} active incident${incidents.length === 1 ? '' : 's'}` : 'All clear'}
        </span>
        {highestAlarm.level >= 1 && (
          <span className="sa-pill sa-pill--alarm" style={{ '--alarm': highestAlarm.color }}>
            Highest: {highestAlarm.label}
          </span>
        )}
      </div>
    </header>
  );
}

const I = (d) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);
const TABS = [
  { key: 'alerts', label: 'Alerts', icon: I(<><path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" /><path d="M10 19a2 2 0 0 0 4 0" /></>) },
  { key: 'safety', label: 'Safety', icon: I(<><path d="M12 3 4 6v6c0 4.5 3.2 7.8 8 9 4.8-1.200 8-4.5 8-9V6l-8-3Z" /><path d="M12 9v6M9 12h6" /></>) },
  { key: 'analytics', label: 'Analytics', icon: I(<><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>) },
  { key: 'arcgis', label: 'ArcGIS', icon: I(<><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /></>) },
  { key: 'about', label: 'About', icon: I(<><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>) },
];

export function RailNav({ active, onChange }) {
  return (
    <nav className="sa-nav" aria-label="SentraLERT sections">
      {TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          className={active === t.key ? 'is-active' : ''}
          aria-current={active === t.key ? 'page' : undefined}
          aria-label={t.label}
          title={t.label}
          onClick={() => onChange(t.key)}
        >
          {t.icon}
        </button>
      ))}
    </nav>
  );
}