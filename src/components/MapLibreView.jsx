import { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import mapLibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { SURIGAO_CENTER } from '../data/surigao.js';
import {
  BFP_CARAGA_FALLBACK_CONTACT,
  bfpStations,
  NATIONAL_EMERGENCY_CONTACT,
} from '../data/bfpStations.js';
import { destination, USER_LOCATION_PERIMETER_M } from '../lib/geo.js';
import { popupNode } from '../lib/arcgis.js';
import { projectSpread } from '../lib/fireSpread.js';
import { LEVELS, renderSmokeFrames, SMOKE_BOUNDS } from '../lib/haze.js';
import { temperatureFeel } from '../lib/localWeather.js';
import {
  earthquakeCoverageKm,
  getWaveAnimationFrame,
  pWaveDurationMs,
  sWaveDurationMs,
  waveCircleFeature,
} from '../lib/earthquakes.js';

maplibregl.setWorkerUrl(mapLibreWorkerUrl);

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const HAZE_BOUNDS = [[96, -9.5], [144, 21.5]];
const MOBILE_HAZE_BOUNDS = [[108, -8.5], [132, 20.5]];
const PHILIPPINES_FIRE_BOUNDS = [[116, 4.5], [127.5, 21.5]];
const EARTHQUAKE_ONLY_LAYERS = [
  'historical-spread', 'historical-direction', 'spread-ghosts', 'spread-live',
  'wind-direction', 'report-points', 'historical-hotspots', 'fire-hotspots',
  'haze-fires', 'haze-sources', 'haze-tracks', 'haze-ticks', 'haze-regions',
  'temperature-glow', 'temperatures', 'temperature-labels',
  'user-area', 'user-dot', 'pending-location', 'pending-label',
  'arcgis-polygons', 'arcgis-lines', 'arcgis-points',
];
const SOURCE_IDS = [
  'report-points', 'fire-hotspots', 'historical-hotspots',
  'haze-fires', 'haze-sources', 'haze-tracks', 'haze-ticks', 'haze-regions',
  'temperatures', 'user-area', 'pending-location',
  'earthquake-p-wave', 'earthquake-s-wave', 'earthquake-event',
];

const flameSvg = `
<svg viewBox="0 0 24 32" aria-hidden="true">
  <path class="flame-depth" d="M12 0C12 6 5 8 5 16a7 7 0 0 0 14 0c0-4-2-6-3-9-1 3-4 3-4 0 0-3 0-5 0-7z" transform="translate(1.2 1.2)"/>
  <path class="flame-outer" d="M12 0C12 6 5 8 5 16a7 7 0 0 0 14 0c0-4-2-6-3-9-1 3-4 3-4 0 0-3 0-5 0-7z"/>
  <path class="flame-inner" d="M12 12c0 3-3 4-3 7a3.2 3.2 0 0 0 6.4 0c0-3-2.2-4-3.4-7z"/>
  <path class="flame-highlight" d="M8.5 11.5C7.2 14 6.5 16 7 18.1c.2 1.2.8 2.1 1.7 2.7-.6-2.2-.1-4.1 1.1-6.1z"/>
</svg>`;
const fireSmokeMarkup = '<span class="fire-smoke" aria-hidden="true"><span class="fire-smoke-puff" style="--i:0"></span><span class="fire-smoke-puff" style="--i:1"></span><span class="fire-smoke-puff" style="--i:2"></span></span>';

const emptyCollection = () => ({ type: 'FeatureCollection', features: [] });
const asLngLat = ([lat, lon]) => [lon, lat];
const lineCoordinates = (points) => points.map(asLngLat);
const feature = (geometry, properties = {}) => ({ type: 'Feature', geometry, properties });
const collection = (features = []) => ({ type: 'FeatureCollection', features });

function polygonFeature(points, properties) {
  const ring = lineCoordinates(points);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) ring.push(first);
  return feature({ type: 'Polygon', coordinates: [ring] }, properties);
}

function circlePolygon(center, radiusM, steps = 48) {
  const [lat, lon] = center;
  const latRadius = radiusM / 111320;
  const lonRadius = radiusM / (111320 * Math.max(Math.cos((lat * Math.PI) / 180), 0.2));
  return Array.from({ length: steps + 1 }, (_, index) => {
    const angle = (index / steps) * Math.PI * 2;
    return [lon + Math.cos(angle) * lonRadius, lat + Math.sin(angle) * latRadius];
  });
}

function addSourceAndLayer(map, id, type, paint, layout = {}, beforeId) {
  if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: emptyCollection() });
  map.addLayer({ id, type, source: id, layout, paint }, beforeId);
}

