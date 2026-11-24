import { parseOniText, parseWeeklyText, buildEnsoContext } from './ensoData.js';

const REFRESH_MS = 6 * 60 * 60 * 1000;
let cached = null;
let cachedAt = 0;
let request = null;

async function fetchContext() {
  if (import.meta.env.DEV) {
    // The dev server proxies NOAA's two text files (vite.config.js).
    const [oniResponse, weeklyText] = await Promise.all([
      fetch('/api/enso-index'),
      fetch('/api/enso-weekly').then((res) => (res.ok ? res.text() : '')).catch(() => ''),
    ]);
    if (!oniResponse.ok) throw new Error(`ENSO feed returned ${oniResponse.status}`);
    return buildEnsoContext(parseOniText(await oniResponse.text()), parseWeeklyText(weeklyText));
  }
  const response = await fetch('/api/enso');
  if (!response.ok) throw new Error(`ENSO feed returned ${response.status}`);
  return response.json();
}

/**
 * NOAA El Niño readings, cached for six hours: { latest, recent, phase,
 * history, weekly } (see src/lib/ensoData.js).
 */
export function fetchEnsoContext(forceRefresh = false) {
  if (!forceRefresh && cached && Date.now() - cachedAt < REFRESH_MS) return Promise.resolve(cached);
  if (request) return request;
  request = fetchContext()
    .then((value) => {
      cached = value;
      cachedAt = Date.now();
      return value;
    })
    .finally(() => { request = null; });
  return request;
}
