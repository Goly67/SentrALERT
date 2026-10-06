import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CircleMarker, MapContainer, TileLayer } from 'react-leaflet';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { auth } from '../lib/firebase.js';
import { enableAlarmSounds } from '../lib/alarmAudio.js';
import { deleteReport, setReportStatus, updateReport } from '../lib/reportsStore.js';
import { resolveBarangay } from '../lib/incidents.js';

const STATUS_LABEL = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

const ADMIN_EMAILS = ['forestparty223@gmail.com'];
const ADMIN_STORAGE_KEY = 'sfw-admin-panel-state-v1';

const statusOf = (report) => report.status ?? 'approved';

function isAuthorizedAdmin(user) {
  return !!user && typeof user.email === 'string' && ADMIN_EMAILS.includes(user.email.toLowerCase());
}

function readStoredPanelState() {
  if (typeof window === 'undefined') return { activeTab: 'queue', isCompact: false };

  try {
    const saved = window.localStorage.getItem(ADMIN_STORAGE_KEY);
    if (!saved) return { activeTab: 'queue', isCompact: false };
    const parsed = JSON.parse(saved);
    return {
      activeTab: parsed.activeTab === 'fires' ? parsed.activeTab : 'queue',
      isCompact: Boolean(parsed.isCompact),
    };
  } catch {
    return { activeTab: 'queue', isCompact: false };
  }
}

function formatWhen(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function reportBarangayName(report) {
  const [lat, lng] = Array.isArray(report.location) ? report.location : [];
  if (
    Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
    Number.isFinite(lng) && lng >= -180 && lng <= 180
  ) {
    return resolveBarangay([lat, lng]).name;
  }
  return report.barangayId
    ?.replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase()) ?? 'Someone reported a fire';
}

function evidenceEmbedUrl(url) {
  return url
    .replace('https://drive.google.com/open?id=', 'https://drive.google.com/file/d/')
    .replace(/\/view\?usp=.*/, '/preview');
}

function ReportLocationMap({ location }) {
  if (!Array.isArray(location) || location.length !== 2) return null;

  return (
    <div className="admin-location-map" aria-label="Reported fire location">
      <MapContainer
        center={location}
        zoom={16}
        scrollWheelZoom={false}
        dragging={false}
        doubleClickZoom={false}
        zoomControl={false}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <CircleMarker
          center={location}
          radius={9}
          pathOptions={{ color: '#173564', weight: 3, fillColor: '#2F6CFF', fillOpacity: 0.9 }}
        />
      </MapContainer>
    </div>
  );
}

