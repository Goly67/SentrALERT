import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { enableAlarmSounds, playAlarmSound } from '../lib/alarmAudio.js';

const relative = (minutes) => {
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${Math.round(minutes)} min ago`;
  return `${(minutes / 60).toFixed(1)} h ago`;
};

/**
 * Bell + dropdown showing every incident currently on the map, and a toast
 * that pops in whenever one is new or has just jumped a level. Toasts are
 * derived by diffing against the previous render, not stored anywhere, so a
 * refresh just shows the current state with no backlog to replay.
 */
export default function NotificationCenter({ incidents, reports = [], onSelect, onOpenAdmin }) {
  const [open, setOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [soundPrompt, setSoundPrompt] = useState(() => {
    const preference = localStorage.getItem('fire-watch-sounds');
    return preference !== 'enabled' && preference !== 'dismissed';
  });
  const pendingSoundRef = useRef(null);
  const prevRef = useRef(new Map());
  const initializedRef = useRef(false);
  const lastPlayedAlarmRef = useRef(0);
  const rootRef = useRef(null);

  useEffect(() => {
    const prev = prevRef.current;
    const next = new Map();
    const fresh = [];

    for (const incident of incidents) {
      next.set(incident.id, incident.alarm.level);
      const before = prev.get(incident.id);
      if (before === undefined) {
    const SOUND_PREFERENCE_KEY = 'fire-watch-sounds';
        fresh.push({ incident, kind: 'new' });
      } else if (before !== undefined && incident.alarm.level > before) {
        fresh.push({ incident, kind: 'escalated', from: before });
      }
    }

    prevRef.current = next;
    const activeIds = new Set(incidents.map((incident) => incident.id));
    setToasts((current) => current.filter((toast) => activeIds.has(toast.incident.id)));
    const isInitialSnapshot = !initializedRef.current;
    initializedRef.current = true;
    if (fresh.length === 0) return;

    // Only the highest active alarm should win. If a fire is already sounding
    // at a higher level, lower-level incidents must not override it.
    if (!isInitialSnapshot) {
      const activePeakLevel = incidents.reduce((max, incident) => Math.max(max, incident.alarm.level), 0);
      if (activePeakLevel > 0 && activePeakLevel !== lastPlayedAlarmRef.current) {
        lastPlayedAlarmRef.current = activePeakLevel;
        playAlarmSound(activePeakLevel).then((played) => {
          if (!played) {
            pendingSoundRef.current = activePeakLevel;
            setSoundPrompt(true);
          }
        });
      }
      if (activePeakLevel === 0) {
        lastPlayedAlarmRef.current = 0;
      }
    }

    setToasts((current) => [
      ...current,
      ...fresh.map((f) => ({ ...f, key: `${f.incident.id}-${f.incident.alarm.level}-${Date.now()}` })),
    ]);
  }, [incidents]);

  useEffect(() => {
    if (toasts.length === 0) return undefined;
    const timers = toasts.map((t) =>
      setTimeout(() => setToasts((current) => current.filter((c) => c.key !== t.key)), 7000)
    );
    return () => timers.forEach(clearTimeout);
  }, [toasts]);

  // pointerdown (not mousedown) so tapping the map on a phone closes the
  // dropdown — Leaflet swallows the emulated mouse events on touch screens.
  useEffect(() => {
    if (!open) return undefined;
    function onClickAway(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onClickAway);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onClickAway);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const activeCount = incidents.filter((i) => i.alarm.level > 0).length;
  const adminPendingCount = reports.filter((report) => {
    const status = report?.status ?? 'pending';
    return status === 'pending';
  }).length;

  async function turnOnSounds() {
    const enabled = await enableAlarmSounds();
    if (!enabled) return;
    localStorage.setItem('fire-watch-sounds', 'enabled');
    setSoundPrompt(false);
    if (pendingSoundRef.current != null) {
      const level = pendingSoundRef.current;
      pendingSoundRef.current = null;
      playAlarmSound(level);
    }
  }

  return (
    <div className="notify-root" ref={rootRef}>
      {/* Buttons + dropdown live in one relatively-positioned row, so toasts
          arriving below never push the buttons around and the dropdown always
          opens directly under the bell. */}
      <div className="notify-tools">
        <button
          className="admin-button"
          onClick={() => {
            onOpenAdmin?.();
          }}
          type="button"
          aria-label={`Open admin panel${adminPendingCount > 0 ? ` (${adminPendingCount} pending reports)` : ''}`}
          title="Admin panel"
        >
          <AdminGlyph />
          {adminPendingCount > 0 && <span className="admin-button-badge">{adminPendingCount}</span>}
        </button>
        <button
          className={`bell ${activeCount > 0 ? 'has-alerts' : ''}`}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label="Fire notifications"
          title="Fire notifications"
          type="button"
        >
          <BellGlyph ringing={activeCount > 0} />
          {activeCount > 0 && <span className="bell-badge">{activeCount}</span>}
        </button>

        {open && (
          <div className="bell-dropdown">
            <div className="bell-dropdown-head">Where the fire is now</div>
            {incidents.length === 0 && <p className="muted small">Nothing reported.</p>}
            <ul>
              {incidents.map((incident) => (
                <li key={incident.id}>
                  <button
                    className="bell-row"
                    style={{ '--alarm': incident.alarm.color }}
                    onClick={() => {
                      onSelect(incident.id);
                      setOpen(false);
                    }}
                  >
                    <span className="alarm-chip">{incident.alarm.code}</span>
                    <span className="incident-meta">
                      <strong>{incident.barangayName}</strong>
                      <span className="muted small">
                        {relative(incident.minutesElapsed)} · {incident.headDirection}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => (
          <button
            key={t.key}
            className={`toast ${t.kind === 'new' ? 'is-new-fire' : 'is-escalated'}`}
            style={{ '--alarm': t.incident.alarm.color }}
            onClick={() => {
              onSelect(t.incident.id);
              setToasts((current) => current.filter((c) => c.key !== t.key));
            }}
          >
            <span className="toast-code">{t.incident.alarm.code}</span>
            <span className="toast-body">
              <strong>
                {t.kind === 'new' ? 'New report' : 'Escalated'} · {t.incident.barangayName}
              </strong>
              <span className="muted small">
                {t.incident.alarm.label} · spreading {t.incident.headDirection}
              </span>
            </span>
          </button>
        ))}
      </div>

      {soundPrompt && createPortal(
        <div className="sound-modal-backdrop" role="presentation">
          <section className="sound-modal" role="dialog" aria-modal="true" aria-labelledby="sound-modal-title">
            <span className="sound-modal-icon" aria-hidden="true">!</span>
            <h2 id="sound-modal-title">Turn on alarm sounds</h2>
            <p>Allow alarm sounds so you can hear new fire reports and alarm escalations.</p>
            <p className="muted small">Your device volume and silent mode control the volume.</p>
            <div className="sound-modal-actions">
              <button className="secondary" onClick={() => {
                localStorage.setItem('fire-watch-sounds', 'dismissed');
                setSoundPrompt(false);
              }}>Not now</button>
              <button className="primary" onClick={turnOnSounds}>Enable sounds</button>
            </div>
          </section>
        </div>,
        document.body
      )}
    </div>
  );
}

function BellGlyph({ ringing }) {
  return (
    <svg viewBox="0 0 24 24" className={`bell-glyph ${ringing ? 'is-ringing' : ''}`} aria-hidden="true">
      <path d="M12 2.5c-1 0-1.8.8-1.8 1.8v.6C7.9 5.5 6.2 7.7 6.2 10.3v4l-1.6 2.4c-.3.5.03 1.1.6 1.1h13.6c.57 0 .9-.6.6-1.1l-1.6-2.4v-4c0-2.6-1.7-4.8-4-5.4v-.6c0-1-.8-1.8-1.8-1.8z" />
      <path d="M9.6 19.4a2.4 2.4 0 0 0 4.8 0z" />
    </svg>
  );
}

// A clear, friendly admin profile glyph in the app's blue palette.
function AdminGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="admin-button-icon" aria-hidden="true">
      <circle className="tux-head" cx="12" cy="7" r="3.6" />
      <path className="tux-coat" d="M3.2 23c0-5.4 3.4-9.2 8.8-9.2s8.8 3.8 8.8 9.2z" />
      <path className="tux-shirt" d="M9 14.1 12 21.6 15 14.1C14.2 13.8 13.2 13.6 12 13.6S9.8 13.8 9 14.1z" />
      <path className="tux-tie" d="M12 16.1 9.1 14.6v3.1zM12 16.1l2.9-1.5v3.1z" />
      <rect className="tux-knot" x="11.1" y="15.2" width="1.8" height="1.8" rx=".5" />
      <circle className="tux-button" cx="12" cy="18.9" r=".55" />
      <circle className="tux-button" cx="12" cy="20.3" r=".55" />
    </svg>
  );
}