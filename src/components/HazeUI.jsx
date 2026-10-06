import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleMarker, Marker, Polyline, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import '../haze.css';
import {
  FRAME_COUNT, FRAME_HOURS, HOME, HOME_REGION, LEVELS, SMOKE_BOUNDS, isPointInCaraga, loadHaze, renderSmokeFrames,
} from '../lib/haze.js';

const PH_TIME = new Intl.DateTimeFormat('en-PH', {
  weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila',
});

const regionStatus = (r) => {
  if (r.nowLevel >= 1) return `Under ${LEVELS[r.nowLevel].label.toLowerCase()} now`;
  if (r.firstFrame != null) return `${LEVELS[r.peakLevel].label} expected in ~${r.firstFrame * FRAME_HOURS} h`;
  return 'No haze in the 72 h outlook';
};

/* ------------------------------------------------------------------ data */

// Keeps the fire/smoke/wind picture current without the user asking for it.
const HAZE_REFRESH_MS = 60 * 1000;

export function useHaze(enabled) {
  const [state, setState] = useState({ status: 'idle', data: null, error: null });
  const [nonce, setNonce] = useState(0);
  const force = useRef(false);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    const forced = force.current;
    force.current = false;
    setState((s) => ({ ...s, status: 'loading', error: null }));
    loadHaze(forced)
      .then((data) => !cancelled && setState({ status: 'ready', data, error: null }))
      .catch((err) => !cancelled && setState((s) => ({ ...s, status: 'error', error: err.message })));
    const id = setInterval(() => {
      force.current = true;
      setNonce((n) => n + 1);
    }, HAZE_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [enabled, nonce]);

  return {
    ...state,
    reload: () => {
      force.current = true;
      setNonce((n) => n + 1);
    },
  };
}

/* ------------------------------------------------------------- map layer */

