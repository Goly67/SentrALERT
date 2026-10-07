const PHIVOLCS_ENDPOINT = 'https://earthquakeapi.forestparty223.workers.dev/api/earthquakes';
const EARTHQUAKE_REQUEST_TIMEOUT_MS = 12_000;
const EARTHQUAKE_BULLETIN_PATH_PATTERN = /^\/\d{4}_Earthquake_Information\/[A-Za-z]+\/\d{4}(?:_\d{4})?_\d{4,}_B1F?\.html$/;
const EARTHQUAKE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const EARTH_RADIUS_KM = 6371;
const P_WAVE_SPEED_KM_S = 6;
const S_WAVE_SPEED_KM_S = 3.5;
const P_WAVE_MIN_DURATION_MS = 2800;
const P_WAVE_MAX_DURATION_MS = 18_000;
const WAVE_TIME_SCALE = 0.04;
const WAVE_HOLD_MS = 250;
const WAVE_FADE_MS = 1300;
const PHILIPPINES_BOUNDS = {
  minLatitude: 4,
  maxLatitude: 21,
  minLongitude: 116,
  maxLongitude: 127,
};

function parsePhivolcsTime(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return NaN;
  const text = String(value).trim();
  const parts = text.split(/\s+-\s+/);
  const dateText = parts.length === 2 ? `${parts[0]} ${parts[1]} GMT+0800` : text;
  return new Date(dateText).getTime();
}

function normalizePhivolcsEvent(event) {
  const latitude = Number(event.latitude ?? event.lat);
  const longitude = Number(event.longitude ?? event.lon);
  const magnitude = Number(event.magnitude);
  const time = parsePhivolcsTime(event.date_time ?? event.time);
  const depth = event.depth_km ?? event.depth;

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(magnitude) ||
    !Number.isFinite(time) ||
    latitude < PHILIPPINES_BOUNDS.minLatitude ||
    latitude > PHILIPPINES_BOUNDS.maxLatitude ||
    longitude < PHILIPPINES_BOUNDS.minLongitude ||
    longitude > PHILIPPINES_BOUNDS.maxLongitude
  ) {
    return null;
  }

  const id = String(event.id ?? event.details_link ?? `${time}-${latitude}-${longitude}`);
  const place = String(event.location ?? 'Philippines region')
    .replace(/^\d+\s*km\s*/i, '')
    .replace(/[\n\t]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

  return {
    id,
    latitude,
    longitude,
    depthKm: depth == null || !Number.isFinite(Number(depth)) ? null : Number(depth),
    magnitude,
    place,
    time,
    url: typeof event.details_link === 'string' ? event.details_link : '',
  };
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&nbsp;|&#160;|&#xA0;/gi, ' ')
    .replace(/&deg;|&#176;/gi, '°')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code) => {
      const number = code[0].toLowerCase() === 'x'
        ? Number.parseInt(code.slice(1), 16)
        : Number.parseInt(code, 10);
      return Number.isFinite(number) ? String.fromCodePoint(number) : '';
    });
}

function bulletinText(html) {
  return decodeHtmlEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/(?:p|td|tr|div|h[1-6])\s*>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  ).replace(/\s+/g, ' ').trim();
}

function extractBulletinField(text, label, followingLabels) {
  const nextLabels = followingLabels.map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const pattern = new RegExp(
    `${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:?\\s*(.*?)(?=${nextLabels ? `\\s*(?:${nextLabels})\\b` : '$'}|$)`,
    'i'
  );
  return text.match(pattern)?.[1]?.trim().replace(/\s*[.:;]\s*$/, '') ?? '';
}

export function parseEarthquakeBulletin(html) {
  if (typeof html !== 'string') {
    throw new TypeError('Earthquake bulletin HTML is required');
  }

  const text = bulletinText(html);
  const labels = ['Reported Intensities', 'Expecting Damage', 'Expecting Aftershocks', 'Issued On', 'Prepared by', 'IMPORTANT'];
  const intensity = extractBulletinField(text, 'Reported Intensities', labels.slice(1))
    .replace(/\b20\d{2}_(?:\d{4}_)?\d{4,}_M\d+D\d+_B1F?\b/gi, '')
    .trim();
  return {
    origin: extractBulletinField(text, 'Origin', ['Magnitude']),
    intensities: intensity,
    expectedDamage: extractBulletinField(text, 'Expecting Damage', labels.slice(2)),
    expectedAftershocks: extractBulletinField(text, 'Expecting Aftershocks', labels.slice(3)),
    issuedOn: extractBulletinField(text, 'Issued On', labels.slice(4)),
    preparedBy: extractBulletinField(text, 'Prepared by', ['IMPORTANT']),
  };
}

