const NOAA_ONI_URL = 'https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt';
const REQUEST_TIMEOUT_MS = 12_000;

function parseOceanicNinoIndex(text) {
  const rows = [];
  const pattern = /^\s*([A-Z]{3})\s+(\d{4})\s+[-\d.]+\s+(-?\d+(?:\.\d+)?)/gm;
  let match = pattern.exec(text);
  while (match) {
    rows.push({ season: match[1], year: Number(match[2]), oni: Number(match[3]) });
    match = pattern.exec(text);
  }
  return rows;
}

function phaseFor(recent) {
  const lastFive = recent.slice(-5);
  if (lastFive.length === 5 && lastFive.every(({ oni }) => oni >= 0.5)) {
    return 'El Niño-range ONI for 5 overlapping seasons';
  }
  if (lastFive.length === 5 && lastFive.every(({ oni }) => oni <= -0.5)) {
    return 'La Niña-range ONI for 5 overlapping seasons';
  }
  const latest = recent[recent.length - 1];
  if (latest.oni >= 0.5) return 'El Niño-range ONI; persistence not yet met';
  if (latest.oni <= -0.5) return 'La Niña-range ONI; persistence not yet met';
  if (latest.oni >= 0.2) return 'Warm ENSO signal';
  if (latest.oni <= -0.2) return 'Cool ENSO signal';
  return 'Near-neutral ENSO signal';
}

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const upstream = await fetch(NOAA_ONI_URL, {
      signal: controller.signal,
      headers: { Accept: 'text/plain' },
    });
    if (!upstream.ok) {
      return response.status(502).json({ error: `NOAA ONI feed returned ${upstream.status}` });
    }
    const rows = parseOceanicNinoIndex(await upstream.text());
    const recent = rows.slice(-6);
    if (recent.length < 5) return response.status(502).json({ error: 'NOAA ONI feed contained too few readings' });

    response.setHeader('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=43200');
    return response.status(200).json({
      latest: recent[recent.length - 1],
      recent,
      phase: phaseFor(recent),
      source: NOAA_ONI_URL,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'NOAA ONI feed is unavailable';
    return response.status(502).json({ error: message });
  } finally {
    clearTimeout(timeoutId);
  }
}