const homeIcon = L.divIcon({
  className: 'pin-wrap',
  html: '<span class="haze-home"><i></i><b>Surigao</b></span>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

function pathBearing(from, to) {
  const lat1 = from[0] * Math.PI / 180;
  const lat2 = to[0] * Math.PI / 180;
  const dLon = (to[1] - from[1]) * Math.PI / 180;
  return (Math.atan2(
    Math.sin(dLon) * Math.cos(lat2),
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon),
  ) * 180 / Math.PI + 360) % 360;
}

function hazeWindIcon(bearing) {
  return L.divIcon({
    className: 'haze-wind-arrow-wrap',
    html: `<span class="haze-wind-arrow" style="--bearing:${bearing}deg"></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

/** Everything the haze view draws inside <MapContainer>. */
export function HazeLayer({ data, frame, focus }) {
  const map = useMap();
  const overlayRef = useRef(null);

  useEffect(() => {
    if (!map.getPane('haze-smoke')) {
      map.createPane('haze-smoke').style.zIndex = 330;
      map.createPane('haze-fires').style.zIndex = 420;
    }
  }, [map]);

  // Smoke: one pre-rendered image per 3 h step. Two stacked overlays are
  // cross-faded between frames (instead of swapping the image outright) so
  // stepping through the timeline, or hitting play, reads as smooth motion
  // rather than a slideshow jump-cut.
  const smokeUrls = useMemo(() => (data?.frames ? renderSmokeFrames(data.frames) : null), [data]);

  // Warm the browser's decode of every frame up front, off the animation
  // path. Without this, the *first* time each frame is shown mid-playback,
  // setUrl() has to decode a fresh PNG before the browser has anything to
  // paint — on slower devices that shows up as a stutter or a blank flash
  // no matter how the opacity is animated. Decoding all 25 up front (once,
  // when the data loads) means playback is just swapping already-decoded
  // bitmaps.
  useEffect(() => {
    if (!smokeUrls) return undefined;
    let cancelled = false;
    for (const url of smokeUrls) {
      const img = new Image();
      img.src = url;
      img.decode?.().catch(() => {}); // best-effort; ignore if unsupported
      if (cancelled) break;
    }
    return () => {
      cancelled = true;
    };
  }, [smokeUrls]);

  useEffect(() => {
    if (!smokeUrls) return undefined;
    const a = L.imageOverlay(smokeUrls[0], SMOKE_BOUNDS, {
      pane: 'haze-smoke', interactive: false, className: 'haze-smoke-img',
    }).addTo(map);
    const b = L.imageOverlay(smokeUrls[0], SMOKE_BOUNDS, {
      pane: 'haze-smoke', interactive: false, className: 'haze-smoke-img',
    }).addTo(map);
    b.setOpacity(0);
    overlayRef.current = { layers: [a, b], top: 0, frame: 0 };
    return () => {
      a.remove();
      b.remove();
      overlayRef.current = null;
    };
  }, [map, smokeUrls]);

  useEffect(() => {
    const state = overlayRef.current;
    if (!smokeUrls || !state || state.frame === frame) return;
    state.frame = frame;
    const nextTop = state.top === 0 ? 1 : 0;
    const incoming = state.layers[nextTop];
    const outgoing = state.layers[state.top];
    state.top = nextTop;
    incoming.setUrl(smokeUrls[frame]);

    // Switch frames immediately; the browser has already been asked to
    // decode every frame above, so there is no intentional visual fade.
    incoming.setOpacity(1);
    outgoing.setOpacity(0);
    return undefined;
  }, [smokeUrls, frame]);

  // Hotspots: thousands of dots, so one canvas layer instead of one React node each.
  useEffect(() => {
    if (!data) return undefined;
    const renderer = L.canvas({ padding: 0.3, pane: 'haze-fires' });
    const group = L.layerGroup();
    for (const f of data.fires) {
      L.circleMarker([f.lat, f.lon], {
        renderer, stroke: false, interactive: false,
        radius: f.frp > 40 ? 3.4 : f.frp > 12 ? 2.6 : 1.9,
        fillColor: f.frp > 40 ? '#E85D04' : '#FF7A00',
        fillOpacity: 0.85,
      }).addTo(group);
    }
    group.addTo(map);
    return () => {
      group.remove();
      map.removeLayer(renderer);
    };
  }, [map, data]);

  useEffect(() => {
    if (focus) map.flyTo(focus, 7, { duration: 0.9 });
  }, [map, focus]);

  if (!data) return null;

  return (
    <>
      {data.clusters.filter((cl) => cl.path).slice(0, 40).map((cl, i) => (
        [
          <Polyline
            key={`track-${i}`}
            positions={cl.path}
            pathOptions={{
              color: cl.reachesPH ? '#B3261E' : '#7A6A5F',
              weight: cl.reachesPH ? 2.2 : 1,
              opacity: cl.reachesPH ? 0.85 : 0.35,
              dashArray: '5 7',
            }}
          />,
          cl.path.length > 3 && (
            <Marker
              key={`wind-arrow-${i}`}
              position={cl.path[Math.min(4, cl.path.length - 1)]}
              icon={hazeWindIcon(pathBearing(cl.path[2], cl.path[3]))}
              interactive={false}
            >
              <Tooltip direction="top">
                Wind carries smoke toward {Math.round(pathBearing(cl.path[2], cl.path[3]))}° · next 48 h
              </Tooltip>
            </Marker>
            ),
        ]
      ))}

      {data.clusters.filter((c) => c.path && c.reachesPH).slice(0, 40).flatMap((cl, i) =>
        [8, 16].map((idx) => (
          <CircleMarker
            key={`tick-${i}-${idx}`}
            center={cl.path[idx]}
            radius={3.5}
            pathOptions={{ color: '#B3261E', weight: 1.5, fillColor: '#fff', fillOpacity: 1 }}
          >
            <Tooltip direction="top">{`Smoke from ${cl.area}: +${idx * FRAME_HOURS} h`}</Tooltip>
          </CircleMarker>
        ))
      )}

      {data.clusters.map((cl, i) => (
        <CircleMarker
          key={`src-${i}`}
          center={[cl.lat, cl.lon]}
          radius={6 + cl.strength / 7}
          pathOptions={{ color: '#0E2240', weight: 1.5, fillColor: '#2F6CFF', fillOpacity: 0.16 }}
        >
          <Tooltip direction="top">
            <strong>{cl.area}</strong>
            <br />
            {cl.count} hotspots · {Math.round(cl.frp)} MW
            <br />
            {cl.reachesPH ? `Smoke line reaches the Philippines in ~${cl.phHours} h` : 'Smoke line stays away from the Philippines'}
          </Tooltip>
        </CircleMarker>
      ))}

      {data.regions.map((r) => {
        const lvl = r.levels[frame];
        return (
          <CircleMarker
            key={r.code}
            center={r.center}
            radius={lvl > 0 ? 9 : 5}
            pathOptions={{
              color: '#fff', weight: 2,
              fillColor: LEVELS[lvl].color, fillOpacity: lvl > 0 ? 0.95 : 0.7,
            }}
          >
            <Tooltip direction="top">
              <strong>{r.name}</strong>
              <br />
              <span className="air-quality-map" style={{ color: r.airQuality.color }}>
                Air: {r.airQuality.label}{r.pm25 != null ? ` (${r.pm25.toFixed(1)} µg/m³)` : ''}
              </span>
              <br />
              {LEVELS[lvl].label} at this time
              <br />
              {regionStatus(r)}
            </Tooltip>
          </CircleMarker>
        );
      })}

      <Marker position={HOME} icon={homeIcon} interactive={false} zIndexOffset={4000} />
    </>
  );
}

/* --------------------------------------------------------- floating bits */

/** A single on/off layer switch — local fires stay on the map either way. */
export function MapLayersMenu({
  hazeOn,
  onHazeChange,
  nationalFireOn,
  onNationalFireChange,
  is3d = true,
  onToggle3d,
  onResetDirection,
  loading = false,
  hotspots = [],
  fetchedAt = null,
}) {
  const formatAge = (minutes) => {
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = Math.round(hours / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  };
  const newestDetectionHours = hotspots.reduce((newest, hotspot) => (
    Number.isFinite(hotspot.hoursOld) ? Math.min(newest, hotspot.hoursOld) : newest
  ), Infinity);
  const newestDetectionAge = Number.isFinite(newestDetectionHours)
    ? Math.max(1, Math.round(newestDetectionHours * 60))
    : null;
  const fetchAge = fetchedAt ? Math.max(1, Math.round((Date.now() - fetchedAt) / 60000)) : null;
  const status = loading
    ? 'Refreshing satellite detections'
    : newestDetectionAge != null
      ? `${hotspots.length} detections · newest ${formatAge(newestDetectionAge)}`
      : fetchAge != null
        ? `${hotspots.length} detections · checked ${fetchAge} min ago`
        : 'Satellite fire detections';

  return (
    <details className="map-layers-menu">
      <summary aria-label="Choose map layers">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z" />
          <path d="M9 3v15m6-12v15" />
        </svg>
        <span>Map layers</span>
        <span className="map-layers-chevron" aria-hidden="true" />
      </summary>
      <div className="map-layers-flyout">
        <label className="map-layer-option">
          <input type="checkbox" checked={hazeOn} onChange={(event) => onHazeChange(event.target.checked)} />
          <span className="map-layer-copy">
            <strong>Indonesia haze</strong>
            <small>Smoke forecast and fire sources</small>
          </span>
        </label>
        <label className="map-layer-option">
          <input type="checkbox" checked={nationalFireOn} onChange={(event) => onNationalFireChange(event.target.checked)} />
          <span className="map-layer-copy">
            <strong>PH satellite fires</strong>
            <small>{status}</small>
          </span>
        </label>
        <div className="map-layer-controls" aria-label="3D map controls">
          <button type="button" className="map-3d-toggle" onClick={onToggle3d} aria-pressed={is3d}>
            <svg className="map-control-icon map-3d-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="m12 3 8 4.5-8 4.5-8-4.5L12 3Z" />
              <path d="m4 12 8 4.5 8-4.5M4 16.5 12 21l8-4.5" />
            </svg>
            <span className="map-3d-copy">
              <strong>3D</strong>
              <small>{is3d ? 'ON' : 'OFF'}</small>
            </span>
            <i className="map-3d-indicator" aria-hidden="true" />
          </button>
          <button type="button" className="map-compass-reset" onClick={onResetDirection} aria-label="Reset map direction" title="Reset direction">
            <svg viewBox="0 0 32 32" aria-hidden="true">
              <circle cx="16" cy="16" r="12.25" />
              <path className="compass-north" d="m16 5.5 4.2 11-4.2-2.3-4.2 2.3L16 5.5Z" />
              <path className="compass-south" d="m16 26.5-4.2-11 4.2 2.3 4.2-2.3L16 26.5Z" />
              <text x="16" y="11.3">N</text>
            </svg>
          </button>
        </div>
      </div>
    </details>
  );
}

export function HazeTimeline({ frame, onChange, baseTime }) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    if (!playing) return undefined;
    // Paced to land just after the smoke cross-fade (see HazeLayer)
    // finishes, so each step settles before the next one starts.
    const id = setInterval(() => onChange((f) => (f >= FRAME_COUNT - 1 ? 0 : f + 1)), 650 / speed);
    return () => clearInterval(id);
  }, [playing, onChange, speed]);

  return (
    <div className="timeline haze-timeline" style={{ '--alarm': '#6B5B50' }}>
      <button
        className={`play ${playing ? 'is-playing' : ''}`}
        onClick={() => {
          if (!playing && frame >= FRAME_COUNT - 1) onChange(0);
          setPlaying((p) => !p);
        }}
        aria-label={playing ? 'Pause the smoke forecast' : 'Play the smoke forecast'}
      >
        <span className="play-glyph" />
      </button>
      <div className="timeline-track">
        <input
          type="range" min="0" max={FRAME_COUNT - 1} step="1" value={frame}
          aria-label="Hours from now"
          onChange={(e) => {
            setPlaying(false);
            onChange(Number(e.target.value));
          }}
        />
        <div className="timeline-marks">
          <span>now</span><span>+24 h</span><span>+48 h</span><span>+72 h</span>
        </div>
      </div>
      <label className="haze-speed">
        <span>Speed</span>
        <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Playback speed">
          <option value="0.5">0.5x</option>
          <option value="1">1x</option>
          <option value="2">2x</option>
          <option value="4">4x</option>
          <option value="8">8x</option>
          <option value="12">12x</option>
        </select>
      </label>
      <span className="haze-readout">
        <b>{frame === 0 ? 'Now' : `+${frame * FRAME_HOURS} h`}</b>
        <small>{PH_TIME.format(baseTime + frame * FRAME_HOURS * 3600e3)}</small>
      </span>
    </div>
  );
}

export const HISTORICAL_FIRE_EVENT = {
  id: 'nueva-goding-taft-2026-08-12',
  label: 'Nueva Goding · Barangay Taft',
  description: 'Documented fire event in Barangay Taft, Surigao City, from 12:00–16:00 on 12 Aug 2026.',
  start: new Date('2026-08-12T12:00:00+08:00'),
  center: [9.7852, 125.4907],
  frames: [
    { label: '12:00', time: '12:00 PM', radius: 20, strength: 0.2, center: [9.7851, 125.4905] },
    { label: '13:00', time: '1:00 PM', radius: 34, strength: 0.4, center: [9.7853, 125.4908] },
    { label: '14:00', time: '2:00 PM', radius: 52, strength: 0.6, center: [9.7854, 125.4911] },
    { label: '15:00', time: '3:00 PM', radius: 68, strength: 0.8, center: [9.7855, 125.4909] },
    { label: '16:00', time: '4:00 PM', radius: 82, strength: 1, center: [9.7852, 125.4907] },
  ],
};

export function HistoricalFirePlayback({ frame, onChange }) {
  const max = HISTORICAL_FIRE_EVENT.frames.length - 1;
  const current = HISTORICAL_FIRE_EVENT.frames[Math.min(frame, max)];

  return (
    <div className="timeline haze-timeline historical-fire-playback" style={{ '--alarm': '#B3261E' }}>
      <button
        className="play"
        onClick={() => onChange((f) => (f >= max ? 0 : f + 1))}
        aria-label="Play documented fire playback"
      >
        <span className="play-glyph" />
      </button>
      <div className="timeline-track">
        <input
          type="range" min="0" max={max} step="1" value={Math.min(frame, max)}
          aria-label="Historical fire playback time"
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <div className="timeline-marks">
          {HISTORICAL_FIRE_EVENT.frames.map((step) => (
            <span key={step.label}>{step.label}</span>
          ))}
        </div>
      </div>
      <span className="haze-readout">
        <b>{current.label}</b>
        <small>{current.time}</small>
      </span>
    </div>
  );
}

/* ----------------------------------------------------------------- panel */

export function HazePanel({ haze, frame, onFocus, userLocation, userInCaraga }) {
  const { status, data, error, reload } = haze;
  const home = userLocation && userInCaraga
    ? data?.regions.find((r) => r.code === HOME_REGION)
    : null;
  const loading = status === 'loading' || status === 'idle';

  return (
    <div className="panel sidebar haze-panel">
      <header className="brand">
        <h1>Indonesia haze watch</h1>
        <p>
          Satellite fire detections across Indonesia, and where the wind carries the
          smoke — toward which Philippine regions, and when.
        </p>
      </header>

      {loading && !data && <p className="muted small">Pulling fire detections, CAMS air quality, and wind forecast…</p>}
      {status === 'error' && !data && <p className="haze-warn">Couldn't load: {error}</p>}

      {data && (
        <>
          <div className="haze-stats">
            <div><b>{data.fires.length.toLocaleString()}</b><span>hotspots, last 24 h</span></div>
            <div><b>{data.clusters.length}</b><span>smoke sources</span></div>
            <div><b>{data.summary.tracksToPH}</b><span>heading to the PH</span></div>
          </div>

          {data.fireSource === 'sample' && (
            <p className="haze-warn">
              Demo mode: these are made-up fires, not live ones ({data.fireNote}). Remove
              <code> VITE_HAZE_DEMO</code> from <code>.env.local</code> to see real detections only.
            </p>
          )}
          {data.fireSource !== 'sample' && data.fireNote && (
            <p className="haze-warn">One fire source did not answer ({data.fireNote}). The others are still live.</p>
          )}
          {status === 'error' && (
            <p className="haze-warn">Refresh failed ({error}). Showing the last data that loaded.</p>
          )}
          {data.fires.length === 0 && (
            <p className="haze-warn">No hotspots were detected inside Indonesia in the last 24 h.</p>
          )}
          {data.windError && (
            <p className="haze-warn">
              Wind forecast unavailable ({data.windError}), so smoke can't be projected. Hotspots are still live.
            </p>
          )}
          {data.pm25Error && (
            <p className="haze-warn">
              CAMS PM2.5 baseline unavailable ({data.pm25Error}). Showing the fire-and-wind estimate only.
            </p>
          )}

          {home && (
            <div className={`haze-home-card is-${LEVELS[home.nowLevel >= 1 ? home.nowLevel : home.peakLevel].key}`}>
              <span className="haze-eyebrow">Your region: Surigao · Caraga</span>
              <strong>{regionStatus(home)}</strong>
              <span className="muted small">
                {home.peakLevel >= 1
                  ? `Peaks around ${LEVELS[home.peakLevel].label.toLowerCase()} in ~${home.peakFrame * FRAME_HOURS} h`
                  : 'Smoke from the current fires is not forecast to reach the region.'}
              </span>
            </div>
          )}

          {data.frames && (
            <section>
              <h3>
                Philippine regions{' '}
                <span className="muted small">
                  · {data.summary.affected} of {data.summary.total} reached within 72 h
                </span>
              </h3>
              <ul className="haze-regions">
                {data.regions.map((r) => (
                  <li key={r.code}>
                    <button
                      className={`haze-region ${r.code === HOME_REGION ? 'is-home' : ''}`}
                      onClick={() => onFocus(r.center)}
                    >
                      <span className="haze-dot" style={{ background: LEVELS[r.levels[frame]].color }} />
                      <span className="haze-region-text">
                        <strong>{r.name}</strong>
                        <span className="muted small">{regionStatus(r)}</span>
                        <span className="air-quality" style={{ color: r.airQuality.color }}>
                          Air: {r.airQuality.label}{r.pm25 != null ? ` · ${r.pm25.toFixed(1)} µg/m³` : ''}
                        </span>
                      </span>
                      <span className="haze-spark" aria-hidden="true">
                        {r.series.map((v, i) => (
                          <i
                            key={i}
                            className={i === frame ? 'is-now' : ''}
                            style={{ height: `${10 + Math.min(v / 2, 1) * 90}%`, background: LEVELS[r.levels[i]].color }}
                          />
                        ))}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="muted small">Bars show haze from now (left) to +72 h (right). Tap a region to zoom to it.</p>
            </section>
          )}

          <section className="haze-legend">
            <h3>Reading the map</h3>
            <ul>
              <li><i className="sw fire" /> Fire hotspot (VIIRS satellite pass)</li>
              <li><i className="sw src" /> Smoke source — ring size follows fire strength</li>
              <li><i className="sw smoke" /> Smoke at the time on the slider; darker is thicker</li>
              <li><i className="sw track" /> Smoke line, next 48 h (red = reaches the Philippines, circles at +24 / +48 h)</li>
              {LEVELS.slice(1).map((l) => (
                <li key={l.key}><i className="sw dot" style={{ background: l.color }} /> {l.label} over a region</li>
              ))}
            </ul>
          </section>

          <button className="secondary block" onClick={reload} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh data'}
          </button>
          <p className="muted small">
            Updated {PH_TIME.format(data.generatedAt)}. Winds: Open-Meteo, 925 hPa (~750 m).
            {data.pm25?.some((value) => value != null) && ' Current PM2.5 baseline: Copernicus CAMS via Open-Meteo.'}
            {data.fireSource !== 'sample' && ` Fires: NASA VIIRS satellite detections via ${data.fireSource.includes('firms') ? 'NASA FIRMS and Esri' : 'Esri (NASA LANCE)'}.`}
          </p>
        </>
      )}

      <footer className="disclaimer">
        Screening estimate only: hotspots mark fires, not smoke, and the smoke lines come from
        wind forecasts and do not account for plume rise. Follow official weather and health advisories.
      </footer>
    </div>
  );
}