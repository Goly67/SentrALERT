import { useEffect, useMemo, useState } from 'react';
import { BrandHeader } from './Brand.jsx';
import { compassLabel } from '../lib/geo.js';
import { temperatureFeel } from '../lib/localWeather.js';
import { bfpStations, regions, STATION_DATA_NOTE } from '../data/bfpStations.js';
import { ALARM_LEVELS } from '../lib/alarmLevels.js';

const STATUS_COPY = {
  confirmed: 'Confirmed by more than one report — posted automatically',
  unverified: 'Single report — waiting on admin approval to post',
};

const statusCopy = (incident) => {
  const next = ALARM_LEVELS.find((level) => incident.reports.length < level.minReports);
  if (!next) return `${STATUS_COPY[incident.triage.status] ?? 'Active'} · 5th Alarm report threshold reached`;
  const needed = next.minReports - incident.reports.length;
  const progress = `${needed} more report${needed === 1 ? '' : 's'} to ${next.label}`;
  if (incident.triage.status === 'monitoring') return `Light warning — waiting for ${progress}`;
  return `${STATUS_COPY[incident.triage.status]} · ${progress}`;
};

const relative = (minutes) => {
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${Math.round(minutes)} min ago`;
  return `${(minutes / 60).toFixed(1)} h ago`;
};

const SORT_MODES = [
  { key: 'severity', label: 'Severity' },
  { key: 'recent', label: 'Newest' },
];

function LocalWeatherGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M14 14.8V5a3 3 0 0 0-6 0v9.8a5 5 0 1 0 6 0Z" fill="#EAF1F9" stroke="#2F6CFF" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M11 6v10M11 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" fill="#2F6CFF" stroke="#2F6CFF" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export default function Sidebar({
  incidents, wind, selectedId, showStations, onToggleStations, onSelect, onReport, onOpenLevels,
  onOpenHistory,
  airQualityActive = false,
  userLocation = null,
  localWeather = null,
  earthquakeMode = false,
  onToggleEarthquake,
  topSlot = null,
}) {
  const [sortMode, setSortMode] = useState('severity');
  const [query, setQuery] = useState('');

  const live = useMemo(() => {
    const filtered = query.trim()
      ? incidents.filter((incident) =>
          incident.barangayName.toLowerCase().includes(query.trim().toLowerCase()))
      : incidents;
    const sorted = [...filtered];
    if (sortMode === 'severity') {
      sorted.sort((a, b) => b.alarm.level - a.alarm.level || a.minutesElapsed - b.minutesElapsed);
    } else {
      sorted.sort((a, b) => a.minutesElapsed - b.minutesElapsed);
    }
    return sorted;
  }, [incidents, query, sortMode]);

  const highestAlarm = incidents.reduce(
    (max, incident) => (incident.alarm.level > max.level ? incident.alarm : max),
    { level: -1 }
  );
  const hasCritical = highestAlarm.level >= 3;
  const localFeel = localWeather ? temperatureFeel(localWeather.tempC) : null;

  return (
    <div className={`panel sidebar ${hasCritical ? 'is-critical' : ''}`}>
      <BrandHeader incidents={incidents} highestAlarm={highestAlarm} />
      {topSlot}

      <button className="primary block report-btn" onClick={onReport}>
        <span className="flame-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M12.5 1.5c1 3-.5 4.5-1.8 6C9 9.3 8 11 8 13a4 4 0 0 0 8 0c0-1.1-.4-2-.9-2.8-.2 1.6-1 2.3-1.6 2.3-.7 0-1-.6-.7-1.3.6-1.4.6-3-.3-4.5-.6 1-1.3 1.5-2 1.2-.8-.3-1-1.3-.6-2.2.4-1 .8-2.3.6-4.2Z" />
            <path d="M6.8 14.5c0 3.6 2.9 6.5 6.5 6.5s6.2-2.5 6.4-6c.1-1.6-.3-3-.9-4.1.3 2.6-.8 4.3-1.9 5.2a5.3 5.3 0 0 1-3.6 1.4c-2.5 0-4.5-1.8-4.5-4.3 0-.6.1-1.1.3-1.6-1.4 1-2.3 2.3-2.3 2.9Z" opacity=".55" />
          </svg>
        </span>
        Report a fire
      </button>

      <div className="weather-stack">
        <div className="wind-card">
          <div className="wind-dial" style={{ '--dir': `${wind.fromDeg + 180}deg` }}>
            <span className="wind-arrow" />
            <span className="wind-sweep" />
          </div>
          <div>
            <p className="wind-speed">{wind.speedKmh.toFixed(0)} km/h</p>
            <p className="muted small">
              Pushing {compassLabel((wind.fromDeg + 180) % 360)}
            </p>
            <p className="muted small">
              {wind.source === 'open-meteo'
                ? 'Live observation'
                : 'Fallback reading — weather service unreachable'}
            </p>
          </div>
        </div>

        {/* Only exists once this device is actually sharing a location —
            no location, no card, nothing guessed in its place. */}
        {userLocation && localWeather && (
          <div className="local-weather-card">
            <div className="local-weather-icon">
              <LocalWeatherGlyph />
            </div>
            <div>
              <p className="local-weather-label">Local temperature</p>
              <p className="local-weather-temp">{Math.round(localWeather.tempC)}°C</p>
              <p className={`local-weather-feel local-weather-feel--${localFeel.replace(/\s+/g, '-')}`}>
                {localFeel.charAt(0).toUpperCase() + localFeel.slice(1)}
              </p>
            </div>
          </div>
        )}
      </div>

      {airQualityActive && (
        <p className="air-quality-signal">
          Elevated smoke readings — corroborating nearby reports
        </p>
      )}

      <section className="incident-section">
        <div className="section-head">
          <h3>
            <span className="section-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                <path d="M12.5 1.5c1 3-.5 4.5-1.8 6C9 9.3 8 11 8 13a4 4 0 0 0 8 0c0-1.1-.4-2-.9-2.8-.2 1.6-1 2.3-1.6 2.3-.7 0-1-.6-.7-1.3.6-1.4.6-3-.3-4.5-.6 1-1.3 1.5-2 1.2-.8-.3-1-1.3-.6-2.2.4-1 .8-2.3.6-4.2Z" />
              </svg>
            </span>
            Active ({live.length})
          </h3>
          {incidents.length > 1 && (
            <div className="incident-controls" role="group" aria-label="Sort incidents">
              {SORT_MODES.map((mode) => (
                <button
                  key={mode.key}
                  type="button"
                  className={`chip-toggle ${sortMode === mode.key ? 'is-active' : ''}`}
                  onClick={() => setSortMode(mode.key)}
                  aria-pressed={sortMode === mode.key}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {incidents.length > 3 && (
          <input
            type="search"
            className="incident-search"
            placeholder="Filter by barangay…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Filter active incidents by barangay"
          />
        )}

        {live.length === 0 && incidents.length === 0 && (
          <div className="sidebar-empty-state">
            <span className="empty-state-art" aria-hidden="true">
              <span className="empty-state-orbit empty-state-orbit--outer" />
              <span className="empty-state-orbit empty-state-orbit--inner" />
              <span className="empty-state-core">
                <svg viewBox="0 0 24 24">
                  <path d="m6.5 12.5 3.6 3.6 7.5-8" />
                </svg>
              </span>
              <span className="empty-state-spark empty-state-spark--one" />
              <span className="empty-state-spark empty-state-spark--two" />
            </span>
            <span className="empty-state-copy">
              <span className="empty-state-status"><i /> All clear</span>
              <strong>Nothing burning right now</strong>
              <span className="empty-state-message">The map is standing by. See something? Let the community know.</span>
            </span>
          </div>
        )}
        {live.length === 0 && incidents.length > 0 && (
          <p className="muted small">No barangay matches "{query}".</p>
        )}

        <ul className="incident-list">
          {live.map((incident, index) => (
            <li key={incident.id} style={{ '--step': index }}>
              <button
                className={`incident-row ${incident.alarm.level === 0 ? 'is-held' : ''} ${incident.id === selectedId ? 'is-active' : ''} ${incident.alarm.level >= 3 ? 'is-severe' : ''}`}
                style={{ '--alarm': incident.alarm.color }}
                onClick={() => onSelect(incident.id)}
              >
                <span className="alarm-chip">{incident.alarm.code}</span>
                <span className="incident-meta">
                  <strong>{incident.barangayName}</strong>
                  <span className="muted small">
                    {relative(incident.minutesElapsed)} · spreading {incident.headDirection}
                  </span>
                  <span className="muted small">{statusCopy(incident)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <details className="sidebar-tools-menu">
        <summary>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3 3.5 7.5 12 12l8.5-4.5L12 3Z" />
            <path d="m3.5 12 8.5 4.5 8.5-4.5M3.5 16.5 12 21l8.5-4.5" />
          </svg>
          <span>Tools &amp; coverage</span>
          <span className="sidebar-tools-chevron" aria-hidden="true" />
        </summary>
        <div className="sidebar-tools-content">
          <button
            type="button"
            className={`secondary block levels-btn earthquake-mode-toggle ${earthquakeMode ? 'is-active' : ''}`}
            onClick={onToggleEarthquake}
            aria-pressed={earthquakeMode}
          >
            <span className="icon-warning-levels" aria-hidden="true">⌁</span>
            <span>Earthquakes</span>
            <span className="earthquake-mode-state">{earthquakeMode ? 'On' : 'Off'}</span>
          </button>

          <button className="secondary block levels-btn" onClick={onOpenLevels}>
            <span className="icon-warning-levels" aria-hidden="true">!</span>
            How the 5 levels work
          </button>

          {onOpenHistory && (
            <button className="secondary block levels-btn" onClick={onOpenHistory}>
              <span className="icon-warning-levels" aria-hidden="true">↻</span>
              Historical fires &amp; satellite check
            </button>
          )}

          <section className="coverage">
            <div className="coverage-head">
              <h3>
                <span className="section-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                    <path d="M12 2 4 5v6c0 5 3.4 8.7 8 11 4.6-2.3 8-6 8-11V5l-8-3Zm0 2.2 6 2.2v4.6c0 3.9-2.6 6.9-6 8.8-3.4-1.9-6-4.9-6-8.8V6.4l6-2.2Z" />
                  </svg>
                </span>
                BFP coverage
              </h3>
              <label className="toggle">
                <input type="checkbox" checked={showStations} onChange={onToggleStations} />
                <span className="toggle-track"><span className="toggle-knob" /></span>
                <span className="small">Show on map</span>
              </label>
            </div>
            <p className="muted small">
              {bfpStations.length} stations and offices across {regions.length} Mindanao
              regions: Caraga, Northern Mindanao, Davao, SOCCSKSARGEN, Zamboanga
              Peninsula and BARMM.
            </p>
            <p className="muted small coverage-detail">{STATION_DATA_NOTE}</p>
          </section>
        </div>
      </details>

      <footer className="disclaimer">
        Barangay boundaries and detector scores in this build are demonstration data.
        Station records are real. Neither replaces calling the Bureau of Fire
        Protection.
      </footer>
    </div>
  );
}