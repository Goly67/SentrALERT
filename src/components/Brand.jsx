import { useEffect, useState } from 'react';
import '../nav.css';

// The wide SentrALERT logo: src/assets/sentralert-new-hori-trim.png, a copy of
// sentralert-new-hori.png with its empty transparent margins cut off.
// Until then the shield fallback below renders, so the build never breaks.
const found = import.meta.glob('../assets/sentralert-new-hori-trim.{png,svg,webp,jpg}', {
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
  { key: 'analytics', label: 'Analytics', icon: I(<><path d="M4 19V5M4 19h16" /><path d="m7 15 4-4 3 2 5-6" /><circle cx="19" cy="7" r="1" /></>) },
  { key: 'arcgis', label: 'ArcGIS', icon: I(<><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /></>) },
  { key: 'team', label: 'Team', icon: I(<><circle cx="9" cy="8" r="3" /><path d="M3 20v-1a6 6 0 0 1 12 0v1M16 5.5a3 3 0 0 1 0 5.8M18 14a5 5 0 0 1 3 4.6V20" /></>) },
  { key: 'about', label: 'About', icon: I(<><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>) },
];

const NAV_STORAGE_KEY = 'sentralert-nav-collapsed';

function readCollapsed() {
  try { return window.localStorage.getItem(NAV_STORAGE_KEY) === '1'; } catch { return false; }
}
function writeCollapsed(value) {
  try { window.localStorage.setItem(NAV_STORAGE_KEY, value ? '1' : '0'); } catch { /* private mode */ }
}

/**
 * Bottom navigation. Can be folded away into a single launcher button (the
 * choice is remembered on this device). `onReport` adds a "Report fire"
 * button in the middle of the bar (crowd-reporting site only).
 * `alertCount` puts a live badge on the launcher while it is folded.
 */
// Folding the bar away is a phone / small-tablet feature; computers always
// get the full bar.
const MOBILE_NAV_QUERY = '(max-width: 900px)';

function useIsMobileNav() {
  const [mobile, setMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_NAV_QUERY).matches
  );
  useEffect(() => {
    const query = window.matchMedia(MOBILE_NAV_QUERY);
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return mobile;
}

export function RailNav({ active, onChange, onReport, alertCount = 0 }) {
  const mobile = useIsMobileNav();
  const [folded, setCollapsed] = useState(readCollapsed);
  const collapsed = mobile && folded;
  const toggle = (next) => {
    setCollapsed(next);
    writeCollapsed(next);
  };

  if (collapsed) {
    return (
      <nav className="sa-nav is-collapsed" aria-label="SentraLERT sections" style={{ gridTemplateColumns: 'max-content' }}>
        <button
          type="button"
          className="sa-nav-launcher"
          onClick={() => toggle(false)}
          aria-label={alertCount > 0 ? `Open menu, ${alertCount} active alert${alertCount === 1 ? '' : 's'}` : 'Open menu'}
          aria-expanded="false"
          title="Open menu"
        >
          <span className="sa-nav-launcher-ring" aria-hidden="true" />
          <MenuIcon />
          <span className="sa-nav-launcher-label">Menu</span>
          <svg className="sa-nav-launcher-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m6 15 6-6 6 6" />
          </svg>
          {alertCount > 0 && <span className="sa-nav-launcher-badge" aria-hidden="true">{alertCount > 9 ? '9+' : alertCount}</span>}
        </button>
      </nav>
    );
  }

  const tab = (t, index) => (
    <button
      key={t.key}
      type="button"
      className={active === t.key ? 'is-active' : ''}
      style={{ '--n': index }}
      aria-current={active === t.key ? 'page' : undefined}
      aria-label={t.label}
      title={t.label}
      onClick={() => onChange(t.key)}
    >
      {t.icon}
    </button>
  );
  // With a report button: hide + 3 tabs | REPORT | 4 tabs, so it sits dead centre.
  const split = onReport ? 3 : TABS.length;
  const items = [
    ...(mobile ? [<button
      key="hide"
      type="button"
      className="sa-nav-hide"
      style={{ '--n': 0 }}
      onClick={() => toggle(true)}
      aria-label="Hide menu"
      aria-expanded="true"
      title="Hide menu"
    >
      <HideIcon />
    </button>] : []),
    ...TABS.slice(0, split).map((t, i) => tab(t, i + 1)),
    ...(onReport ? [
      <button
        key="report"
        type="button"
        className={`sa-nav-report ${active === 'report' ? 'is-current' : ''}`}
        style={{ '--n': split + 1 }}
        onClick={onReport}
        aria-label="Report a fire"
        title="Report a fire"
      >
        <span className="sa-nav-report-ring" aria-hidden="true" />
        <span className="sa-nav-report-ring" aria-hidden="true" />
        <ReportIcon />
        <span className="sa-nav-report-plus" aria-hidden="true">
          <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M6 2v8M2 6h8" />
          </svg>
        </span>
      </button>,
    ] : []),
    ...TABS.slice(split).map((t, i) => tab(t, split + (onReport ? 2 : 1) + i)),
  ];

  return (
    <nav
      className={`sa-nav is-expanded ${onReport ? 'has-report' : ''}`}
      aria-label="SentraLERT sections"
      style={{ gridTemplateColumns: `repeat(${items.length}, auto)` }}
    >
      {items}
    </nav>
  );
}

/* The folded menu: the familiar three-line "menu" icon. On hover the lines
   shift, inviting a tap. */
function MenuIcon() {
  return (
    <svg className="sa-nav-launcher-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <path className="l1" d="M4 6.5h16" />
      <path className="l2" d="M4 12h16" />
      <path className="l3" d="M4 17.5h16" />
    </svg>
  );
}
function HideIcon() {
  return I(<><path d="m7 9 5 5 5-5" /><path d="M6 18h12" /></>);
}
/* The same flame as the app's fire alarms: white outer flame, amber core. */
function ReportIcon() {
  return (
    <svg className="sa-nav-report-flame" viewBox="0 0 24 24" width="32" height="32" aria-hidden="true">
      <path fill="#fff" d="M12 2.5c.6 3.1-1 5-2.6 6.8C7.8 11.1 6 13 6 15.9A6 6 0 0 0 12 22a6 6 0 0 0 6-6.1c0-2.4-1.1-4.3-2.2-5.6-.3 1.4-1 2.5-2.1 3 .5-3.9-.8-7.6-1.7-10.8Z" />
      <path fill="#FFB020" d="M12 22a3 3 0 0 1-3-3.1c0-1.9 1.6-2.8 2.4-4.4.9 1.3 3.6 2.5 3.6 4.4A3 3 0 0 1 12 22Z" />
    </svg>
  );
}
