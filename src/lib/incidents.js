import { barangays } from '../data/surigao.js';
import surigaoBarangayBoundaries from '../data/surigaoBarangays.json' with { type: 'json' };
import { bfpStations } from '../data/bfpStations.js';
import { distanceMeters, compassLabel } from './geo.js';
import { projectHorizons, FUEL_PROFILES } from './fireSpread.js';
import { classifyAlarm } from './alarmLevels.js';
import { triage, CLUSTER_RADIUS_M, CLUSTER_WINDOW_MIN } from './verification.js';

const ACTIVE_FIRE_WINDOW_MS = 24 * 60 * 60 * 1000;

function hasValidLocation(location) {
  return Array.isArray(location) &&
    location.length >= 2 &&
    Number.isFinite(location[0]) &&
    Number.isFinite(location[1]) &&
    location[0] >= -90 && location[0] <= 90 &&
    location[1] >= -180 && location[1] <= 180;
}

function pointInRing([lat, lng], ring) {
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [x1, y1] = ring[j];
    const [x2, y2] = ring[i];
    const cross = (lng - x1) * (y2 - y1) - (lat - y1) * (x2 - x1);
    const onSegment = Math.abs(cross) < 1e-10 &&
      lng >= Math.min(x1, x2) - 1e-10 && lng <= Math.max(x1, x2) + 1e-10 &&
      lat >= Math.min(y1, y2) - 1e-10 && lat <= Math.max(y1, y2) + 1e-10;

    if (onSegment) return true;

    if ((y1 > lat) !== (y2 > lat) && lng < ((x2 - x1) * (lat - y1)) / (y2 - y1) + x1) {
      inside = !inside;
    }
  }

  return inside;
}

function pointInGeometry(location, geometry) {
  const polygons = geometry.type === 'Polygon'
    ? [geometry.coordinates]
    : geometry.type === 'MultiPolygon'
      ? geometry.coordinates
      : [];

  return polygons.some(([outer, ...holes]) => (
    pointInRing(location, outer) && !holes.some((hole) => pointInRing(location, hole))
  ));
}

/** Barangay containing a point, falling back to the nearest known center. */
export function resolveBarangay(location) {
  const boundaryMatch = surigaoBarangayBoundaries.features.find(({ geometry }) => (
    pointInGeometry(location, geometry)
  ));

  if (boundaryMatch) {
    const name = boundaryMatch.properties.NAME_3;
    return barangays.find((barangay) => barangay.name === name) ?? {
      id: `brgy-${boundaryMatch.properties.ID_3}`,
      name,
      center: location,
      fuel: 'mixed_residential',
    };
  }

  let best = barangays[0];
  let bestDist = Infinity;
  for (const b of barangays) {
    const d = distanceMeters(location, b.center);
    if (d < bestDist) {
      bestDist = d;
      best = b;
    }
  }
  return best;
}

/** Group reports that describe the same fire. */
function clusterReports(reports) {
  const sorted = [...reports].sort(
    (a, b) => new Date(a.reportedAt) - new Date(b.reportedAt)
  );
  const clusters = [];

  for (const report of sorted) {
    const match = clusters.find((cluster) => {
      const head = cluster[0];
      const gapMin = Math.abs(new Date(report.reportedAt) - new Date(head.reportedAt)) / 60000;
      return (
        gapMin <= CLUSTER_WINDOW_MIN &&
        distanceMeters(report.location, head.location) <= CLUSTER_RADIUS_M
      );
    });
    if (match) match.push(report);
    else clusters.push([report]);
  }
  return clusters;
}

function centroid(points) {
  const lat = points.reduce((s, p) => s + p[0], 0) / points.length;
  const lng = points.reduce((s, p) => s + p[1], 0) / points.length;
  return [lat, lng];
}

/**
 * Turn raw reports into incidents with spread projections and an alarm level.
 * Everything is derived — no stored status, so re-running after new reports
 * arrive automatically re-escalates without anyone touching a queue.
 */
export function buildIncidents(reports, wind, airQualitySignals = [], thermalHotspots = []) {
  const now = Date.now();
  const airQualityActive = airQualitySignals.some((signal) => {
    const detectedAt = new Date(signal.detectedAt).getTime();
    return Number.isFinite(detectedAt) && now - detectedAt <= 30 * 60 * 1000;
  });
  const activeReports = reports.filter((report) => {
    if (!report || !hasValidLocation(report.location)) return false;
    const status = report.status ?? 'approved';
    if (status === 'rejected' || status === 'pending') return false;
    const reportedAt = new Date(report.reportedAt).getTime();
    return Number.isFinite(reportedAt) && now - reportedAt <= ACTIVE_FIRE_WINDOW_MS;
  });
  const clusters = clusterReports(activeReports);

  return clusters
    .map((cluster) => {
      const primary = cluster[0];
      const location = centroid(cluster.map((r) => r.location));
      const barangay = resolveBarangay(location);
      const fuel = barangay.fuel;

      const thermalActive = thermalHotspots.some((hotspot) =>
        distanceMeters(location, [hotspot.lat, hotspot.lon]) <= 2000
      );
      const result = triage(primary, cluster, airQualityActive, thermalActive);
      const spreadParams = {
        origin: location,
        windFromDeg: wind.fromDeg,
        windKmh: wind.speedKmh,
        humidity: wind.humidity,
        fuel,
      };
      const projections = projectHorizons(spreadParams);

      const thirtyMin = projections.find((p) => p.minutes === 30) ?? projections[0];
      const minutesElapsed = (now - new Date(primary.reportedAt)) / 60000;
      const alarm = classifyAlarm({
        estimatedStructures: thirtyMin.estimatedStructures,
        corroboration: cluster.length,
        minutesElapsed,
        held: result.status === 'monitoring' && cluster.length < 5,
      });

      const headDirection = compassLabel(thirtyMin.headBearing);
      const stations = [...bfpStations]
        .map((s) => ({ ...s, distanceM: distanceMeters(location, s.location) }))
        .sort((a, b) => a.distanceM - b.distanceM);

      return {
        id: primary.id,
        location,
        reports: cluster,
        reportedAt: primary.reportedAt,
        minutesElapsed,
        source: primary.source,
        note: primary.note,
        modelConfidence: Math.max(...cluster.map((r) => r.modelConfidence)),
        barangayId: barangay.id,
        barangayName: barangay.name,
        fuel,
        fuelLabel: FUEL_PROFILES[fuel].label,
        triage: result,
        spreadParams,
        projections,
        headDirection,
        projectionSummary: `${headDirection} at ${thirtyMin.rosMetresPerMin.toFixed(1)} m/min`,
        alarm,
        stations,
      };
    })
    .sort((a, b) => b.alarm.level - a.alarm.level || new Date(b.reportedAt) - new Date(a.reportedAt));
}
