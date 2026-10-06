import { useState } from 'react';
import { createPortal } from 'react-dom';
import { composePost } from '../lib/verification.js';
import { projectSpread } from '../lib/fireSpread.js';
import { ALARM_LEVELS, nextReportThreshold } from '../lib/alarmLevels.js';

function driveFileId(url) {
  return url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?.*id=)([\w-]+)/i)?.[1] ?? null;
}

function EvidencePreview({ url }) {
  const id = driveFileId(url);
  if (id) {
    return (
      <iframe
        className="evidence-preview"
        src={`https://drive.google.com/file/d/${id}/preview`}
        title="Google Drive photo or video preview"
        allow="autoplay"
      />
    );
  }
  return (
    <a className="evidence-preview-link" href={url} target="_blank" rel="noreferrer">
      Open Google Photos photo or video
    </a>
  );
}

function EvidenceModal({ reports, onClose }) {
  return createPortal((
    <div className="evidence-modal-backdrop" role="presentation" onClick={onClose}>
      <section className="evidence-modal" role="dialog" aria-modal="true" aria-labelledby="evidence-modal-title" onClick={(event) => event.stopPropagation()}>
        <div className="panel-head">
          <h2 id="evidence-modal-title">All fire images</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close images" title="Close images">
            <span className="icon-close" aria-hidden="true" />
          </button>
        </div>
        <div className="evidence-modal-list">
          {reports.map((report) => (
            <div key={report.id} className="evidence-item">
              <EvidencePreview url={report.driveUrl} />
              <a className="evidence-chip" href={report.driveUrl} target="_blank" rel="noreferrer">
                <DriveGlyph /> View evidence from {relative((Date.now() - new Date(report.reportedAt)) / 60000)}
              </a>
            </div>
          ))}
        </div>
      </section>
    </div>
  ), document.body);
}

