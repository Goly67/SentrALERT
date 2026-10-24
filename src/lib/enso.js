const REFRESH_MS = 6 * 60 * 60 * 1000;
let cached = null;
let cachedAt = 0;
let request = null;

function phaseFor(rows) {
  const latest = rows.at(-1);
  const recent = rows.slice(-5);
  if (recent.length === 5 && recent.every(({ oni }) => oni >= 0.5)) return 'El Niño';
  if (recent.length === 5 && recent.every(({ oni }) => oni <= -0.5)) return 'La Niña';
  if (latest.oni >= 0.5) return 'El Niño signal';
  if (latest.oni <= -0.5) return 'La Niña signal';
  if (latest.oni >= 0.2) return 'Warm ENSO signal';
  if (latest.oni <= -0.2) return 'Cool ENSO signal';
  return 'Near-neutral';
}

function parseOniText(text) {
  const rows = [];
  const pattern = /^\s*([A-Z]{3})\s+(\d{4})\s+[-\d.]+\s+(-?\d+(?:\.\d+)?)/gm;
  for (const match of text.matchAll(pattern)) {
    rows.push({ season: match[1], year: Number(match[2]), oni: Number(match[3]) });
  }
  return rows;
}

async function fetchContext() {
  const url = import.meta.env.DEV ? '/api/enso-index' : '/api/enso';
  const response = await fetch(url);
  if (!response.ok) throw new Error(`ENSO feed returned ${response.status}`);
  if (import.meta.env.DEV) {
    const rows = parseOniText(await response.text()).slice(-6);
    if (rows.length < 5) throw new Error('ENSO feed contained too few readings');
    return { latest: rows.at(-1), recent: rows, phase: phaseFor(rows), source: 'NOAA CPC ONI' };
  }
  return response.json();
}

/** Read the NOAA Oceanic Niño Index, cached for six hours. */
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
