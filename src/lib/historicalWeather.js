/**
 * Reconstructs the wind a past fire actually burned in, from Open-Meteo's
 * free Historical Weather (ERA5-based reanalysis) archive — no API key,
 * same "no key needed" deal as lib/wind.js's live forecast, just the
 * `/v1/archive` endpoint instead of `/v1/forecast`.
 *
 * This is reanalysis data (station + satellite + radar + model blend), not
 * a single ground station reading, so treat it as a good reconstruction of
 * the general wind push during the burn, not a minute-by-minute logbook.
 */

const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
const cache = new Map();

function dateOnly(iso) {
  return iso.slice(0, 10);
}

/**
 * Hourly wind speed/direction/humidity for the calendar day(s) spanning
 * `startedAt`..`containedAt` (both ISO strings with an explicit offset), at
 * `[lat, lng]`. Returns { hours: [{ time, speedKmh, fromDeg, humidity }] }
 * or null if the service is unreachable — callers should fall back to a
 * static "wind data unavailable" state rather than guessing a direction.
 */
export async function fetchHistoricalWind([lat, lng], startedAt, containedAt) {
  const startDate = dateOnly(startedAt);
  const endDate = dateOnly(containedAt);
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}|${startDate}|${endDate}`;
  if (cache.has(key)) return cache.get(key);

  const query = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lng.toFixed(4),
    start_date: startDate,
    end_date: endDate,
    hourly: 'wind_speed_10m,wind_direction_10m,relative_humidity_2m,precipitation',
    wind_speed_unit: 'kmh',
    timezone: 'Asia/Manila',
  });

  const promise = fetch(`${ARCHIVE_URL}?${query}`)
    .then((res) => {
      if (!res.ok) throw new Error(`Historical weather service returned ${res.status}`);
      return res.json();
    })
    .then((body) => {
      const h = body.hourly;
      if (!h?.time) throw new Error('Historical weather response missing hourly data');
      const hours = h.time.map((time, i) => ({
        time,
        speedKmh: h.wind_speed_10m[i],
        fromDeg: h.wind_direction_10m[i],
        humidity: h.relative_humidity_2m[i],
        precipitationMm: h.precipitation?.[i] ?? 0,
      }));
      return { hours };
    })
    .catch((err) => {
      cache.delete(key);
      throw err;
    });

  cache.set(key, promise);
  return promise;
}

/**
 * Linear-interpolate wind at `atIso` (an ISO timestamp inside the fetched
 * range) from the hourly series. Falls back to the nearest hour at the
 * edges instead of extrapolating.
 */
export function windAt(hours, atIso) {
  if (!hours?.length) return null;
  const target = new Date(atIso).getTime();
  const stamped = hours.map((h) => ({ ...h, t: new Date(h.time).getTime() }));
  if (target <= stamped[0].t) return stamped[0];
  if (target >= stamped[stamped.length - 1].t) return stamped[stamped.length - 1];

  for (let i = 0; i < stamped.length - 1; i += 1) {
    const a = stamped[i];
    const b = stamped[i + 1];
    if (target >= a.t && target <= b.t) {
      const f = (target - a.t) / (b.t - a.t);
      // Direction is circular — interpolate the short way around, not
      // straight-line (which breaks badly crossing 0°/360°).
      let delta = ((b.fromDeg - a.fromDeg + 540) % 360) - 180;
      return {
        time: atIso,
        speedKmh: a.speedKmh + (b.speedKmh - a.speedKmh) * f,
        fromDeg: (a.fromDeg + delta * f + 360) % 360,
        humidity: a.humidity + (b.humidity - a.humidity) * f,
      };
    }
  }
  return stamped[stamped.length - 1];
}