function createEarthquakeStarImage() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create the earthquake star marker.');

  const center = 32;
  const outerRadius = 28;
  const innerRadius = 13;
  context.beginPath();
  for (let point = 0; point < 10; point += 1) {
    const radius = point % 2 === 0 ? outerRadius : innerRadius;
    const angle = -Math.PI / 2 + (point * Math.PI) / 5;
    const x = center + Math.cos(angle) * radius;
    const y = center + Math.sin(angle) * radius;
    if (point === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
  context.shadowColor = 'rgba(70, 12, 8, 0.55)';
  context.shadowBlur = 7;
  context.fillStyle = '#D92D20';
  context.fill();
  context.shadowBlur = 0;
  context.lineWidth = 4;
  context.strokeStyle = '#FFFFFF';
  context.stroke();

  return context.getImageData(0, 0, canvas.width, canvas.height);
}

function setData(map, id, data) {
  const source = map.getSource(id);
  if (source && typeof source.setData === 'function') source.setData(data);
}

function installOperationalLayers(map) {
  for (const id of SOURCE_IDS) {
    map.addSource(id, { type: 'geojson', data: emptyCollection() });
  }

  addSourceAndLayer(map, 'historical-spread', 'fill', {
    'fill-color': ['coalesce', ['get', 'color'], '#173564'],
    'fill-opacity': 0.22,
    'fill-outline-color': ['coalesce', ['get', 'color'], '#173564'],
  });
  addSourceAndLayer(map, 'historical-direction', 'line', {
    'line-color': '#173564', 'line-width': 2, 'line-dasharray': [2, 2],
  });
  addSourceAndLayer(map, 'spread-ghosts', 'line', {
    'line-color': ['get', 'color'], 'line-opacity': 0.38, 'line-width': 1, 'line-dasharray': [1, 2],
  });
  addSourceAndLayer(map, 'spread-live', 'fill', {
    'fill-color': ['get', 'color'], 'fill-opacity': 0.2,
    'fill-outline-color': ['get', 'color'],
  });
  addSourceAndLayer(map, 'wind-direction', 'line', {
    'line-color': ['get', 'color'], 'line-width': 2, 'line-dasharray': [2, 3],
  });
  addSourceAndLayer(map, 'report-points', 'circle', {
    'circle-radius': 5, 'circle-color': '#2F6CFF', 'circle-stroke-color': '#fff',
    'circle-stroke-width': 2,
  });
  addSourceAndLayer(map, 'historical-hotspots', 'circle', {
    'circle-radius': 7, 'circle-color': '#FF7A00', 'circle-opacity': 0.92,
    'circle-stroke-color': '#fff5ef', 'circle-stroke-width': 2,
  });
  addSourceAndLayer(map, 'fire-hotspots', 'circle', {
    'circle-radius': ['interpolate', ['linear'], ['get', 'frp'], 0, 3.8, 12, 5, 40, 7.5],
    'circle-color': ['case', ['>', ['get', 'frp'], 40], '#E85D04', '#FF7A00'],
    'circle-opacity': 0.96, 'circle-stroke-color': '#fff2df', 'circle-stroke-width': 1,
  });
  addSourceAndLayer(map, 'haze-fires', 'circle', {
    'circle-radius': ['interpolate', ['linear'], ['get', 'frp'], 0, 1.8, 12, 2.6, 40, 3.4],
    'circle-color': ['case', ['>', ['get', 'frp'], 40], '#E85D04', '#FF7A00'],
    'circle-opacity': 0.88,
  });
  addSourceAndLayer(map, 'haze-sources', 'circle', {
    'circle-radius': ['+', 6, ['/', ['get', 'strength'], 7]],
    'circle-color': '#2F6CFF', 'circle-opacity': 0.18,
    'circle-stroke-color': '#0E2240', 'circle-stroke-width': 1.5,
  });
  addSourceAndLayer(map, 'haze-tracks', 'line', {
    'line-color': ['case', ['==', ['get', 'reachesPH'], true], '#E23D35', '#7A6A5F'],
    'line-width': ['case', ['==', ['get', 'reachesPH'], true], 2.2, 1],
    'line-opacity': ['case', ['==', ['get', 'reachesPH'], true], 0.9, 0.45],
    'line-dasharray': [2, 3],
  });
  addSourceAndLayer(map, 'haze-ticks', 'circle', {
    'circle-radius': 4, 'circle-color': '#fff', 'circle-stroke-color': '#B3261E',
    'circle-stroke-width': 1.5,
  });
  addSourceAndLayer(map, 'haze-regions', 'circle', {
    'circle-radius': ['case', ['>', ['get', 'level'], 0], 9, 5],
    'circle-color': ['get', 'color'], 'circle-opacity': 0.9,
    'circle-stroke-color': '#fff', 'circle-stroke-width': 2,
  });
  map.addLayer({
    id: 'temperature-glow', type: 'circle', source: 'temperatures',
    paint: {
      'circle-radius': ['case', ['boolean', ['feature-state', 'hover'], false], 28, 21],
      'circle-color': ['get', 'color'],
      'circle-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.52, 0.3],
      'circle-blur': 0.75,
    },
  });
  map.addLayer({
    id: 'temperatures', type: 'circle', source: 'temperatures',
    paint: {
      'circle-radius': ['case', ['boolean', ['feature-state', 'hover'], false], 18, 15],
      'circle-color': ['get', 'color'], 'circle-opacity': 1,
      'circle-stroke-color': '#fff', 'circle-stroke-width': 2.5,
    },
  });
  map.addLayer({
    id: 'temperature-labels', type: 'symbol', source: 'temperatures',
    paint: { 'text-color': '#fff', 'text-halo-color': '#0E2240', 'text-halo-width': 1.2 },
    layout: {
      'text-field': ['get', 'label'], 'text-size': 12,
      'text-font': ['Noto Sans Regular'],
      'text-anchor': 'center', 'text-justify': 'center',
      'text-allow-overlap': true, 'text-ignore-placement': true,
    },
  });
  addSourceAndLayer(map, 'user-area', 'fill', {
    'fill-color': '#1677D2', 'fill-opacity': 0.08, 'fill-outline-color': '#1677D2',
  });
  addSourceAndLayer(map, 'user-dot', 'circle', {
    'circle-radius': 8, 'circle-color': '#fff', 'circle-stroke-color': '#1677D2',
    'circle-stroke-width': 3,
  });
  addSourceAndLayer(map, 'pending-location', 'circle', {
    'circle-radius': 10, 'circle-color': '#B3261E', 'circle-stroke-color': '#fff',
    'circle-stroke-width': 2.5,
  });
  addSourceAndLayer(map, 'pending-label', 'symbol', {
    'text-color': '#B3261E', 'text-halo-color': '#fff', 'text-halo-width': 1.5,
  }, {
    'text-field': 'New report', 'text-offset': [0, -1.6], 'text-size': 12,
    'text-font': ['Noto Sans Regular'], 'text-allow-overlap': true,
  });
  addSourceAndLayer(map, 'arcgis-polygons', 'fill', {
    'fill-color': '#0FA38F', 'fill-opacity': 0.25, 'fill-outline-color': '#0FA38F',
  });
  addSourceAndLayer(map, 'arcgis-lines', 'line', { 'line-color': '#0FA38F', 'line-width': 2 });
  addSourceAndLayer(map, 'arcgis-points', 'circle', {
    'circle-radius': 6, 'circle-color': '#0FA38F', 'circle-stroke-color': '#0E2240', 'circle-stroke-width': 2,
  });
  map.addLayer({
    id: 'earthquake-s-wave-fill', type: 'fill', source: 'earthquake-s-wave',
    paint: {
      'fill-color': '#F04438',
      'fill-opacity': ['*', ['coalesce', ['get', 'opacity'], 0], 0.13],
    },
  });
  map.addLayer({
    id: 'earthquake-s-wave-line', type: 'line', source: 'earthquake-s-wave',
    paint: {
      'line-color': '#F04438',
      'line-width': 2.5,
      'line-opacity': ['*', ['coalesce', ['get', 'opacity'], 0], 0.8],
    },
  });
  map.addLayer({
    id: 'earthquake-p-wave-fill', type: 'fill', source: 'earthquake-p-wave',
    paint: {
      'fill-color': '#F4C542',
      'fill-opacity': ['*', ['coalesce', ['get', 'opacity'], 0], 0.11],
    },
  });
  map.addLayer({
    id: 'earthquake-p-wave-line', type: 'line', source: 'earthquake-p-wave',
    paint: {
      'line-color': '#F4C542',
      'line-width': 2.5,
      'line-dasharray': [2, 1.5],
      'line-opacity': ['*', ['coalesce', ['get', 'opacity'], 0], 0.95],
    },
  });
  map.addLayer({
    id: 'earthquake-event-glow', type: 'circle', source: 'earthquake-event',
    paint: {
      'circle-radius': 23,
      'circle-color': '#D92D20',
      'circle-opacity': 0.22,
      'circle-blur': 0.35,
    },
  });
  map.addLayer({
    id: 'earthquake-event', type: 'circle', source: 'earthquake-event',
    layout: { 'circle-sort-key': ['case', ['boolean', ['get', 'latest'], false], 1, 0] },
    paint: {
      'circle-radius': [
        'case',
        ['boolean', ['get', 'latest'], false],
        10,
        ['interpolate', ['linear'], ['get', 'magnitude'], 0, 3.5, 5, 7, 7, 10],
      ],
      'circle-color': [
        'case',
        ['boolean', ['get', 'latest'], false],
        '#D92D20',
        ['step', ['get', 'magnitude'], '#F4C542', 3, '#F79009', 5, '#E5484D', 7, '#9A1B1B'],
      ],
      'circle-opacity': 0.9,
      'circle-stroke-color': '#FFFFFF',
      'circle-stroke-width': 3,
    },
  });
  map.addLayer({
    id: 'earthquake-event-label', type: 'symbol', source: 'earthquake-event',
    layout: {
      'text-field': ['get', 'label'],
      'text-size': 12,
      'text-font': ['Noto Sans Regular'],
      'text-anchor': 'bottom',
      'text-offset': [0, -1.25],
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: {
      'text-color': '#7A271A',
      'text-halo-color': '#FFFFFF',
      'text-halo-width': 1.5,
    },
  });
  map.addImage('earthquake-latest-star', createEarthquakeStarImage(), { pixelRatio: 2 });
  map.addLayer({
    id: 'earthquake-latest-star', type: 'symbol', source: 'earthquake-event',
    filter: ['==', ['get', 'latest'], true],
    layout: {
      'icon-image': 'earthquake-latest-star',
      'icon-size': 1.15,
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'symbol-sort-key': 1,
    },
  });

  if (map.getLayer('water')) map.setPaintProperty('water', 'fill-color', '#438BD1');
  if (map.getLayer('waterway_river')) map.setPaintProperty('waterway_river', 'line-color', '#438BD1');
  if (map.getLayer('waterway_other')) map.setPaintProperty('waterway_other', 'line-color', '#68A6E3');
}

function iconMarker(map, element, position, options = {}) {
  return new maplibregl.Marker({ element, anchor: options.anchor ?? 'center' })
    .setLngLat(asLngLat(position))
    .addTo(map);
}

function markerElement(className, title) {
  const element = document.createElement('div');
  element.className = className;
  element.setAttribute('role', 'img');
  element.setAttribute('aria-label', title);
  element.title = title;
  return element;
}

function fireMarker(incident, selected, status) {
  const held = incident.alarm.level === 0;
  const underControl = status === 'under_control';
  const alarmColor = underControl ? '#2F6CFF' : incident.alarm.color;
  const element = markerElement('map-fire-marker', `${incident.alarm.label}: ${incident.barangayName}`);
  const pin = document.createElement('span');
  pin.className = `fire-pin ${held && !underControl ? 'is-light' : ''} ${underControl ? 'is-under-control' : ''} ${selected ? 'is-selected' : ''}`;
  pin.style.setProperty('--alarm', alarmColor);
  pin.innerHTML = `<span class="fire-ring"></span><span class="fire-ring delay"></span><span class="fire-glow"></span>${!held && !underControl ? fireSmokeMarkup : ''}<span class="fire-flame">${!held && !underControl ? flameSvg : ''}</span>${held && !underControl ? '<span class="fire-smoke-dot"></span>' : ''}<span class="fire-code">${underControl ? 'UC' : incident.alarm.code}</span>`;
  element.appendChild(pin);
  return element;
}

function cityColor(tempC) {
  if (typeof tempC !== 'number' || Number.isNaN(tempC)) return '#9AA3AE';
  if (tempC < 24) return '#2F8FE0';
  if (tempC < 27) return '#2FB0A6';
  if (tempC < 30) return '#173564';
  if (tempC < 33) return '#B3261E';
  return '#DC2F2F';
}

function temperatureSummary(properties) {
  const tempC = Number(properties.label);
  const feel = temperatureFeel(tempC);
  return `${properties.name} ${properties.label}°C, ${feel.charAt(0).toUpperCase()}${feel.slice(1)}`;
}

function popupText(map, lngLat, text) {
  const node = document.createElement('div');
  node.className = 'sa-popup';
  node.textContent = text;
  new maplibregl.Popup({ closeButton: true, maxWidth: '280px' }).setLngLat(lngLat).setDOMContent(node).addTo(map);
}

function stationContactLines(station) {
  if (station.contact) {
    return [station.contact, station.contactNote].filter(Boolean);
  }
  const fallbackContacts = station.region.includes('Region XIII')
    ? [`BFP Caraga Regional Office: ${BFP_CARAGA_FALLBACK_CONTACT}`]
    : ['Regional BFP fallback number not listed'];
  return [...fallbackContacts, `National emergency: ${NATIONAL_EMERGENCY_CONTACT}`];
}

function earthquakePopupNode(properties, onSelectEarthquake) {
  const card = document.createElement('div');
  card.className = 'earthquake-popup';
  const magnitude = document.createElement('div');
  magnitude.textContent = `Magnitude ${Number(properties.magnitude).toFixed(1)}`;
  const depthLine = document.createElement('div');
  const depth = properties.depthKm === '' || properties.depthKm == null
    ? 'not reported'
    : `${Number(properties.depthKm).toFixed(1)} km`;
  depthLine.textContent = `Depth ${depth}`;
  const occurred = Number(properties.time);
  const formattedTime = Number.isFinite(occurred)
    ? new Date(occurred).toLocaleString('en-US', {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    })
    : 'Time unavailable';
  const timeLine = document.createElement('div');
  timeLine.textContent = formattedTime;
  card.append(magnitude, depthLine, timeLine);
  const reportButton = document.createElement('button');
  reportButton.type = 'button';
  reportButton.className = 'earthquake-popup-report';
  reportButton.textContent = 'View SentrALERT information';
  reportButton.addEventListener('click', () => onSelectEarthquake?.(properties.eventId));
  card.append(reportButton);
  return card;
}

function satellitePopup(map, lngLat, hotspot) {
  const popup = new maplibregl.Popup({ closeButton: true, maxWidth: '290px' });
  const box = document.createElement('div');
  box.className = 'satellite-popup';
  const heading = document.createElement('strong');
  heading.textContent = 'Possible satellite fire · not confirmed';
  const details = document.createElement('p');
  details.textContent = `FRP ${Number(hotspot.frp || 0).toFixed(1)} MW · confidence ${hotspot.confidence ?? 'not reported'} · ${hotspot.sensor ?? 'VIIRS'} · ${Number(hotspot.hoursOld ?? 0).toFixed(1)} h ago`;
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'secondary';
  copy.textContent = 'Copy coordinates';
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(`${hotspot.lat.toFixed(6)}, ${hotspot.lon.toFixed(6)}`);
      copy.textContent = 'Location copied';
    } catch (error) {
      copy.textContent = 'Copy unavailable';
      copy.title = error instanceof Error ? error.message : 'Clipboard permission was denied.';
    }
  });
  box.append(heading, details, copy);
  popup.setLngLat(lngLat).setDOMContent(box).addTo(map);
}