const relative = (minutes) => {
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${Math.round(minutes)} min ago`;
  return `${(minutes / 60).toFixed(1)} h ago`;
};

export default function IncidentPanel({
  incident, horizonMinutes, onBack, onOpenLevels,
  incidentState = 'active', postApproval, onApprovePost, onRevokePost, onReportFire,
}) {
  const [showAllEvidence, setShowAllEvidence] = useState(false);
  const thirty = incident.projections.find((p) => p.minutes === 30);
  const scrubbed = projectSpread({ ...incident.spreadParams, minutes: horizonMinutes });
  const held = incident.alarm.level === 0;
  const underControl = incidentState === 'under_control';
  const post = incident.triage.autoPost ? composePost(incident, incident.alarm) : null;
  const evidenceLinks = incident.reports.filter((r) => r.driveUrl);
  const reportsNeeded = Math.max(0, ALARM_LEVELS[0].minReports - incident.reports.length);
  const nextReportAlarm = nextReportThreshold(incident.alarm.level, incident.reports.length);
  const nextReportsNeeded = nextReportAlarm
    ? nextReportAlarm.minReports - incident.reports.length
    : 0;
  const waterLitres = Math.max(500, Math.round((scrubbed.areaHa ?? 0) * 1800 / 100) * 100);

  return (
    <div className="panel incident-panel">
      <div className="panel-head">
        <button className="icon-button" onClick={onBack} aria-label="All incidents" title="All incidents">
          <span className="icon-back" aria-hidden="true" />
        </button>
        <button className="icon-button" onClick={onOpenLevels} aria-label="5 levels" title="5 levels">
          <span className="icon-warning-levels" aria-hidden="true">!</span>
        </button>
      </div>

      <div className={`alarm-head ${held ? 'is-held' : ''}`} style={{ '--alarm': underControl ? '#2F6CFF' : incident.alarm.color }}>
        <span className="alarm-code">{underControl ? 'UC' : incident.alarm.code}</span>
        <div>
          <h2>{underControl ? 'Under control' : incident.alarm.label}</h2>
          <p>{incident.barangayName} · {relative(incident.minutesElapsed)}</p>
        </div>
      </div>

      <p className="alarm-summary">{underControl ? 'Fire is under control. No active fire alarm.' : incident.alarm.summary}</p>
      <p className="incident-note">{incident.note}</p>
      <p className="report-count">
        PERSON {incident.reports.length} REPORTED THIS FIRE
      </p>

      {evidenceLinks.length > 0 && (
        <div className="evidence-links">
          <div className="evidence-item">
            <EvidencePreview url={evidenceLinks[0].driveUrl} />
            <a className="evidence-chip" href={evidenceLinks[0].driveUrl} target="_blank" rel="noreferrer">
              <DriveGlyph /> View evidence from {relative((Date.now() - new Date(evidenceLinks[0].reportedAt)) / 60000)}
            </a>
          </div>
          {evidenceLinks.length > 1 && (
            <button className="secondary block" onClick={() => setShowAllEvidence(true)}>
              View all images? ({evidenceLinks.length})
            </button>
          )}
        </div>
      )}

      {showAllEvidence && <EvidenceModal reports={evidenceLinks} onClose={() => setShowAllEvidence(false)} />}

      {underControl ? (
        <p className="muted small">Under control. The active fire alarm and spread projection are paused.</p>
      ) : held ? (
        <p className="muted small">
          Not dispatched. {reportsNeeded} more report{reportsNeeded === 1 ? '' : 's'} within
          200 m in the next ten minutes promote{reportsNeeded === 1 ? 's' : ''} this to a
          1st Alarm on its own.
        </p>
      ) : (
        <>
          {nextReportAlarm ? (
            <p className="report-progress">
              {nextReportsNeeded} more report{nextReportsNeeded === 1 ? '' : 's'} within 200 m
              to reach {nextReportAlarm.label}.
            </p>
          ) : (
            <p className="report-progress">5th Alarm report threshold reached.</p>
          )}
          <dl className="stats">
            <div>
              <dt>Heading</dt>
              <dd>{incident.headDirection}</dd>
            </div>
            <div>
              <dt>Rate of spread</dt>
              <dd>{thirty.rosMetresPerMin.toFixed(1)} m/min</dd>
            </div>
            <div className="is-live">
              <dt>At +{Math.round(horizonMinutes)} min</dt>
              <dd>~{scrubbed.estimatedStructures} structures</dd>
            </div>
            <div className="is-live">
              <dt>Front distance</dt>
              <dd>{scrubbed.headDistanceM.toFixed(0)} m</dd>
            </div>
            <div className="is-live">
              <dt>Water needed (est.)</dt>
              <dd>{waterLitres.toLocaleString()} L</dd>
            </div>
          </dl>

          <p className="muted small">
            {incident.fuelLabel}. Drag the timeline under the map to walk the front
            forward. {incident.reports.length} independent report
            {incident.reports.length > 1 ? 's' : ''} so far.
          </p>

          {incident.alarm.escalatedBy > 0 && (
            <p className="escalation">
              Raised {incident.alarm.escalatedBy} level
              {incident.alarm.escalatedBy > 1 ? 's' : ''} above the size estimate —
              independent reports and time on the clock both point to a bigger fire.
            </p>
          )}

          <section>
            <h3>CALL THESE FIRE STATIONS</h3>
            <ul className="stations">
              {incident.stations.slice(0, 4).map((s, i) => (
                <li key={s.id} style={{ '--step': i }}>
                  <span>
                    <strong>{s.name}</strong>
                    <br />
                    <span className="muted small">{s.city} · {s.region}</span>
                    {s.contact && (
                      <>
                        <br />
                        <a className="tel" href={`tel:${s.contact.replace(/\s/g, '')}`}>{s.contact}</a>
                      </>
                    )}
                  </span>
                  <span className="muted mono">{(s.distanceM / 1000).toFixed(1)} km</span>
                </li>
              ))}
            </ul>
            <p className="muted small">{incident.alarm.respondingUnits} under this level.</p>
          </section>
        </>
      )}

      <section className="report-fire-cta">
        <strong>Fire is getting big?</strong>
        <button className="primary block" onClick={() => onReportFire(incident.location)}>
          Report fire
        </button>
        <p className="muted small">Your report will be added to this fire at its current location.</p>
      </section>
    </div>
  );
}

/** Generic link glyph — not a reproduction of any platform's logo. */
function DriveGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="drive-glyph" aria-hidden="true">
      <path d="M9.5 14.5l5-5M10.8 8.2l1-1a3 3 0 0 1 4.2 4.2l-1.4 1.4M13.2 15.8l-1 1a3 3 0 0 1-4.2-4.2l1.4-1.4" />
    </svg>
  );
}
