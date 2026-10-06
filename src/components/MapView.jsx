import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  MapContainer, TileLayer, GeoJSON, Marker, Polygon, Polyline, Circle, CircleMarker, Pane, Tooltip, Popup, useMap, useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import { SURIGAO_CENTER } from '../data/surigao.js';
import { bfpStations } from '../data/bfpStations.js';
import { destination, USER_LOCATION_PERIMETER_M } from '../lib/geo.js';
import { popupNode } from '../lib/arcgis.js';
import { projectSpread } from '../lib/fireSpread.js';
import { HazeLayer } from './HazeUI.jsx';

// Frame that takes in Indonesia's fire belt and the whole Philippines.
const HAZE_BOUNDS = [[-9.5, 96], [21.5, 144]];
const MOBILE_HAZE_BOUNDS = [[-8.5, 108], [20.5, 132]];
const PHILIPPINES_FIRE_BOUNDS = [[4.5, 116], [21.5, 127.5]];

/** Flame glyph, flickering. Drawn rather than imported so it can be tinted. */
const flameSvg = `
<svg viewBox="0 0 24 32" aria-hidden="true">
  <path class="flame-depth" d="M12 0C12 6 5 8 5 16a7 7 0 0 0 14 0c0-4-2-6-3-9-1 3-4 3-4 0 0-3 0-5 0-7z" transform="translate(1.2 1.2)"/>
  <path class="flame-outer" d="M12 0C12 6 5 8 5 16a7 7 0 0 0 14 0c0-4-2-6-3-9-1 3-4 3-4 0 0-3 0-5 0-7z"/>
  <path class="flame-inner" d="M12 12c0 3-3 4-3 7a3.2 3.2 0 0 0 6.4 0c0-3-2.2-4-3.4-7z"/>
  <path class="flame-highlight" d="M8.5 11.5C7.2 14 6.5 16 7 18.1c.2 1.2.8 2.1 1.7 2.7-.6-2.2-.1-4.1 1.1-6.1z"/>
</svg>`;
const fireSmokeMarkup = '<span class="fire-smoke" aria-hidden="true"><span class="fire-smoke-puff" style="--i:0"></span><span class="fire-smoke-puff" style="--i:1"></span><span class="fire-smoke-puff" style="--i:2"></span></span>';

