import { useState } from 'react';
import { REPORT_SOURCES } from '../lib/verification.js';
import { resolveBarangay } from '../lib/incidents.js';
import { distanceMeters } from '../lib/geo.js';

const DRIVE_URL_PATTERN = /^https:\/\/(drive|photos)\.google\.com\//i;

function driveFileId(url) {
  return url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?.*id=)([\w-]+)/i)?.[1] ?? null;
}

/**
 * Reporting is one screen: where, a sentence, and optionally a link. Anything
 * that asks the reporter to think harder than that will not get filled in
 * while a house is burning.
 *
 * There is no file upload here on purpose — the app has nowhere free to put
 * the bytes. Instead the reporter pastes a Google Drive (or Photos) share
 * link to a photo or video, which travels with the report as plain text.
 *
 * `modelConfidence` stands in for the hosted fire/smoke classifier. In
 * production a Cloud Function would score the linked media server-side —
 * the form never decides this.
 */
export default function ReportForm({ location, incidents = [], onPlaceRequest, onSubmit, onCancel, prefill }) {
  const [note, setNote] = useState('');
  const [source, setSource] = useState('crowd');
  const [driveUrl, setDriveUrl] = useState('');
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState(null);

  const barangay = location ? resolveBarangay(location) : null;
  const existingFire = location
    ? incidents.find((incident) => distanceMeters(location, incident.location) <= 200)
    : null;
  const reportNumber = (existingFire?.reports.length ?? 0) + 1;
  const pastedUrl = driveUrl.trim();
  const pastedDriveId = driveFileId(pastedUrl);

  function useMyLocation() {
    if (!navigator.geolocation) {
      setError('This browser will not share a location. Tap the map instead.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onPlaceRequest([pos.coords.latitude, pos.coords.longitude]);
      },
      () => {
        setLocating(false);
        setError('Location is off. Tap the map to drop the pin yourself.');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  function submit() {
    if (!location) {
      setError('Drop a pin first — tap the map or use your location.');
      return;
    }
    const trimmedUrl = driveUrl.trim();
    if (trimmedUrl && !DRIVE_URL_PATTERN.test(trimmedUrl)) {
      setError('That doesn\u2019t look like a Google Drive or Google Photos link.');
      return;
    }
    onSubmit({
      id: `rpt-${Date.now()}`,
      location,
      barangayId: barangay.id,
      source,
      modelConfidence: 0.8,
      note: note.trim() || 'No description given.',
      driveUrl: trimmedUrl || null,
      reportedAt: new Date().toISOString(),
    });
  }

  return (
    <div className="panel report-form">
      <div className="panel-head">
        <h2>Report a fire</h2>
        <button className="icon-button" onClick={onCancel} aria-label="Close" title="Close">
          <span className="icon-close" aria-hidden="true" />
        </button>
      </div>

      <div className="field">
        <label>Where is it</label>
        <div className="row">
          <button className="secondary" onClick={useMyLocation} disabled={locating}>
            {locating ? 'Finding you…' : 'Use my location'}
          </button>
          <span className="hint">or tap the map</span>
        </div>
        {location && (
          <>
            <p className="located">
              {barangay.name} · {location[0].toFixed(5)}, {location[1].toFixed(5)}
            </p>
            <p className="report-count">
              PERSON {reportNumber} REPORTED THIS FIRE
            </p>
          </>
        )}
      </div>

      <div className="field">
        <label htmlFor="note">What do you see</label>
        <textarea
          id="note"
          rows={3}
          value={note}
          placeholder="Smoke from the roof two houses down"
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="drive-url">Photo or video (optional)</label>
        <input
          id="drive-url"
          type="url"
          inputMode="url"
          value={driveUrl}
          placeholder="Paste a Google Drive or Google Photos share link"
          onChange={(e) => setDriveUrl(e.target.value)}
        />
        <p className="hint">
          There's no upload here — share the file from Drive or Photos with
          "anyone with the link" and paste the link.
        </p>
        {pastedDriveId && (
          <iframe
            className="evidence-preview"
            src={`https://drive.google.com/file/d/${pastedDriveId}/preview`}
            title="Google Drive photo or video preview"
            allow="autoplay"
          />
        )}
        {pastedUrl && !pastedDriveId && DRIVE_URL_PATTERN.test(pastedUrl) && (
          <a className="evidence-preview-link" href={pastedUrl} target="_blank" rel="noreferrer">
            Open this Google Photos photo or video
          </a>
        )}
      </div>

      <div className="field">
        <label htmlFor="source">Where this came from</label>
        <select id="source" value={source} onChange={(e) => setSource(e.target.value)}>
          {Object.entries(REPORT_SOURCES).map(([key, meta]) => (
            <option key={key} value={key}>{meta.label}</option>
          ))}
        </select>
      </div>

      {error && <p className="error">{error}</p>}

      <button className="primary block" onClick={submit}>Report the fire</button>
    </div>
  );
}