function splitArcGIS(data) {
  const groups = { polygons: [], lines: [], points: [] };
  for (const item of data?.features ?? []) {
    const type = item.geometry?.type;
    const target = type === 'Polygon' || type === 'MultiPolygon'
      ? groups.polygons
      : type === 'LineString' || type === 'MultiLineString'
        ? groups.lines
        : type === 'Point' || type === 'MultiPoint'
          ? groups.points
          : null;
    if (target) target.push(item);
  }
  return groups;
}

function MapLibreView({
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
  earthquake = null,
  selectedEarthquake = null,
  earthquakeEvents = [],
  earthquakeLoaded = false,
  earthquakeError = '',
  earthquakeMode = false,
  onSelectEarthquake,
  is3d = true,
  onMapReady,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [map, setMap] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [mapError, setMapError] = useState('');
  const selected = incidents.find((incident) => incident.id === selectedId);
  const status = selected ? incidentStateMap[selected.id] ?? 'active' : 'active';
  const active = Boolean(selected && status === 'active' && selected.alarm.level > 0);
  const live = useMemo(
    () => active ? projectSpread({ ...selected.spreadParams, minutes: horizonMinutes }) : null,
    [active, selected, horizonMinutes]
  );
  const smokeUrls = useMemo(
    () => haze?.frames ? renderSmokeFrames(haze.frames) : null,
    [haze]
  );

  useEffect(() => {
    if (!containerRef.current) return undefined;
    const instance = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: [SURIGAO_CENTER[1], SURIGAO_CENTER[0]],
      zoom: 14,
      pitch: 52,
      bearing: -12,
      maxPitch: 75,
      attributionControl: {
        customAttribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> · <a href="https://openfreemap.org">OpenFreeMap</a>',
      },
      cooperativeGestures: false,
    });
    mapRef.current = instance;
    setMap(instance);
    onMapReady?.(instance);
    instance.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    instance.on('load', () => {
      try {
        installOperationalLayers(instance);
        setLoaded(true);
        setMapError('');
      } catch (error) {
        setMapError(error instanceof Error ? error.message : 'The map style could not be prepared.');
      }
    });
    instance.on('error', (event) => {
      if (!instance.isStyleLoaded()) {
        setMapError(event.error?.message || 'The free map style could not be loaded. Check your connection.');
      }
    });
    return () => {
      instance.remove();
      mapRef.current = null;
      onMapReady?.(null);
      setMap(null);
      setLoaded(false);
    };
  }, [onMapReady]);

  useEffect(() => {
    if (!map || !loaded) return undefined;
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(containerRef.current);
    const timeout = window.setTimeout(() => map.resize(), 340);
    return () => {
      observer.disconnect();
      window.clearTimeout(timeout);
    };
  }, [map, loaded, railOpen]);

  useEffect(() => {
    if (!map || !loaded) return undefined;
    const handleMapClick = (event) => {
      if (placing) onPickLocation([event.lngLat.lat, event.lngLat.lng]);
    };
    const updateCursor = (event) => {
      const clickable = map.queryRenderedFeatures(event.point, {
        layers: ['fire-hotspots', 'haze-sources', 'haze-regions', 'arcgis-polygons', 'arcgis-lines', 'arcgis-points', 'earthquake-event'],
      });
      map.getCanvas().style.cursor = placing ? 'crosshair' : clickable.length ? 'pointer' : '';
    };
    const clearCursor = () => { map.getCanvas().style.cursor = ''; };
    let hoveredTemperatureId = null;
    const temperaturePopup = new maplibregl.Popup({
      closeButton: false, closeOnClick: false, maxWidth: 'none', offset: 20,
    });
    const temperatureEnter = (event) => {
      const item = event.features?.[0];
      if (!item || item.id == null) return;
      hoveredTemperatureId = item.id;
      map.setFeatureState({ source: 'temperatures', id: item.id }, { hover: true });
      const node = document.createElement('div');
      node.className = 'temperature-popup';
      node.textContent = temperatureSummary(item.properties);
      temperaturePopup.setDOMContent(node).setLngLat(event.lngLat).addTo(map);
    };
    const temperatureMove = (event) => {
      if (temperaturePopup.isOpen()) temperaturePopup.setLngLat(event.lngLat);
    };
    const temperatureLeave = () => {
      if (hoveredTemperatureId != null) {
        map.setFeatureState({ source: 'temperatures', id: hoveredTemperatureId }, { hover: false });
        hoveredTemperatureId = null;
      }
      temperaturePopup.remove();
    };
    const hotspotClick = (event) => {
      const item = event.features?.[0];
      const hotspot = nationalFireHotspots[Number(item?.properties?.index)];
      if (hotspot) satellitePopup(map, event.lngLat, hotspot);
    };
    const sourceClick = (event) => {
      const properties = event.features?.[0]?.properties;
      if (properties) popupText(map, event.lngLat, `${properties.area}: ${properties.count} hotspots · ${Math.round(properties.frp)} MW`);
    };
    const regionClick = (event) => {
      const properties = event.features?.[0]?.properties;
      if (properties) popupText(map, event.lngLat, `${properties.name}: ${properties.label}`);
    };
    const reportClick = (event) => {
      const note = event.features?.[0]?.properties?.note;
      if (note) popupText(map, event.lngLat, note);
    };
    const historicalHotspotClick = (event) => {
      const label = event.features?.[0]?.properties?.label;
      if (label) popupText(map, event.lngLat, label);
    };
    const arcgisFeatureClick = (event) => {
      const properties = event.features?.[0]?.properties;
      if (properties) {
        new maplibregl.Popup({ closeButton: true, maxWidth: '280px' })
          .setLngLat(event.lngLat)
          .setDOMContent(popupNode(properties))
          .addTo(map);
      }
    };
    const earthquakeClick = (event) => {
      const properties = event.features?.[0]?.properties;
      if (!properties) return;
      new maplibregl.Popup({ closeButton: true, maxWidth: '320px' })
        .setLngLat(event.lngLat)
        .setDOMContent(earthquakePopupNode(properties, onSelectEarthquake))
        .addTo(map);
    };
    map.on('click', handleMapClick);
    map.on('mousemove', updateCursor);
    map.on('mouseout', clearCursor);
    map.on('mouseenter', 'temperatures', temperatureEnter);
    map.on('mousemove', 'temperatures', temperatureMove);
    map.on('mouseleave', 'temperatures', temperatureLeave);
    map.on('click', 'fire-hotspots', hotspotClick);
    map.on('click', 'haze-sources', sourceClick);
    map.on('click', 'haze-regions', regionClick);
    map.on('click', 'report-points', reportClick);
    map.on('click', 'historical-hotspots', historicalHotspotClick);
    for (const layerId of ['arcgis-polygons', 'arcgis-lines', 'arcgis-points']) {
      map.on('click', layerId, arcgisFeatureClick);
    }
    map.on('click', 'earthquake-event', earthquakeClick);
    return () => {
      map.off('click', handleMapClick);
      map.off('mousemove', updateCursor);
      map.off('mouseout', clearCursor);
      map.off('mouseenter', 'temperatures', temperatureEnter);
      map.off('mousemove', 'temperatures', temperatureMove);
      map.off('mouseleave', 'temperatures', temperatureLeave);
      temperaturePopup.remove();
      map.off('click', 'fire-hotspots', hotspotClick);
      map.off('click', 'haze-sources', sourceClick);
      map.off('click', 'haze-regions', regionClick);
      map.off('click', 'report-points', reportClick);
      map.off('click', 'historical-hotspots', historicalHotspotClick);
      for (const layerId of ['arcgis-polygons', 'arcgis-lines', 'arcgis-points']) {
        map.off('click', layerId, arcgisFeatureClick);
      }
      map.off('click', 'earthquake-event', earthquakeClick);
    };
  }, [map, loaded, placing, onPickLocation, nationalFireHotspots, onSelectEarthquake]);

  useEffect(() => {
    if (!map || !loaded) return;
    const visible = nationalFireMode ? 'visible' : 'none';
    map.setLayoutProperty('fire-hotspots', 'visibility', visible);
  }, [map, loaded, nationalFireMode, hazeMode]);

  useEffect(() => {
    if (!map || !loaded) return;
    const features = [];
    for (const incident of incidents) {
      const currentStatus = incidentStateMap[incident.id] ?? 'active';
      if (currentStatus === 'fire_out') continue;
      for (const projection of incident.projections ?? []) {
        features.push(polygonFeature(projection.polygon, { color: incident.alarm.color }));
      }
    }
    setData(map, 'spread-ghosts', collection(features));
  }, [map, loaded, incidents, incidentStateMap]);

  useEffect(() => {
    if (!map || !loaded) return;
    const features = [];
    if (active && live && selected) {
      features.push(polygonFeature(live.polygon, { color: selected.alarm.color }));
    }
    setData(map, 'spread-live', collection(features));
    setData(map, 'wind-direction', collection(active && live && selected ? [
      feature({
        type: 'LineString',
        coordinates: lineCoordinates([
          selected.location,
          destination(selected.location, live.headBearing, live.headDistanceM * 1.15),
        ]),
      }, { color: selected.alarm.color }),
    ] : []));
    setData(map, 'report-points', collection(selected
      ? (selected.reports ?? []).map((report) => feature({
        type: 'Point', coordinates: asLngLat(report.location),
      }, { note: report.note ?? '' }))
      : []));
    setData(map, 'historical-spread', collection(historicalOverlay ? [
      polygonFeature(historicalOverlay.spread.polygon, { color: '#173564' }),
    ] : []));
    setData(map, 'historical-direction', collection(historicalOverlay ? [
      feature({ type: 'LineString', coordinates: lineCoordinates([historicalOverlay.fire, historicalOverlay.direction]) }),
    ] : []));
    setData(map, 'historical-hotspots', collection((historicalOverlay?.hotspots ?? []).map((hotspot) => feature({
      type: 'Point', coordinates: [hotspot.lon, hotspot.lat],
    }, { label: `${hotspot.sensor} · FRP ${Number(hotspot.frp || 0).toFixed(1)} MW` }))));
  }, [map, loaded, active, live, selected, historicalOverlay]);

  useEffect(() => {
    if (!map || !loaded) return;
    const fires = nationalFireHotspots.map((hotspot, index) => feature({
      type: 'Point', coordinates: [hotspot.lon, hotspot.lat],
    }, { index, frp: Number(hotspot.frp) || 0 }));
    setData(map, 'fire-hotspots', collection(fires));
  }, [map, loaded, nationalFireHotspots]);

  useEffect(() => {
    if (!map || !loaded) return;
    const smokeUrl = smokeUrls?.[hazeFrame];
    const smokeCoordinates = [
      [SMOKE_BOUNDS[0][1], SMOKE_BOUNDS[1][0]],
      [SMOKE_BOUNDS[1][1], SMOKE_BOUNDS[1][0]],
      [SMOKE_BOUNDS[1][1], SMOKE_BOUNDS[0][0]],
      [SMOKE_BOUNDS[0][1], SMOKE_BOUNDS[0][0]],
    ];
    if (hazeMode && smokeUrl) {
      const smokeSource = map.getSource('haze-smoke');
      if (smokeSource && typeof smokeSource.updateImage === 'function') {
        smokeSource.updateImage({ url: smokeUrl, coordinates: smokeCoordinates });
      } else if (!smokeSource) {
        map.addSource('haze-smoke', {
          type: 'image',
          url: smokeUrl,
          coordinates: smokeCoordinates,
        });
        map.addLayer(
          { id: 'haze-smoke', type: 'raster', source: 'haze-smoke', paint: { 'raster-opacity': 0.74 } },
          'haze-fires'
        );
      }
      if (map.getLayer('haze-smoke')) map.setLayoutProperty('haze-smoke', 'visibility', 'visible');
    } else if (map.getLayer('haze-smoke')) {
      map.setLayoutProperty('haze-smoke', 'visibility', 'none');
    }
    setData(map, 'haze-fires', collection(hazeMode ? (haze?.fires ?? []).map((fire) => feature({
      type: 'Point', coordinates: [fire.lon, fire.lat],
    }, { frp: Number(fire.frp) || 0 })) : []));
    const clusters = hazeMode ? haze?.clusters ?? [] : [];
    setData(map, 'haze-sources', collection(clusters.map((cluster) => feature({
      type: 'Point', coordinates: [cluster.lon, cluster.lat],
    }, { area: cluster.area, count: cluster.count, frp: cluster.frp, strength: cluster.strength }))));
    setData(map, 'haze-tracks', collection(clusters.filter((cluster) => cluster.path?.length > 1).map((cluster) => feature({
      type: 'LineString', coordinates: lineCoordinates(cluster.path),
    }, { reachesPH: Boolean(cluster.reachesPH) }))));
    setData(map, 'haze-ticks', collection(clusters.filter((cluster) => cluster.path?.length > 16 && cluster.reachesPH)
      .flatMap((cluster) => [8, 16].map((index) => feature({
        type: 'Point', coordinates: asLngLat(cluster.path[index]),
      }, { area: cluster.area, hours: index * 3 })))));
    setData(map, 'haze-regions', collection(hazeMode ? (haze?.regions ?? []).map((region) => {
      const level = region.levels[hazeFrame];
      return feature({ type: 'Point', coordinates: asLngLat(region.center) }, {
        level, color: LEVELS[level].color,
        name: region.name, label: LEVELS[level].label,
      });
    }) : []));
  }, [map, loaded, hazeMode, haze, hazeFrame, smokeUrls]);

  useEffect(() => {
    if (!map || !loaded) return;
    for (const layerId of EARTHQUAKE_ONLY_LAYERS) {
      const visibility = earthquakeMode
        ? 'none'
        : layerId === 'fire-hotspots' && !nationalFireMode
          ? 'none'
          : 'visible';
      if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', visibility);
    }
    if (map.getLayer('haze-smoke')) {
      map.setLayoutProperty('haze-smoke', 'visibility', earthquakeMode ? 'none' : hazeMode ? 'visible' : 'none');
    }
  }, [map, loaded, earthquakeMode, hazeMode, nationalFireMode]);

  useEffect(() => {
    if (!map || !loaded) return;
    const temperatureFeatures = !nationalFireMode ? cityTemps.map((city, index) => ({
      ...feature({ type: 'Point', coordinates: asLngLat(city.location) }, {
        color: cityColor(city.tempC),
        label: typeof city.tempC === 'number' ? `${Math.round(city.tempC)}` : '—',
        name: city.name,
      }),
      id: index,
    })) : [];
    setData(map, 'temperatures', collection(temperatureFeatures));
    setData(map, 'user-area', collection(userLocation && userLocationAccuracy != null ? [
      feature({ type: 'Polygon', coordinates: [circlePolygon(userLocation, USER_LOCATION_PERIMETER_M)] }),
    ] : []));
    setData(map, 'user-dot', collection(userLocation ? [
      feature({ type: 'Point', coordinates: asLngLat(userLocation) }),
    ] : []));
    setData(map, 'pending-location', collection(pendingLocation ? [
      feature({ type: 'Point', coordinates: asLngLat(pendingLocation) }),
    ] : []));
    setData(map, 'pending-label', collection(pendingLocation ? [
      feature({ type: 'Point', coordinates: asLngLat(pendingLocation) }),
    ] : []));
    const arcgis = splitArcGIS(arcgisLayer?.data);
    setData(map, 'arcgis-polygons', collection(arcgis.polygons));
    setData(map, 'arcgis-lines', collection(arcgis.lines));
    setData(map, 'arcgis-points', collection(arcgis.points));
    setData(map, 'earthquake-event', collection(earthquakeMode ? earthquakeEvents.map((event) => ({
      ...feature({ type: 'Point', coordinates: [event.longitude, event.latitude] }, {
        label: event.id === earthquake?.id ? `M ${event.magnitude.toFixed(1)} · Epicenter` : '',
        place: event.place,
        magnitude: event.magnitude,
        depthKm: event.depthKm ?? '',
        time: event.time,
        eventId: event.id,
        latest: event.id === earthquake?.id,
      }),
      id: event.id,
    })) : []));
  }, [map, loaded, cityTemps, nationalFireMode, userLocation, userLocationAccuracy, pendingLocation, arcgisLayer, earthquake, earthquakeEvents, earthquakeMode]);

  useEffect(() => {
    if (!map || !loaded || !earthquakeMode || !earthquake) return undefined;

    const coverageKm = earthquakeCoverageKm(earthquake.magnitude);
    const pDuration = pWaveDurationMs(coverageKm);
    const sDuration = sWaveDurationMs(coverageKm);
    const startedAt = performance.now();
    let animationFrame = 0;

    const animate = (now) => {
      const elapsed = now - startedAt;
      const pWave = getWaveAnimationFrame(elapsed, coverageKm, pDuration);
      const sWave = getWaveAnimationFrame(elapsed, coverageKm, sDuration);
      const pFeature = waveCircleFeature(
        earthquake.latitude, earthquake.longitude, pWave.radiusKm, pWave.opacity
      );
      const sFeature = waveCircleFeature(
        earthquake.latitude, earthquake.longitude, sWave.radiusKm, sWave.opacity
      );

      setData(map, 'earthquake-p-wave', collection(pFeature ? [pFeature] : []));
      setData(map, 'earthquake-s-wave', collection(sFeature ? [sFeature] : []));
      if (pWave.done && sWave.done) {
        setData(map, 'earthquake-p-wave', emptyCollection());
        setData(map, 'earthquake-s-wave', emptyCollection());
        return;
      }
      animationFrame = requestAnimationFrame(animate);
    };

    setData(map, 'earthquake-p-wave', emptyCollection());
    setData(map, 'earthquake-s-wave', emptyCollection());
    animationFrame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(animationFrame);
      setData(map, 'earthquake-p-wave', emptyCollection());
      setData(map, 'earthquake-s-wave', emptyCollection());
    };
  }, [
    map, loaded, earthquakeMode, earthquake?.id, earthquake?.latitude, earthquake?.longitude, earthquake?.magnitude,
  ]);

  useEffect(() => {
    if (!map || !loaded || !earthquakeMode || !selectedEarthquake) return;
    map.flyTo({
      center: [selectedEarthquake.longitude, selectedEarthquake.latitude],
      zoom: Math.max(map.getZoom(), 6.5),
      duration: 700,
    });
  }, [map, loaded, earthquakeMode, selectedEarthquake?.id]);

  useEffect(() => {
    if (!map || !loaded) return undefined;
    if (earthquakeMode) return undefined;
    const markers = [];
    const stationPopups = [];
    const currentStations = showStations
      ? bfpStations.map((station) => {
        const element = markerElement(`bfp-badge is-${station.kind}`, `${station.name} · ${station.city}`);
        element.setAttribute('role', 'button');
        element.tabIndex = 0;
        element.innerHTML = '<svg viewBox="0 0 32 32" aria-hidden="true"><path class="badge-cross" d="M16 2l3.4 6.1L26 5.3l-2.7 6.6 6.1 3.4-6.1 3.4L26 25.3l-6.6-2.8L16 30l-3.4-7.5L6 25.3l2.7-6.6L2.6 15.3l6.1-3.4L6 5.3l6.6 2.8z"/><circle class="badge-core" cx="16" cy="16" r="6.4"/></svg><span class="bfp-text">BFP</span>';
        const phonePopup = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
          maxWidth: '260px',
          offset: 22,
          className: 'bfp-hover-popup',
        });
        stationPopups.push(phonePopup);
        const phoneNode = document.createElement('div');
        phoneNode.className = 'bfp-hover-card';
        const stationName = document.createElement('strong');
        stationName.textContent = station.name;
        phoneNode.append(stationName);
        for (const line of stationContactLines(station)) {
          const contactLine = document.createElement('span');
          contactLine.textContent = line;
          phoneNode.append(contactLine);
        }
        const showPhone = () => {
          phonePopup.setLngLat(asLngLat(station.location)).setDOMContent(phoneNode).addTo(map);
        };
        const hidePhone = () => phonePopup.remove();
        element.addEventListener('mouseenter', showPhone);
        element.addEventListener('mouseleave', hidePhone);
        element.addEventListener('focus', showPhone);
        element.addEventListener('blur', hidePhone);
        element.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            element.click();
          }
        });
        element.addEventListener('click', () => {
          const details = [
            station.name,
            `${station.city} · ${station.region}`,
            ...stationContactLines(station),
          ].join('\n');
          popupText(map, asLngLat(station.location), details);
        });
        return iconMarker(map, element, station.location);
      })
      : [];
    markers.push(...currentStations);
    for (const incident of incidents) {
      const currentStatus = incidentStateMap[incident.id] ?? 'active';
      if (currentStatus === 'fire_out') continue;
      const element = fireMarker(incident, incident.id === selectedId, currentStatus);
      const marker = iconMarker(map, element, incident.location);
      element.addEventListener('click', () => onSelect(incident.id));
      markers.push(marker);
    }
    if (active && selected && live) {
      const plume = markerElement('plume-wrap', `Wind direction ${live.headBearing}°`);
      plume.innerHTML = `<span class="plume" style="--head:${live.headBearing}deg; --intensity:${Math.min(selected.alarm.level / 5, 1)}">${Array.from({ length: 4 }, (_, i) => `<span class="smoke" style="--i:${i}"></span>`).join('')}${Array.from({ length: 7 }, (_, i) => `<span class="ember" style="--i:${i}"></span>`).join('')}</span>`;
      markers.push(iconMarker(map, plume, selected.location));
    }
    if (userLocation) {
      const user = markerElement('user-location-marker', 'Your location');
      markers.push(iconMarker(map, user, userLocation));
    }
    return () => {
      markers.forEach((marker) => marker.remove());
      stationPopups.forEach((popup) => popup.remove());
    };
  }, [map, loaded, incidents, incidentStateMap, selectedId, onSelect, showStations, cityTemps, nationalFireMode, active, selected, live, userLocation, earthquakeMode]);

  useEffect(() => {
    if (!map || !loaded) return;
    const isMobile = window.matchMedia('(max-width: 900px)').matches;
    if (earthquakeMode) {
      map.flyTo({
        center: earthquake
          ? [earthquake.longitude, earthquake.latitude]
          : [SURIGAO_CENTER[1], SURIGAO_CENTER[0]],
        zoom: earthquake ? 6.5 : 6,
        pitch: is3d ? 35 : 0,
        duration: 900,
      });
    } else if (hazeMode) {
      map.fitBounds(isMobile ? MOBILE_HAZE_BOUNDS : HAZE_BOUNDS, {
        padding: isMobile
          ? { top: 28, right: 28, bottom: Math.round(window.innerHeight * 0.5), left: 28 }
          : 28,
        duration: 900,
      });
    } else if (nationalFireMode) {
      map.fitBounds(PHILIPPINES_FIRE_BOUNDS, {
        padding: isMobile
          ? { top: 24, right: 24, bottom: Math.round(window.innerHeight * 0.28), left: 24 }
          : 24,
        duration: 900,
      });
    } else {
      map.flyTo({
        center: selected && !placing ? asLngLat(selected.location) : [SURIGAO_CENTER[1], SURIGAO_CENTER[0]],
        zoom: selected && !placing ? Math.max(map.getZoom(), isMobile ? 13 : 16) : isMobile ? 13 : 14,
        pitch: is3d ? 52 : 0,
        duration: 850,
      });
    }
  }, [map, loaded, hazeMode, nationalFireMode, earthquakeMode, earthquake?.id, is3d]);

  useEffect(() => {
    if (!map || !loaded || !selected || hazeMode || nationalFireMode || earthquakeMode || placing) return;
    map.flyTo({
      center: asLngLat(selected.location),
      zoom: Math.max(map.getZoom(), window.matchMedia('(max-width: 900px)').matches ? 13 : 16),
      offset: window.matchMedia('(max-width: 900px)').matches && railOpen
        ? [0, -Math.round(map.getCanvas().clientHeight * 0.22)]
        : [0, 0],
      duration: 800,
    });
  }, [map, loaded, selectedId, hazeMode, nationalFireMode, earthquakeMode, placing, railOpen]);

  useEffect(() => {
    if (map && loaded && hazeFocus) {
      const mobileOffset = window.matchMedia('(max-width: 900px)').matches && railOpen
        ? [0, -Math.round(map.getCanvas().clientHeight * 0.22)]
        : [0, 0];
      map.flyTo({ center: asLngLat(hazeFocus), zoom: 7, offset: mobileOffset, duration: 900 });
    }
  }, [map, loaded, hazeFocus, railOpen]);

  useEffect(() => {
    if (!map || !loaded) return;
    map.easeTo({ pitch: is3d ? 52 : 0, duration: 650 });
  }, [map, loaded, is3d]);

  return (
    <div className={`map maplibre-map ${placing ? 'is-placing' : ''} ${nationalFireMode ? 'is-national-fire-mode' : ''}`}>
      <div ref={containerRef} className="maplibre-canvas" />
      {earthquakeMode && <section className="earthquake-display" aria-label="Latest earthquake display">
        {earthquake ? (
          <>
            <button
              type="button"
              className="earthquake-display-focus"
              onClick={() => onSelectEarthquake?.(earthquake.id)}
              aria-label={`Open SentrALERT information for latest earthquake, magnitude ${earthquake.magnitude.toFixed(1)}, ${earthquake.place}`}
            >
              <span className="earthquake-display-eyebrow">Latest earthquake</span>
              <span className="earthquake-display-details">
                <strong>Magnitude {earthquake.magnitude.toFixed(1)}</strong>
                <strong>Depth {earthquake.depthKm == null ? 'not reported' : `${earthquake.depthKm.toFixed(1)} km`}</strong>
                <time dateTime={new Date(earthquake.time).toISOString()}>
                  {new Date(earthquake.time).toLocaleString('en-US', {
                    month: 'numeric',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </time>
                <span className="earthquake-display-report-link">Open SentrALERT information →</span>
              </span>
            </button>
            <div className="earthquake-wave-legend" aria-label="Seismic wave legend">
              <span><i className="earthquake-wave-dot is-p" />P-wave · faster</span>
              <span><i className="earthquake-wave-dot is-s" />S-wave · slower</span>
            </div>
            {earthquakeError && (
              <p className="earthquake-display-error" role="status">
                Live update failed; showing the last event. {earthquakeError}
              </p>
            )}
          </>
        ) : (
          <div className="earthquake-display-empty" role="status">
            <strong>Earthquake monitor</strong>
            <span>
              {earthquakeError
                ? 'Latest events unavailable'
                : earthquakeLoaded
                  ? 'No earthquakes reported this week'
                  : 'Loading this week’s earthquakes…'}
            </span>
            {earthquakeError && <span className="earthquake-display-error">{earthquakeError}</span>}
          </div>
        )}
      </section>}
      {mapError && <div className="maplibre-error" role="status">Map unavailable: {mapError}</div>}
    </div>
  );
}

export default MapLibreView;
