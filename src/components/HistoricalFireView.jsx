import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Polygon, Polyline, CircleMarker, Tooltip } from 'react-leaflet';
import { historicalFires } from '../data/historicalFires.js';
import { fetchHistoricalWind, windAt } from '../lib/historicalWeather.js';
import { checkHistoricalHotspots, getFirmsMapKey, setFirmsMapKey } from '../lib/firmsHistorical.js';
import { projectSpread } from '../lib/fireSpread.js';
import { bearingBetween, destination, compassLabel } from '../lib/geo.js';

const GHOST_STEPS = 4; // rings at 25/50/75/100% of the burn duration

function durationMinutes(fire) {
  return Math.max(1, (new Date(fire.containedAt) - new Date(fire.startedAt)) / 60000);
}

function clockLabel(iso) {
  return new Date(iso).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function timeAtOffset(fire, minutes) {
  return new Date(new Date(fire.startedAt).getTime() + minutes * 60000).toISOString();
}


/** Playback scrubber, styled like Timeline.jsx but running over the fire's
 * own real duration and clock time instead of a fixed 60-minute horizon. */
function BurnPlayback({ fire, minutes, onChange }) {
  const [playing, setPlaying] = useState(false);
  const total = durationMinutes(fire);
  const frame = useRef(null);
  const last = useRef(null);

  useEffect(() => {
    if (!playing) return undefined;
    const step = (now) => {
      if (last.current == null) last.current = now;
      const delta = (now - last.current) / 1000;
      last.current = now;
      onChange((prev) => {
        const next = prev + delta * (total / 10);
        if (next >= total) { setPlaying(false); return total; }
        return next;
      });
      frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(frame.current); last.current = null; };
  }, [playing, onChange, total]);

  function toggle() {
    if (!playing && minutes >= total) onChange(0);
    setPlaying((p) => !p);
  }

  return (
    <div className="burn-playback" style={{ '--alarm': '#173564' }}>
      <button
        className={`play ${playing ? 'is-playing' : ''}`}
        onClick={toggle}
        aria-label={playing ? 'Pause playback' : 'Play playback'}
      >
        <span className="play-glyph" />
      </button>
      <div className="timeline-track">
        <input
          type="range" min="0" max={total} step="0.5"
          value={Math.min(minutes, total)}
          aria-label="Minutes since ignition"
          onChange={(e) => { setPlaying(false); onChange(Number(e.target.value)); }}
        />
        <div className="timeline-marks">
          <span>{clockLabel(fire.startedAt).split(', ').pop()}</span>
          <span>{clockLabel(timeAtOffset(fire, total / 2)).split(', ').pop()}</span>
          <span>{clockLabel(fire.containedAt).split(', ').pop()}</span>
        </div>
      </div>
      <span className="timeline-readout">+{Math.round(minutes)}′</span>
    </div>
  );
}

function SatelliteCheck({ fire, onHotspotsChange }) {
  const [keyInput, setKeyInput] = useState('');
  const [hasKey, setHasKey] = useState(() => Boolean(getFirmsMapKey()));
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const runCheck = (fireToCheck) => {
    if (!getFirmsMapKey()) {
      setResult({ status: 'no_key' });
      onHotspotsChange?.([]);
      return;
    }
    setLoading(true);
    checkHistoricalHotspots({
      location: fireToCheck.location,
      dateIso: fireToCheck.startedAt,
      startedAt: fireToCheck.startedAt,
      containedAt: fireToCheck.containedAt,
    }).then((r) => {
      setResult(r);
      onHotspotsChange?.(r.status === 'ok' ? r.matched : []);
      setLoading(false);
    });
  };

  useEffect(() => { runCheck(fire); }, [fire.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!hasKey) onHotspotsChange?.([]);
  }, [hasKey, onHotspotsChange]);

  function saveKey() {
    setFirmsMapKey(keyInput);
    setHasKey(Boolean(getFirmsMapKey()));
    setKeyInput('');
    runCheck(fire);
  }

  return (
    <section className="satellite-check">
      <h3>Satellite check — NASA FIRMS archive</h3>
      <p className="muted small">
        The live thermal layer elsewhere in this app only holds a rolling ~24h
        window, so it can't answer for a past date. This queries FIRMS'
        archive (VIIRS on Suomi-NPP/NOAA-20/NOAA-21, plus MODIS) directly for{' '}
        {new Date(fire.startedAt).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' })}
        {' '}within 3&nbsp;km of the pin above.
      </p>

      {!hasKey && (
        <div className="firms-key-form">
          <p className="muted small">
            Needs a free NASA FIRMS MAP_KEY (instant, no approval wait) —{' '}
            <a href="https://firms.modaps.eosdis.nasa.gov/api/map_key/" target="_blank" rel="noreferrer">
              get one here
            </a>. Stored only in this browser and sent straight to NASA's API.
          </p>
          <div className="firms-key-row">
            <input
              type="text" placeholder="Paste MAP_KEY"
              value={keyInput} onChange={(e) => setKeyInput(e.target.value)}
            />
            <button className="secondary" onClick={saveKey} disabled={!keyInput.trim()}>Save & check</button>
          </div>
        </div>
      )}

      {hasKey && loading && <p className="muted small">Querying FIRMS…</p>}

      {hasKey && !loading && result?.status === 'error' && (
        <p className="firms-status is-error">FIRMS request failed: {result.message}</p>
      )}

      {hasKey && !loading && result?.status === 'ok' && (
        <>
          {result.matched.length > 0 ? (
            <div className="firms-status is-hit">
              <strong>{result.matched.length} hotspot{result.matched.length === 1 ? '' : 's'} detected</strong>{' '}
              during the burn window.
              <ul className="firms-hotspot-list">
                {result.matched.map((h, i) => (
                  <li key={i}>
                    {h.sensor.replace('_NRT', '').replace('_', ' ')} · {h.acqDate} {h.acqTime.padStart(4, '0')} UTC ·
                    FRP {h.frp.toFixed(1)} MW · confidence {h.confidence}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="firms-status is-miss">
              <strong>No VIIRS/MODIS hotspot recorded</strong> in range that day
              {result.hotspots.length > 0 && ` (${result.hotspots.length} detection${result.hotspots.length === 1 ? '' : 's'} nearby, but outside the fire's time window)`}.
              <p className="muted small">
                This is common for a fire this size: VIIRS' smallest reliable pixel
                is ~375&nbsp;m, MODIS ~1&nbsp;km — a block-scale residential fire that
                burns out in a couple of hours can sit under that footprint or miss the
                satellite's 1–2 daily overpasses entirely, unlike a wildland fire that
                keeps radiating heat over a much larger area for longer.
              </p>
            </div>
          )}
        </>
      )}

      {hasKey && (
        <button className="chip-toggle" onClick={() => runCheck(fire)} disabled={loading}>
          Re-check
        </button>
      )}
    </section>
  );
}

/** Custom hook: reconstructed wind for `fire`, sampled at `minutes` since ignition. */
function useWindTrajectory(fire, minutes) {
  const [series, setSeries] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setSeries(null);
    setError(null);
    fetchHistoricalWind(fire.location, fire.startedAt, fire.containedAt)
      .then((data) => setSeries(data.hours))
      .catch((err) => setError(err.message));
  }, [fire.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = series ? windAt(series, timeAtOffset(fire, minutes)) : null;

  return { current, error, loading: !series && !error };
}

export default function HistoricalFireView({ onClose, onOverlayChange }) {
  const [fireId, setFireId] = useState(historicalFires[0]?.id ?? null);
  const [minutes, setMinutes] = useState(0);
  const [firmsHotspots, setFirmsHotspots] = useState([]);
  const fire = historicalFires.find((f) => f.id === fireId) ?? historicalFires[0];

  useEffect(() => { setMinutes(0); }, [fireId]);

  const { current: wind, error: windError, loading: windLoading } = useWindTrajectory(fire, minutes);
  const total = durationMinutes(fire);

  const fireNarrative = useMemo(() => {
    if (fire.id === 'taft-2026-08-12') {
      const current = new Date(new Date(fire.startedAt).getTime() + minutes * 60000);
      const hour = current.getHours() + current.getMinutes() / 60;
      if (hour < 13) return 'Fire drift: N → NNW.';
      if (hour >= 15) return 'Fire drift: NNW → NNE by 3:00 PM.';
      return 'Fire drift: N → NNW → NNE.';
    }

    return null;
  }, [fire, minutes]);

  const spread = useMemo(() => {
    if (!wind) return null;

    const visibleMinutes = Math.max(minutes, 1);

    if (fire.id === 'taft-2026-08-12') {
      const actualEnd = [9.779611111, 125.49199996];
      const actualBearing = bearingBetween(fire.location, actualEnd);
      const current = new Date(new Date(fire.startedAt).getTime() + visibleMinutes * 60000);
      const hour = current.getHours() + current.getMinutes() / 60;
      const growthProgress = Math.min(Math.max((hour - 12) / 3, 0), 1);
      const tinyStart = 0.04 + growthProgress * 0.96;
      const angleOffset = Math.min(Math.max((hour - 14) / 1, 0), 1) * 6;
      const heading = (actualBearing + angleOffset) % 360;
      const drift = destination(fire.location, actualBearing, 0.5 + growthProgress * 10);
      const compactMinutes = Math.min(36, 2 + growthProgress * 34);
      return projectSpread({
        origin: drift,
        windFromDeg: (heading + 180) % 360,
        windKmh: 13,
        humidity: 58,
        fuel: 'dense_residential',
        minutes: Math.max(1, compactMinutes * tinyStart),
      });
    }

    return projectSpread({
      origin: fire.location,
      windFromDeg: wind.fromDeg,
      windKmh: wind.speedKmh,
      humidity: wind.humidity,
      fuel: fire.fuel,
      minutes: visibleMinutes,
    });
  }, [fire, wind, minutes, total]);

  useEffect(() => {
    if (!spread || !fire) {
      onOverlayChange?.(null);
      return;
    }
    onOverlayChange?.({
      fire: fire.location,
      spread,
      direction: destination(fire.location, spread.headBearing, spread.headDistanceM * 1.15),
      hotspots: firmsHotspots,
    });
  }, [fire, spread, firmsHotspots, onOverlayChange]);

  return (
    <div className="panel historical-fire-view">
      <div className="panel-head">
        <h2>Historical fires</h2>
        {onClose && (
          <button className="icon-button" onClick={onClose} aria-label="Close" title="Close">
            <span className="icon-close" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="historical-picker" role="tablist" aria-label="Pick a historical fire">
        {historicalFires.map((f) => (
          <button
            key={f.id}
            role="tab"
            aria-selected={f.id === fireId}
            className={`chip-toggle ${f.id === fireId ? 'is-active' : ''}`}
            onClick={() => setFireId(f.id)}
          >
            {new Date(f.startedAt).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', year: 'numeric' })}
            {' · '}{f.barangayName}
          </button>
        ))}
      </div>

      <div className="historical-map">
        <MapContainer key={fire.id} center={fire.location} zoom={16} className="map" zoomControl={false} scrollWheelZoom={false}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
          {spread && (
            <>
              <Polygon
                positions={spread.polygon}
                pathOptions={{ color: '#173564', fillColor: '#173564', fillOpacity: 0.22, weight: 2.5 }}
              >
                <Tooltip sticky>
                  +{Math.round(minutes)} min · ~{spread.estimatedStructures} structures modeled ·{' '}
                  {spread.headDistanceM.toFixed(0)} m {compassLabel(spread.headBearing)}
                </Tooltip>
              </Polygon>
              <Polyline
                positions={[fire.location, destination(fire.location, spread.headBearing, spread.headDistanceM * 1.15)]}
                pathOptions={{ color: '#173564', weight: 2, dashArray: '6 10' }}
              />
            </>
          )}
          {firmsHotspots.map((hotspot, idx) => (
            <CircleMarker
              key={`${hotspot.sensor}-${hotspot.acqDate}-${hotspot.acqTime}-${idx}`}
              center={[hotspot.lat, hotspot.lon]}
              radius={7}
              pathOptions={{ color: '#fff6f0', weight: 2, fillColor: '#ff7a00', fillOpacity: 0.9 }}
            >
              <Tooltip direction="top" sticky>
                {hotspot.sensor.replace('_NRT', '').replace('_', ' ')} · {hotspot.acqDate} {String(hotspot.acqTime || '0000').padStart(4, '0')} UTC · FRP {Number(hotspot.frp || 0).toFixed(1)} MW · confidence {hotspot.confidence}
              </Tooltip>
            </CircleMarker>
          ))}
          <CircleMarker
            center={fire.location}
            radius={8}
            pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#173564', fillOpacity: 1 }}
          >
            <Tooltip direction="top">Reported ignition point · {fire.locationNote}</Tooltip>
          </CircleMarker>
        </MapContainer>
      </div>

      <BurnPlayback fire={fire} minutes={minutes} onChange={setMinutes} />

      <section className="historical-facts">
        <h3>{fire.name}</h3>
        <dl className="stats historical-stats">
          <div><dt>Started</dt><dd>{clockLabel(fire.startedAt)}</dd></div>
          <div><dt>Contained</dt><dd>{clockLabel(fire.containedAt)}</dd></div>
          <div><dt>Duration</dt><dd>{(total / 60).toFixed(1)} h</dd></div>
          <div><dt>Families affected</dt><dd>{fire.familiesAffected ?? 'Not yet reported'}</dd></div>
          <div><dt>Houses affected</dt><dd>{fire.housesAffected ?? 'Not yet reported'}</dd></div>
          <div><dt>Cause</dt><dd>{fire.cause}</dd></div>
        </dl>
        <p className="incident-note">{fire.summary}</p>
        {fire.verificationNote && (
          <p className="historical-caveat">⚠ {fire.verificationNote}</p>
        )}
        <p className="muted small">
          Sources:{' '}
          {fire.sources.map((s, i) => (
            <span key={s.url}>
              {i > 0 && ' · '}
              <a href={s.url} target="_blank" rel="noreferrer">{s.label}</a>
            </span>
          ))}
        </p>
      </section>

      <SatelliteCheck fire={fire} onHotspotsChange={setFirmsHotspots} />

      <footer className="disclaimer">
        Fire location is an approximate barangay/purok-level pin, not a verified
        geocode. The spread shading is this app's live-fire physics model run
        backward with reconstructed historical wind — a plausible reconstruction,
        not a confirmed burn perimeter.
      </footer>
    </div>
  );
}