export function parseEarthquakeEvents(data, now = Date.now()) {
  if (!Array.isArray(data)) return [];
  return data
    .map(normalizePhivolcsEvent)
    .filter((event) => event && event.time >= now - EARTHQUAKE_WINDOW_MS && event.time <= now)
    .sort((a, b) => b.time - a.time);
}

export function parseLatestEarthquake(data) {
  return parseEarthquakeEvents(data)?.[0] ?? null;
}

export async function fetchEarthquakeEvents() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), EARTHQUAKE_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(PHIVOLCS_ENDPOINT, {
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Earthquake service returned ${response.status}`);
    return parseEarthquakeEvents(await response.json());
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchEarthquakeBulletin(eventUrl, signal) {
  let bulletinUrl;
  try {
    bulletinUrl = new URL(eventUrl);
  } catch {
    throw new Error('Earthquake bulletin link is invalid');
  }
  if (
    bulletinUrl.origin !== 'https://earthquake.phivolcs.dost.gov.ph' ||
    !EARTHQUAKE_BULLETIN_PATH_PATTERN.test(bulletinUrl.pathname)
  ) {
    throw new Error('Earthquake bulletin link is invalid');
  }

  const controller = new AbortController();
  const abortRequest = () => controller.abort();
  signal?.addEventListener('abort', abortRequest, { once: true });
  if (signal?.aborted) controller.abort();
  const timeoutId = setTimeout(() => controller.abort(), EARTHQUAKE_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      `/api/earthquake-bulletin?path=${encodeURIComponent(bulletinUrl.pathname)}`,
      { signal: controller.signal, cache: 'no-store' }
    );
    if (!response.ok) throw new Error(`Earthquake bulletin service returned ${response.status}`);
    if (response.headers?.get?.('content-type')?.includes('text/html')) {
      return parseEarthquakeBulletin(await response.text());
    }
    const bulletin = await response.json();
    if (!bulletin || typeof bulletin !== 'object' || Array.isArray(bulletin)) {
      throw new Error('Earthquake bulletin service returned invalid data');
    }
    return bulletin;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', abortRequest);
  }
}

export async function fetchLatestEarthquake() {
  return (await fetchEarthquakeEvents())[0];
}

export function earthquakeCoverageKm(magnitude) {
  return Math.max(5, Math.min(2500, 10 ** (0.9 * magnitude - 1)));
}

export function pWaveDurationMs(coverageKm) {
  return Math.max(
    P_WAVE_MIN_DURATION_MS,
    Math.min(P_WAVE_MAX_DURATION_MS, (coverageKm / P_WAVE_SPEED_KM_S) * 1000 * WAVE_TIME_SCALE)
  );
}

export function sWaveDurationMs(coverageKm) {
  return pWaveDurationMs(coverageKm) * (P_WAVE_SPEED_KM_S / S_WAVE_SPEED_KM_S);
}

export function getWaveAnimationFrame(elapsedMs, coverageKm, durationMs) {
  const growthProgress = Math.min(1, Math.max(0, elapsedMs / durationMs));
  const fadeProgress = Math.min(
    1,
    Math.max(0, (elapsedMs - durationMs - WAVE_HOLD_MS) / WAVE_FADE_MS)
  );

  return {
    radiusKm: coverageKm * growthProgress,
    opacity: 1 - fadeProgress,
    done: fadeProgress >= 1,
  };
}

export function waveCircleFeature(latitude, longitude, radiusKm, opacity, steps = 64) {
  if (radiusKm <= 0 || opacity <= 0) return null;

  const centerLat = (latitude * Math.PI) / 180;
  const centerLon = (longitude * Math.PI) / 180;
  const angularDistance = radiusKm / EARTH_RADIUS_KM;
  const ring = [];

  for (let step = 0; step < steps; step += 1) {
    const bearing = (step / steps) * 2 * Math.PI;
    const pointLat = Math.asin(
      Math.sin(centerLat) * Math.cos(angularDistance) +
      Math.cos(centerLat) * Math.sin(angularDistance) * Math.cos(bearing)
    );
    const pointLon = centerLon + Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(centerLat),
      Math.cos(angularDistance) - Math.sin(centerLat) * Math.sin(pointLat)
    );
    ring.push([(pointLon * 180) / Math.PI, (pointLat * 180) / Math.PI]);
  }
  ring.push(ring[0]);

  return {
    type: 'Feature',
    properties: { opacity },
    geometry: { type: 'Polygon', coordinates: [ring] },
  };
}