function incidentIcon(incident, isSelected, incidentState = 'active') {
  const held = incident.alarm.level === 0;
  const underControl = incidentState === 'under_control';
  const lightWarning = held && !underControl;
  const alarmColor = underControl ? '#2F6CFF' : incident.alarm.color;
  const badgeCode = underControl ? 'UC' : incident.alarm.code;
  const showFire = !held && !underControl;

  return L.divIcon({
    className: 'pin-wrap',
    html: `
      <span class="fire-pin ${lightWarning ? 'is-light' : ''} ${underControl ? 'is-under-control' : ''} ${isSelected ? 'is-selected' : ''}"
            style="--alarm:${alarmColor}">
        <span class="fire-ring"></span>
        <span class="fire-ring delay"></span>
        <span class="fire-glow"></span>
        ${showFire ? fireSmokeMarkup : ''}
        <span class="fire-flame">${showFire ? flameSvg : ''}</span>
        ${lightWarning ? '<span class="fire-smoke-dot"></span>' : ''}
        <span class="fire-code">${badgeCode}</span>
      </span>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

function satelliteFireIcon(hotspot) {
  const scale = hotspot.frp > 40 ? 1.18 : hotspot.frp > 12 ? 1.05 : 0.92;
  return L.divIcon({
    className: 'pin-wrap',
    html: `
      <span class="fire-pin satellite-fire-pin" style="--alarm:#FF7A00; --satellite-scale:${scale}">
        <span class="fire-ring"></span>
        <span class="fire-ring delay"></span>
        <span class="fire-glow"></span>
        ${fireSmokeMarkup}
        <span class="fire-flame">${flameSvg}</span>
      </span>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

/** Embers and smoke streaming downwind, rotated to the spread heading. */
function plumeIcon(bearing, intensity) {
  const embers = Array.from({ length: 7 })
    .map((_, i) => `<span class="ember" style="--i:${i}"></span>`)
    .join('');
  const smoke = Array.from({ length: 4 })
    .map((_, i) => `<span class="smoke" style="--i:${i}"></span>`)
    .join('');
  return L.divIcon({
    className: 'pin-wrap plume-wrap',
    html: `<span class="plume" style="--head:${bearing}deg; --intensity:${intensity}">${smoke}${embers}</span>`,
    iconSize: [1, 1],
    iconAnchor: [0, 0],
  });
}

function stationIcon(station) {
  return L.divIcon({
    className: 'pin-wrap',
    html: `
      <span class="bfp-badge is-${station.kind}">
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <path class="badge-cross" d="M16 2l3.4 6.1L26 5.3l-2.7 6.6 6.1 3.4-6.1 3.4L26 25.3l-6.6-2.8L16 30l-3.4-7.5L6 25.3l2.7-6.6L2.6 15.3l6.1-3.4L6 5.3l6.6 2.8z"/>
          <circle class="badge-core" cx="16" cy="16" r="6.4"/>
        </svg>
        <span class="bfp-text">BFP</span>
      </span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

// bfpStations never changes at runtime, so its icons are built once here
// instead of on every MapView render (which, with the haze layer playing,
// used to happen roughly twice a second and was the actual source of lag —
// every station badge was torn down and rebuilt each tick even though
// nothing about the stations had changed).
const STATION_MARKERS = bfpStations.map((station) => ({ station, icon: stationIcon(station) }));

function FlyTo({ location, railOpen }) {
  const map = useMap();
  useEffect(() => {
    if (!location) return undefined;
    const mobile = window.matchMedia('(max-width: 900px)').matches;
    const targetY = mobile && railOpen ? map.getSize().y * 0.28 : null;
    const moveSelectedFire = () => {
      if (targetY == null) return;
      const zoom = map.getZoom();
      const size = map.getSize();
      const projected = map.project(location, zoom);
      const desiredCenter = projected.add([0, size.y / 2 - targetY]);
      map.setView(map.unproject(desiredCenter, zoom), zoom, { animate: true, duration: 0.28 });
    };
    map.once('moveend', moveSelectedFire);
    map.flyTo(location, Math.max(map.getZoom(), mobile ? 13 : 16), { duration: 0.8 });
    return () => map.off('moveend', moveSelectedFire);
  }, [location, map, railOpen]);
  return null;
}

function ClickToPlace({ active, onPick }) {
  useMapEvents({
    click(event) {
      if (active) onPick([event.latlng.lat, event.latlng.lng]);
    },
  });
  return null;
}

function UserLocationPulse({ center }) {
  const [state, setState] = useState({ radius: 14, opacity: 0.9 });

  useEffect(() => {
    let rafId;
    let start = performance.now();

    const tick = (now) => {
      const elapsed = ((now - start) % 1800) / 1800;
      const radius = 14 + elapsed * 28;
      const opacity = 0.9 - elapsed * 0.9;
      setState({ radius, opacity });
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <CircleMarker
      center={center}
      radius={state.radius}
      pathOptions={{
        color: '#1677D2',
        weight: 3,
        fill: false,
        opacity: state.opacity,
        dashArray: '0',
      }}
    />
  );
}

function UserLocationMarker({ location, accuracy }) {
  if (!location) return null;
  return (
    <>
      {accuracy != null && (
        <Circle
          center={location}
          radius={USER_LOCATION_PERIMETER_M}
          pathOptions={{ color: '#1677D2', weight: 1, fillColor: '#1677D2', fillOpacity: 0.08 }}
        />
      )}
      <UserLocationPulse center={location} />
      <CircleMarker
        center={location}
        radius={8}
        pathOptions={{ color: '#1677D2', weight: 3, fillColor: '#fff', fillOpacity: 1 }}
      />
    </>
  );
}

/**
 * The haze view is regional (Indonesia to the Philippines), the fire view is
 * street level. Without this the map stays zoomed on Surigao when you switch
 * tabs and every hotspot is hundreds of kilometres off screen.
 */
function HazeViewport({ active }) {
  const map = useMap();
  const previous = useRef(active);
  useEffect(() => {
    if (previous.current === active) return; // first paint, or a StrictMode re-run
    previous.current = active;
    const mobile = window.matchMedia('(max-width: 900px)').matches;
    if (active) {
      map.flyToBounds(mobile ? MOBILE_HAZE_BOUNDS : HAZE_BOUNDS, {
        padding: mobile ? [28, 28] : [24, 24],
        paddingBottomRight: mobile ? [0, Math.round(window.innerHeight * 0.5)] : undefined,
        duration: 0.9,
      });
    } else {
      map.flyTo(SURIGAO_CENTER, mobile ? 13 : 14, { duration: 0.9 });
    }
  }, [active, map]);
  return null;
}

function NationalFireViewport({ active }) {
  const map = useMap();
  const previous = useRef(null);
  useEffect(() => {
    if (previous.current === active) return;
    previous.current = active;
    if (active) {
      map.flyToBounds(PHILIPPINES_FIRE_BOUNDS, {
        padding: [24, 24],
        paddingBottomRight: window.matchMedia('(max-width: 900px)').matches
          ? [0, Math.round(window.innerHeight * 0.28)]
          : undefined,
        duration: 0.9,
      });
    } else {
      map.flyTo(SURIGAO_CENTER, window.matchMedia('(max-width: 900px)').matches ? 13 : 14, { duration: 0.9 });
    }
  }, [active, map]);
  return null;
}

function confidenceLabel(value) {
  const code = String(value ?? '').trim().toLowerCase();
  if (Number.isFinite(Number(value))) return `${Number(value)}% (numeric satellite confidence)`;
  if (code === 'h' || code === 'high') return 'High';
  if (code === 'n' || code === 'nominal') return 'Nominal';
  if (code === 'l' || code === 'low') return 'Low';
  return value || 'Not reported';
}

function hotspotClassification(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric < 50) return 'Possible fire · not confirmed';
  return 'Possible satellite hotspot · not confirmed';
}

function sensorLabel(sensor) {
  const value = String(sensor ?? '');
  if (value === 'N') return 'Suomi NPP';
  if (value === 'N20') return 'NOAA-20';
  if (value === 'N21') return 'NOAA-21';
  return value
    .replace('_NRT', '')
    .replace('VIIRS_', 'VIIRS ')
    .replace('MODIS', 'MODIS');
}

function acquisitionLabel(value) {
  if (value == null || value === '') return 'Not reported';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${date.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' })} ${date.toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' })} PHT`;
}

function SatelliteHotspotMarker({ hotspot, index }) {
  const [copied, setCopied] = useState(false);
  const latitude = `${Math.abs(hotspot.lat).toFixed(6)}° ${hotspot.lat >= 0 ? 'N' : 'S'}`;
  const longitude = `${Math.abs(hotspot.lon).toFixed(6)}° ${hotspot.lon >= 0 ? 'E' : 'W'}`;
  const coordinates = `${hotspot.lat.toFixed(6)}, ${hotspot.lon.toFixed(6)}`;

  async function copyLocation() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(coordinates);
      } else {
        const input = document.createElement('textarea');
        input.value = coordinates;
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        input.remove();
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Marker
      key={`${hotspot.lat}-${hotspot.lon}-${hotspot.acqTime ?? index}`}
      position={[hotspot.lat, hotspot.lon]}
      icon={satelliteFireIcon(hotspot)}
    >
      <Popup className="satellite-hotspot-popup" closeButton>
        <div className="hotspot-popup-head">
          <span className="hotspot-popup-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: flameSvg }} />
          <div>
            <strong>{hotspotClassification(hotspot.confidence)}</strong>
            <span>Needs another satellite pass or ground confirmation</span>
          </div>
        </div>
        <div className="hotspot-popup-grid">
          <div><span>Latitude</span><b>{latitude}</b></div>
          <div><span>Longitude</span><b>{longitude}</b></div>
          <div><span>Pixel-integrated FRP</span><b>{hotspot.frp.toFixed(1)} MW</b></div>
          <div><span>Confidence</span><b>{confidenceLabel(hotspot.confidence)}</b></div>
          <div><span>Sensor</span><b>{sensorLabel(hotspot.sensor)}</b></div>
          <div><span>Acquired</span><b>{acquisitionLabel(hotspot.acqTime)}</b></div>
        </div>
        <button type="button" className="hotspot-copy" onClick={copyLocation}>
          <span aria-hidden="true">{copied ? '✓' : '⌗'}</span>
          {copied ? 'Location copied' : 'Copy coordinates'}
        </button>
        <p className="hotspot-popup-note">
          This hotspot was detected about {hotspot.hoursOld.toFixed(1)} h ago. FRP is pixel-integrated radiant power detected by the satellite, not the fire's size. The map toggle reports the newest hotspot anywhere in the Philippines. This is an approximate satellite pixel location, not an exact fire perimeter.
        </p>
      </Popup>
    </Marker>
  );
}

function NationalFireLayer({ hotspots }) {
  return hotspots.map((hotspot, index) => (
    <SatelliteHotspotMarker
      key={`${hotspot.lat}-${hotspot.lon}-${hotspot.acqTime ?? index}`}
      hotspot={hotspot}
      index={index}
    />
  ));
}

/** Cool-to-hot gradient for a Philippine temperature range. */
function tempColor(tempC) {
  if (typeof tempC !== 'number' || Number.isNaN(tempC)) return '#9AA3AE';
  if (tempC < 24) return '#2F8FE0';
  if (tempC < 27) return '#2FB0A6';
  if (tempC < 30) return '#173564';
  if (tempC < 33) return '#B3261E';
  return '#DC2F2F';
}

function cityTempIcon(city) {
  const hasTemp = typeof city.tempC === 'number' && !Number.isNaN(city.tempC);
  return L.divIcon({
    className: 'pin-wrap',
    html: `<span class="temp-chip" style="--temp-color:${tempColor(city.tempC)}">${hasTemp ? `${Math.round(city.tempC)}°` : '—'}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

/**
 * Public weather station readings are shown at the reporting station's
 * coordinates. The compact chip keeps dense station clusters readable.
 */
function CityTemperatureLayer({ cities }) {
  return cities.map((city) => {
    const hasTemp = typeof city.tempC === 'number' && !Number.isNaN(city.tempC);
    return (
      <Marker key={city.id} position={city.location} icon={cityTempIcon(city)} zIndexOffset={2500}>
        <Tooltip direction="top" offset={[0, -14]} opacity={1} className="temp-tooltip">
          {city.name}{city.stationName ? ` · ${city.stationName}` : ''}{hasTemp ? ` · ${Math.round(city.tempC)}°C` : ''}
        </Tooltip>
      </Marker>
    );
  });
}

function MobilePanelOffset({ railOpen }) {
  const map = useMap();
  const offsetRef = useRef(false);

  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 900px)').matches;
    if (!mobile || offsetRef.current === railOpen) return;
    offsetRef.current = railOpen;
    map.panBy([0, railOpen ? Math.round(window.innerHeight * 0.12) : -Math.round(window.innerHeight * 0.12)], {
      animate: true,
      duration: 0.28,
    });
  }, [map, railOpen]);

  return null;
}

/**
 * The side panel collapsing/expanding resizes .stage via a CSS grid-column
 * transition, not a DOM resize event, so Leaflet never hears about it and
 * keeps painting tiles at the old, narrower size — leaving a blank strip
 * where the panel used to be. Nudge it once the layout settles.
 */
function ResizeOnPanelToggle({ trigger }) {
  const map = useMap();
  useEffect(() => {
    const raf = requestAnimationFrame(() => map.invalidateSize({ animate: true }));
    // 280ms is the .app grid-column transition duration in styles.css;
    // this second call catches the final size once it's done animating.
    const afterTransition = setTimeout(() => map.invalidateSize({ animate: true }), 320);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(afterTransition);
    };
  }, [trigger, map]);
  return null;
}

/**
 * Everything about local fires (stations, pins, spread cone, report dots).
 * None of it depends on the haze frame or wind-advection playback, so it's
 * split out and memoized — otherwise every tick of the haze timeline
 * (roughly twice a second while playing) re-ran this whole tree, rebuilding
 * every marker icon from scratch even though nothing here had changed.
 * That icon churn, not the smoke cross-fade, was what read as "laggy".
 */
const LocalLayer = memo(function LocalLayer({
  incidents, incidentStateMap = {}, selectedId, onSelect, showStations, selected, active, live, horizonMinutes, pendingLocation,
}) {
  return (
    <>
      {showStations &&
        STATION_MARKERS.map(({ station, icon }) => (
          <Marker key={station.id} position={station.location} icon={icon}>
            <Tooltip direction="top" offset={[0, -14]}>
              <strong>{station.name}</strong>
              <br />
              {station.city} · {station.region}
              {station.contact && (
                <>
                  <br />
                  {station.contact}
                </>
              )}
            </Tooltip>
          </Marker>
        ))}

      {active && (
        <>
          {/* ghost outlines at the fixed horizons, for reference */}
          {selected.projections.map((p) => (
            <Polygon
              key={p.minutes}
              positions={p.polygon}
              pathOptions={{
                color: selected.alarm.color,
                fill: false,
                weight: 1,
                opacity: 0.35,
                dashArray: '2 7',
                className: 'ghost-ring',
              }}
            />
          ))}

          <Polygon
            positions={live.polygon}
            pathOptions={{
              color: selected.alarm.color,
              fillColor: selected.alarm.color,
              fillOpacity: 0.22,
              weight: 2.5,
              className: 'live-front',
            }}
          >
            <Tooltip sticky>
              {horizonMinutes} min · ~{live.estimatedStructures} structures ·{' '}
              {live.headDistanceM.toFixed(0)} m downwind
            </Tooltip>
          </Polygon>

          <Polyline
            positions={[
              selected.location,
              destination(selected.location, live.headBearing, live.headDistanceM * 1.15),
            ]}
            pathOptions={{
              color: selected.alarm.color,
              weight: 2,
              dashArray: '6 10',
              className: 'wind-vector',
            }}
          />

          <Marker
            position={selected.location}
            icon={plumeIcon(live.headBearing, Math.min(selected.alarm.level / 5, 1))}
            interactive={false}
          />
        </>
      )}

      {selected &&
        selected.reports.map((report) => (
          <CircleMarker
            key={report.id}
            center={report.location}
            radius={5}
            pathOptions={{
              color: '#ffffff',
              weight: 2,
              fillColor: '#2F6CFF',
              fillOpacity: 1,
              className: 'report-dot',
            }}
          >
            <Tooltip direction="top">{report.note}</Tooltip>
          </CircleMarker>
        ))}

      {incidents.map((incident) => (
        <Marker
          key={incident.id}
          position={incident.location}
          icon={incidentIcon(incident, incident.id === selectedId, incidentStateMap[incident.id] ?? 'active')}
          eventHandlers={{ click: () => onSelect(incident.id) }}
          // Leaflet stacks icon markers by screen y-position, not
          // importance, so a station badge, the wind plume, or even a
          // lower-priority "light warning" pin can land in front of an
          // active fire pin depending on where they fall on the map.
          // Rank by what actually matters: active fires above held/light
          // warnings above everything else, and the selected pin on top
          // of same-tier pins too.
          zIndexOffset={
            (incident.alarm.level > 0 ? 3000 : 1000) +
            (incident.id === selectedId ? 2000 : 0)
          }
        />
      ))}

      {pendingLocation && (
        <CircleMarker
          center={pendingLocation}
          radius={9}
          pathOptions={{ color: '#ffffff', weight: 2.5, fillColor: '#B3261E', fillOpacity: 1 }}
        >
          <Tooltip permanent direction="top">New report</Tooltip>
        </CircleMarker>
      )}
    </>
  );
});

export default function MapView({
  incidents,
  incidentStateMap = {},
  selectedId,
  onSelect,
  placing,
  pendingLocation,
  onPickLocation,
  horizonMinutes,
  showStations,
  railOpen,
  hazeMode = false,
  haze = null,
  hazeFrame = 0,
  hazeFocus = null,
  userLocation = null,
  userLocationAccuracy = null,
  localWeather = null,
  cityTemps = [],
  historicalOverlay = null,
  nationalFireMode = false,
  nationalFireHotspots = [],
  arcgisLayer = null,
}) {
  const selected = incidents.find((i) => i.id === selectedId);
  const selectedState = selected ? incidentStateMap[selected.id] ?? 'active' : 'active';
  const active = selectedState === 'active' && selected && selected.alarm.level > 0;

  const live = useMemo(
    () => (active ? projectSpread({ ...selected.spreadParams, minutes: horizonMinutes }) : null),
    [active, selected, horizonMinutes]
  );

  return (
    <MapContainer
      center={SURIGAO_CENTER}
      zoom={14}
      className={`map ${placing ? 'is-placing' : ''} ${nationalFireMode ? 'is-national-fire-mode' : ''}`}
      zoomControl={false}
    >
      <TileLayer
        className="tile-base"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />

      <ResizeOnPanelToggle trigger={railOpen} />
      <ClickToPlace active={placing} onPick={onPickLocation} />
      {selected && <FlyTo location={selected.location} railOpen={railOpen} />}
      <HazeViewport active={hazeMode} />
      <NationalFireViewport active={nationalFireMode} />
      <MobilePanelOffset railOpen={railOpen} />
      {hazeMode && (
        <HazeLayer
          data={haze}
          frame={hazeFrame}
          focus={hazeFocus}
        />
      )}

      {historicalOverlay && (
        <>
          <Polygon
            positions={historicalOverlay.spread.polygon}
            pathOptions={{
              color: '#173564',
              fillColor: '#173564',
              fillOpacity: 0.24,
              weight: 2.5,
              className: 'historical-fire-overlay',
            }}
          >
            <Tooltip sticky>
              Historical fire spread · {historicalOverlay.spread.headDistanceM.toFixed(0)} m downwind
            </Tooltip>
          </Polygon>
          <Polyline
            positions={[historicalOverlay.fire, historicalOverlay.direction]}
            pathOptions={{ color: '#173564', weight: 2, dashArray: '6 10' }}
          />
          {(historicalOverlay.hotspots ?? []).map((hotspot, idx) => (
            <CircleMarker
              key={`${hotspot.sensor}-${hotspot.acqDate}-${hotspot.acqTime}-${idx}`}
              center={[hotspot.lat, hotspot.lon]}
              radius={7}
              pathOptions={{ color: '#fff5ef', weight: 2, fillColor: '#ff7a00', fillOpacity: 0.9 }}
            >
              <Tooltip direction="top" sticky>
                {hotspot.sensor.replace('_NRT', '').replace('_', ' ')} · {hotspot.acqDate} {String(hotspot.acqTime || '0000').padStart(4, '0')} UTC · FRP {Number(hotspot.frp || 0).toFixed(1)} MW · confidence {hotspot.confidence}
              </Tooltip>
            </CircleMarker>
          ))}
          <CircleMarker
            center={historicalOverlay.fire}
            radius={8}
            pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#173564', fillOpacity: 1 }}
          >
            <Tooltip direction="top">Historical fire ignition</Tooltip>
          </CircleMarker>
        </>
      )}

      {nationalFireMode && (
        <NationalFireLayer hotspots={nationalFireHotspots} />
      )}
      {!nationalFireMode && <CityTemperatureLayer cities={cityTemps} />}
      <LocalLayer
        incidents={incidents}
        incidentStateMap={incidentStateMap}
        selectedId={selectedId}
        onSelect={onSelect}
        showStations={showStations}
        selected={selected}
        active={active}
        live={live}
        horizonMinutes={horizonMinutes}
        pendingLocation={pendingLocation}
      />
      {arcgisLayer && (
        <GeoJSON
          key={arcgisLayer.key}
          data={arcgisLayer.data}
          style={{ color: '#0FA38F', weight: 2, fillOpacity: 0.25 }}
          pointToLayer={(f, latlng) => L.circleMarker(latlng, { radius: 6, color: '#0E2240', weight: 2, fillColor: '#0FA38F', fillOpacity: 0.85 })}
          onEachFeature={(f, layer) => layer.bindPopup(popupNode(f.properties))}
        />
      )}
      <Pane name="userLocationPane" style={{ zIndex: 675 }}>
        <UserLocationMarker
          location={userLocation}
          accuracy={userLocationAccuracy}
        />
      </Pane>
    </MapContainer>
  );
}