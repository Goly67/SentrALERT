import { SURIGAO_CENTER } from '../data/surigao.js';
import { distanceMeters } from './geo.js';

export const FALLBACK_WIND = {
  speedKmh: 14,
  fromDeg: 65,
  humidity: 78,
  source: 'fallback',
  observedAt: null,
};

/** Shown instead of guessing when a fire's own wind could not be loaded. */
export const UNKNOWN_WIND = {
  speedKmh: 0,
  fromDeg: 0,
  humidity: null,
  source: 'unavailable',
  observedAt: null,
};

const WIND_CACHE_MS = 5 * 60 * 1000;
const WIND_RETRY_BACKOFF_MS = 5 * 60 * 1000;
// Fires this close to the city centre can share the city's reading.
const CITY_WIND_RADIUS_M = 15000;
let windCache = null;
let windRequest = null;
let windRetryAt = 0;
const cellCache = new Map();

/**
 * Live wind from Open-Meteo's forecast model (free, no API key). `fromDeg`
 * follows the meteorological convention: the direction the wind is coming FROM.
 */
async function requestWind([lat, lng]) {
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${lat}&longitude=${lng}` +
    '&current=wind_speed_10m,wind_direction_10m,relative_humidity_2m' +
    '&wind_speed_unit=kmh&timezone=Asia%2FManila';

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather service returned ${res.status}`);
  const { current: c } = await res.json();
  return {
    speedKmh: c.wind_speed_10m,
    fromDeg: c.wind_direction_10m,
    humidity: c.relative_humidity_2m,
    source: 'open-meteo',
    observedAt: c.time,
  };
}

/** The city's wind, for the weather card. Never fails: it falls back to a typical reading. */
export async function fetchWind(location = SURIGAO_CENTER, forceRefresh = false) {
  if (!forceRefresh && windCache && Date.now() - windCache.cachedAt < WIND_CACHE_MS) return windCache.value;
  if (windRequest && !forceRefresh) return windRequest;
  if (!forceRefresh && Date.now() < windRetryAt) return windCache?.value ?? FALLBACK_WIND;

  windRequest = requestWind(location)
    .then((value) => {
      windCache = { value, cachedAt: Date.now() };
      return value;
    })
    .catch(() => {
      windRetryAt = Date.now() + WIND_RETRY_BACKOFF_MS;
      return windCache?.value ?? FALLBACK_WIND;
    })
    .finally(() => { windRequest = null; });
  return windRequest;
}

/** Weather-model cells are about 11 km wide, so nearby fires share one reading. */
export const windCell = ([lat, lng]) => `${lat.toFixed(1)},${lng.toFixed(1)}`;

/** Wind at a fire. Unlike fetchWind this returns null on failure: a guess here would mislead. */
export async function fetchWindAt(location) {
  const key = windCell(location);
  const cached = cellCache.get(key);
  if (cached && Date.now() - cached.cachedAt < WIND_CACHE_MS) return cached.value;
  try {
    const value = await requestWind(location);
    cellCache.set(key, { value, cachedAt: Date.now() });
    return value;
  } catch {
    return cached?.value ?? null;
  }
}

/** Best wind for a fire: its own, or the city's when it is close enough to share. */
export function windForFire(location, cityWind, localWinds = {}) {
  const local = localWinds[windCell(location)];
  if (local) return local;
  return distanceMeters(location, SURIGAO_CENTER) <= CITY_WIND_RADIUS_M ? cityWind : UNKNOWN_WIND;
}
