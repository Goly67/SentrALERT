import barangayBoundaries from '../data/surigaoBarangays.json';
import { compassLabel } from './geo.js';

const EARTH_RADIUS_KM = 6371;
const DECAY_DISTANCE_KM = 1.8;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function distanceKm([latA, lonA], [latB, lonB]) {
  const radians = Math.PI / 180;
  const deltaLat = (latB - latA) * radians;
  const deltaLon = (lonB - lonA) * radians;
  const haversine = Math.sin(deltaLat / 2) ** 2
    + Math.cos(latA * radians) * Math.cos(latB * radians) * Math.sin(deltaLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(haversine));
}

function destinationKm([lat, lon], bearing, distance) {
  const radians = Math.PI / 180;
  const angularDistance = distance / EARTH_RADIUS_KM;
  const lat1 = lat * radians;
  const lon1 = lon * radians;
  const bearingRadians = bearing * radians;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance)
      + Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearingRadians)
  );
  const lon2 = lon1 + Math.atan2(
    Math.sin(bearingRadians) * Math.sin(angularDistance) * Math.cos(lat1),
    Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
  );
  return [lat2 / radians, lon2 / radians];
}

function representativePoint(geometry) {
  const ring = geometry?.type === 'Polygon'
    ? geometry.coordinates?.[0]
    : geometry?.type === 'MultiPolygon'
      ? geometry.coordinates?.[0]?.[0]
      : null;
  if (!ring?.length) return null;
  const totals = ring.reduce(([lon, lat], point) => [lon + point[0], lat + point[1]], [0, 0]);
  return [totals[1] / ring.length, totals[0] / ring.length];
}

function riskBand(score) {
  if (score >= 60) return 'elevated';
  if (score >= 30) return 'moderate';
  return 'lower';
}

function confidenceBand(count) {
  if (count >= 5) return 'high';
  if (count >= 2) return 'moderate';
  return 'low';
}

function kernel(distance) {
  return Math.exp(-0.5 * (distance / DECAY_DISTANCE_KM) ** 2);
}

/**
 * A screening index that combines recorded fire locations with current wind
 * direction/speed, humidity, and NOAA ONI. It is not a calibrated probability
 * or a validated forecast; point confidence reflects evidence count only.
 */
export function buildFireRiskFeatures(historicalFires = [], incidents = [], wind = {}, enso = {}) {
  const cases = [
    ...historicalFires.map((fire) => ({
      location: fire.location,
      name: fire.name,
      locationNote: fire.locationNote ?? '',
      date: fire.startedAt,
      weight: 1,
      // One primary government/BFP incident report verifies the event; multiple
      // independent sources also raise evidence confidence. Location accuracy
      // remains separately disclosed in each record's location note.
      confidence: fire.sources?.some((source) => source.authority === 'official')
        || fire.sources?.length >= 2 ? 'high' : 'moderate',
      type: 'documented historical fire',
    })),
    ...incidents.map((incident) => ({
      location: incident.location,
      name: incident.barangayName ?? incident.barangay ?? 'Reported fire',
      date: incident.startedAt ?? incident.reportedAt,
      weight: Math.min(1.5, 0.5 + (incident.reports?.length ?? 1) * 0.2),
      confidence: confidenceBand(incident.reports?.length ?? 1),
      type: 'Firebase fire report',
    })),
  ].filter((item) => Array.isArray(item.location) && item.location.length === 2
    && item.location.every(Number.isFinite));

  const speedKmh = Number.isFinite(wind.speedKmh) ? wind.speedKmh : 0;
  const windTo = Number.isFinite(wind.fromDeg) ? (wind.fromDeg + 180) % 360 : null;
  const humidity = Number.isFinite(wind.humidity) ? wind.humidity : 60;
  const oni = Number.isFinite(enso.latest?.oni) ? enso.latest.oni : null;
  const oniFactor = oni == null ? 1 : clamp(1 + oni * 0.12, 0.82, 1.18);
  const drynessFactor = clamp(1 + (60 - humidity) * 0.003, 0.88, 1.12);
  const windStrength = clamp(speedKmh / 35, 0, 1);
  const driftKm = Math.min(2.5, Math.max(0.1, speedKmh * 0.045));
  const projectedCases = windTo == null
    ? []
    : cases.map((item) => ({ ...item, location: destinationKm(item.location, windTo, driftKm) }));

  const zones = barangayBoundaries.features.flatMap((boundary) => {
    const center = representativePoint(boundary.geometry);
    if (!center) return [];
    const name = boundary.properties?.NAME_3 ?? 'Unknown barangay';
    const historyDensity = cases.reduce((total, item) => total + item.weight * kernel(distanceKm(center, item.location)), 0);
    const downwindDensity = projectedCases.reduce((total, item) => total + item.weight * kernel(distanceKm(center, item.location)), 0);
    const historySignal = 1 - Math.exp(-historyDensity);
    const spreadSignal = 1 - Math.exp(-downwindDensity);
    const climateFactor = oniFactor * drynessFactor;
    const score = Math.round(clamp(
      (historySignal * 65 + spreadSignal * windStrength * 35) * climateFactor,
      0,
      100
    ));
    const nearbyCount = cases.filter((item) => distanceKm(center, item.location) <= 2.5).length;
    const confidence = confidenceBand(nearbyCount);
    const band = riskBand(score);
    return [{ boundary, center, name, score, nearbyCount, confidence, band }];
  });

  const zonesOut = zones.map(({ boundary, center, name, score, nearbyCount, confidence, band }) => ({
    zone: {
      type: 'Feature',
      geometry: boundary.geometry,
      properties: { name, score, band, confidence, nearbyCount, windKmh: Math.round(speedKmh), windTo, oni, oniPhase: enso.phase ?? 'Unavailable' },
    },
    label: {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [center[1], center[0]] },
      properties: { name, score, band, confidence },
    },
  }));

  const history = cases.map((item) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [item.location[1], item.location[0]] },
    properties: {
      name: item.name,
      date: item.date ?? '',
      type: item.type,
      confidence: item.confidence,
      locationNote: item.locationNote,
    },
  }));

  return {
    zones: zonesOut.map((item) => item.zone),
    labels: zonesOut.map((item) => item.label),
    history,
    context: {
      windKmh: Math.round(speedKmh),
      windDirection: windTo == null ? 'unknown' : compassLabel(windTo),
      windSource: wind.source ?? 'unavailable',
      humidity: Math.round(humidity),
      oni,
      oniPhase: enso.phase ?? 'Unavailable',
      confidence: confidenceBand(cases.length),
      caseCount: cases.length,
    },
  };
}

