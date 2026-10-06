import { SURIGAO_CENTER } from '../data/surigao.js';

export const FALLBACK_WIND = {
  speedKmh: 14,
  fromDeg: 65,
  humidity: 78,
  source: 'fallback',
  observedAt: null,
};

const WIND_CACHE_MS = 5 * 60 * 1000;
const WIND_RETRY_BACKOFF_MS = 5 * 60 * 1000;
let windCache = null;
let windRequest = null;
let windRetryAt = 0;

/**
 * Live wind from Open-Meteo (free, no API key). `fromDeg` follows the
 * meteorological convention: the direction the wind is coming FROM.
 */
export async function fetchWind([lat, lng] = SURIGAO_CENTER, forceRefresh = false) {
  if (!forceRefresh && windCache && Date.now() - windCache.cachedAt < WIND_CACHE_MS) return windCache.value;
  if (windRequest && !forceRefresh) return windRequest;
  if (!forceRefresh && Date.now() < windRetryAt) return windCache?.value ?? FALLBACK_WIND;
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${lat}&longitude=${lng}` +
    '&current=wind_speed_10m,wind_direction_10m,relative_humidity_2m' +
    '&wind_speed_unit=kmh&timezone=Asia%2FManila';

  windRequest = fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error(`Weather service returned ${res.status}`);
      return res.json();
    })
    .then((data) => {
      const c = data.current;
      const value = {
        speedKmh: c.wind_speed_10m,
        fromDeg: c.wind_direction_10m,
        humidity: c.relative_humidity_2m,
        source: 'open-meteo',
        observedAt: c.time,
      };
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