export default function AdminPanel({
  reports = [],
  incidents = [],
  incidentStatusMap = {},
  incidentStatusError = '',
  onUpdateIncidentStatus,
  onAdminAuthorizationChange,
  onClose,
}) {
  const [loginError, setLoginError] = useState('');
  const [user, setUser] = useState(null);
  const [panelState, setPanelState] = useState(readStoredPanelState);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(panelState));
    }
  }, [panelState]);

  useEffect(() => {
    function onKey(event) {
      if (event.key === 'Escape') onClose?.();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!auth) return undefined;

    return onAuthStateChanged(auth, async (nextUser) => {
      if (!nextUser) {
        setUser(null);
        onAdminAuthorizationChange?.(false);
        return;
      }

      if (!isAuthorizedAdmin(nextUser)) {
        onAdminAuthorizationChange?.(false);
        setLoginError('This Google account is not authorized for admin access.');
        await signOut(auth);
        setUser(null);
        return;
      }

      setLoginError('');
      setUser(nextUser);
      await enableAlarmSounds();
      onAdminAuthorizationChange?.(true);
    });
  }, [onAdminAuthorizationChange]);

  const queue = useMemo(() => [...reports].sort((a, b) => {
    const statusRank = { pending: 0, approved: 1, rejected: 2 };
    return (statusRank[statusOf(a)] ?? 99) - (statusRank[statusOf(b)] ?? 99)
      || new Date(b.reportedAt) - new Date(a.reportedAt);
  }), [reports]);

  const fireControlList = useMemo(() => [...incidents].sort((a, b) => {
    const aStatus = incidentStatusMap[a.id] ?? 'active';
    const bStatus = incidentStatusMap[b.id] ?? 'active';
    const statusRank = { active: 0, under_control: 1, fire_out: 2 };
    return (statusRank[aStatus] ?? 99) - (statusRank[bStatus] ?? 99)
      || new Date(b.reportedAt) - new Date(a.reportedAt);
  }), [incidents, incidentStatusMap]);

  const counts = useMemo(() => {
    const totals = { pending: 0, approved: 0, rejected: 0 };
    reports.forEach((report) => {
      const status = statusOf(report);
      if (status in totals) totals[status] += 1;
    });
    return totals;
  }, [reports]);

  async function handleGoogleLogin() {
    if (!auth) {
      setLoginError('Firebase Auth is not configured yet. Add the Firebase Auth values to .env.local.');
      return;
    }

    try {
      setLoginError('');
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      setLoginError(error.message || 'Unable to sign in with Google.');
    }
  }

  async function handleSignOut() {
    if (!auth) return;
    await signOut(auth);
  }

  const toggleCompact = () => {
    setPanelState((current) => ({ ...current, isCompact: !current.isCompact }));
  };

  const setTab = (activeTab) => setPanelState((current) => ({ ...current, activeTab }));

  const userName = user?.displayName || 'Administrator';
  const userInitial = (user?.displayName || user?.email || 'A').charAt(0).toUpperCase();

  return createPortal((
    <div className="admin-overlay" role="presentation" onClick={onClose}>
      <aside
        className={`admin-panel ${panelState.isCompact ? 'admin-panel--compact' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Admin panel"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="admin-head">
          <span className="admin-badge" aria-hidden="true"><ShieldGlyph /></span>
          <div className="admin-head-title">
            <p className="admin-kicker">Admin access</p>
            <h2>Fire review panel</h2>
          </div>
          <div className="admin-head-tools">
            <button className="admin-chip-button" type="button" onClick={toggleCompact}>
              <CompactGlyph collapsed={panelState.isCompact} />
              <span>{panelState.isCompact ? 'Expand' : 'Compact'}</span>
            </button>
            <button className="admin-close" type="button" onClick={onClose} aria-label="Close admin panel" title="Close admin panel">
              <CloseGlyph />
            </button>
          </div>
        </header>

        <div className="admin-body">
          {!user ? (
            <div className="admin-login">
              <span className="admin-login-icon" aria-hidden="true"><ShieldGlyph /></span>
              <h3>Sign in to continue</h3>
              <p className="muted">Use an authorized Google account to review and moderate fire reports.</p>
              {loginError && (
                <p className="admin-error" role="alert">
                  <AlertGlyph />
                  <span>{loginError}</span>
                </p>
              )}
              <button className="admin-google" type="button" onClick={handleGoogleLogin}>
                <GoogleLogo />
                Continue with Google
              </button>
              <p className="admin-footnote">Only approved admin emails can sign in.</p>
            </div>
          ) : (
            <>
              <div className="admin-user-bar">
                <span className="admin-avatar" aria-hidden="true">
                  {user.photoURL
                    ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" />
                    : userInitial}
                </span>
                <div className="admin-user-text">
                  <strong>{userName}</strong>
                  <span>{user.email}</span>
                </div>
                <button className="admin-signout" type="button" onClick={handleSignOut}>Sign out</button>
              </div>

              <div className="admin-stats">
                <div className="admin-stat admin-stat--pending"><b>{counts.pending}</b><span>Pending</span></div>
                <div className="admin-stat admin-stat--approved"><b>{counts.approved}</b><span>Approved</span></div>
                <div className="admin-stat admin-stat--rejected"><b>{counts.rejected}</b><span>Rejected</span></div>
              </div>

              <div className="admin-tabs" role="tablist" aria-label="Admin sections">
                <button
                  type="button"
                  role="tab"
                  aria-selected={panelState.activeTab === 'queue'}
                  className={panelState.activeTab === 'queue' ? 'admin-tab is-active' : 'admin-tab'}
                  onClick={() => setTab('queue')}
                >
                  Review queue
                  <span className="admin-tab-count">{counts.pending}</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={panelState.activeTab === 'fires'}
                  className={panelState.activeTab === 'fires' ? 'admin-tab is-active' : 'admin-tab'}
                  onClick={() => setTab('fires')}
                >
                  Fires
                  <span className="admin-tab-count">{fireControlList.length}</span>
                </button>
              </div>

              {incidentStatusError && (
                <p className="admin-error" role="alert">
                  <AlertGlyph />
                  <span>{incidentStatusError}</span>
                </p>
              )}

              {panelState.activeTab === 'queue' ? (
                <div className="admin-list">
                  {queue.length === 0 && (
                    <div className="admin-empty">
                      <InboxGlyph />
                      <strong>Queue is clear</strong>
                      <span>No reports are waiting for review.</span>
                    </div>
                  )}

                  {queue.map((report) => {
                    const status = statusOf(report);
                    return (
                      <article key={report.id} className={`admin-report admin-report--${status}`}>
                        <div className="admin-report-head">
                          <div className="admin-report-title">
                            <strong>{reportBarangayName(report)}</strong>
                            <p className="admin-meta">
                              <ClockGlyph />
                              <span>{formatWhen(report.reportedAt)}</span>
                              {report.source && <span className="admin-source">{report.source}</span>}
                            </p>
                          </div>
                          <span className={`status-pill status-pill--${status}`}>{STATUS_LABEL[status]}</span>
                        </div>

                        <label className="admin-field">
                          <span>Notes</span>
                          <textarea
                            value={report.note ?? ''}
                            placeholder="Add a note about this report…"
                            onChange={(event) => updateReport(report.id, { note: event.target.value })}
                          />
                        </label>

                        <label className="admin-field">
                          <span>Google Drive / Google Photos link</span>
                          <input
                            type="url"
                            value={report.driveUrl ?? ''}
                            placeholder="https://drive.google.com/…"
                            onChange={(event) => updateReport(report.id, { driveUrl: event.target.value || null })}
                          />
                        </label>

                        <ReportLocationMap location={report.location} />

                        {report.driveUrl && (
                          <div className="admin-evidence">
                            <iframe
                              src={evidenceEmbedUrl(report.driveUrl)}
                              title={`Evidence for ${report.id}`}
                              allow="autoplay"
                            />
                          </div>
                        )}

                        <div className="admin-actions">
                          <button
                            className="admin-action admin-action--approve"
                            type="button"
                            onClick={() => setReportStatus(report.id, 'approved', user.email)}
                          >
                            <CheckGlyph /> Approve
                          </button>
                          <button
                            className="admin-action admin-action--reject"
                            type="button"
                            onClick={() => setReportStatus(report.id, 'rejected', user.email)}
                          >
                            <CrossGlyph /> Reject
                          </button>
                          <button
                            className="admin-action admin-action--delete"
                            type="button"
                            onClick={() => deleteReport(report.id)}
                            aria-label="Delete report"
                            title="Delete report"
                          >
                            <TrashGlyph /> <span>Delete</span>
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="admin-list">
                  {fireControlList.length === 0 && (
                    <div className="admin-empty">
                      <InboxGlyph />
                      <strong>No active fires</strong>
                      <span>Fire control actions will appear here.</span>
                    </div>
                  )}

                  {fireControlList.map((incident) => {
                    const status = incidentStatusMap[incident.id] ?? 'active';
                    const statusLabel = status === 'under_control' ? 'UC' : status === 'fire_out' ? 'FO' : 'Active';
                    const statusClass = status === 'under_control' ? 'under-control' : status === 'fire_out' ? 'fire-out' : 'active';

                    return (
                      <article key={`fire-${incident.id}`} className="admin-report admin-report--submitted">
                        <div className="admin-report-head">
                          <div className="admin-report-title">
                            <strong>{incident.barangayName}</strong>
                            <p className="admin-meta">
                              <ClockGlyph />
                              <span>{formatWhen(incident.reportedAt)}</span>
                              <span className="admin-source">
                                {status === 'under_control' ? 'UC' : status === 'fire_out' ? 'FO' : incident.alarm.label}
                              </span>
                            </p>
                          </div>
                          <span className={`status-pill status-pill--${statusClass}`}>
                            {statusLabel}
                          </span>
                        </div>

                        <p className="admin-submission-note">
                          {incident.note || 'No description given.'}
                        </p>

                        <div className="admin-actions admin-actions--two">
                          <button
                            className="admin-action admin-action--approve"
                            type="button"
                            onClick={() => onUpdateIncidentStatus?.(incident.id, 'under_control')}
                          >
                            <CheckGlyph /> UC
                          </button>
                          <button
                            className="admin-action admin-action--reject"
                            type="button"
                            onClick={() => onUpdateIncidentStatus?.(incident.id, 'fire_out')}
                          >
                            <CrossGlyph /> FO
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  ), document.body);
}

/* ---------- icons ---------- */

const svgProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

function ShieldGlyph() {
  return (
    <svg {...svgProps}>
      <path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.3 7.5 9.5 4.4-1.2 7.5-4.9 7.5-9.5V6L12 3z" />
      <path d="m8.8 12.2 2.3 2.3 4.2-4.6" />
    </svg>
  );
}

function CloseGlyph() {
  return (
    <svg {...svgProps}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

function CompactGlyph({ collapsed }) {
  return (
    <svg {...svgProps}>
      {collapsed
        ? <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
        : <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />}
    </svg>
  );
}

function ClockGlyph() {
  return (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg {...svgProps}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

function CrossGlyph() {
  return (
    <svg {...svgProps}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

function TrashGlyph() {
  return (
    <svg {...svgProps}>
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 1.8h6a2 2 0 0 0 2-1.8l1-12M9 7V4.5h6V7" />
    </svg>
  );
}

function LinkGlyph() {
  return (
    <svg {...svgProps}>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </svg>
  );
}

function InboxGlyph() {
  return (
    <svg {...svgProps}>
      <path d="M4 13.5 6.5 5.5h11l2.5 8v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-5z" />
      <path d="M4 13.5h4.5l1 2.5h5l1-2.5H20" />
    </svg>
  );
}

function AlertGlyph() {
  return (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5M12 16.5v.01" />
    </svg>
  );
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z" />
      <path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}