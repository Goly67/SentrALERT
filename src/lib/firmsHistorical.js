/**
 * Historical satellite check against NASA FIRMS' fire archive.
 *
 * lib/thermal.js already pulls LIVE VIIRS hotspots, but from a rolling feed
 * (`hours_old <= 24`) that only ever holds the last day or two — it cannot
 * answer "was there a hotspot here on 12 Aug 2026", because that data has
 * long since rolled off. Reaching further back means FIRMS' own archive API
 * (firms.modaps.eosdis.nasa.gov/api/area/csv/...), which requires a free
 * MAP_KEY (instant, no approval wait): https://firms.modaps.eosdis.nasa.gov/api/map_key/
 *
 * The key is used client-side only, kept in localStorage, and sent straight
 * to NASA's own API — this app has no backend to hold it server-side.
 */

const FIRMS_BASE = 'https://firms.modaps.eosdis.nasa.gov/api/area/csv';
const STORAGE_KEY = 'sfw.firmsMapKey';

// Every VIIRS/MODIS instrument FIRMS' archive serves. Queried in parallel —
// a ground fire could in principle show on more than one satellite pass.
const SENSORS = ['VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT', 'MODIS_NRT'];

export function getFirmsMapKey() {
  try {
    return localStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function setFirmsMapKey(key) {
  try {
    if (key) localStorage.setItem(STORAGE_KEY, key.trim());
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage unavailable (private mode, etc.) — key just won't persist.
  }
}

function parseCsv(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const row = {};
    headers.forEach((h, i) => { row[h] = cells[i]; });
    return row;
  });
}

/**
 * Query every FIRMS sensor for hotspots within `radiusKm` of `location`
 * across the calendar day of `dateIso`, and flag any that fall inside the
 * fire's actual burn window (`startedAt`..`containedAt`, ±`toleranceMin`).
 *
 * Returns one of:
 *   { status: 'no_key' }                          — nothing queried yet
 *   { status: 'error', message }                   — a sensor request failed
 *   { status: 'ok', hotspots: [...], matched: [...] }
 * `hotspots` is every detection found that day in the search radius;
 * `matched` is the subset that also falls inside the burn window — those
 * are the ones that actually corroborate this specific fire.
 */
export async function checkHistoricalHotspots({
  location,
  dateIso,
  startedAt,
  containedAt,
  radiusKm = 3,
  toleranceMin = 90,
}) {
  const mapKey = getFirmsMapKey();
  if (!mapKey) return { status: 'no_key' };

  const [lat, lng] = location;
  const kmPerDegLat = 111;
  const kmPerDegLng = 111 * Math.cos((lat * Math.PI) / 180);
  const dLat = radiusKm / kmPerDegLat;
  const dLng = radiusKm / kmPerDegLng;
  const bbox = [lng - dLng, lat - dLat, lng + dLng, lat + dLat].join(',');
  const date = dateIso.slice(0, 10);

  try {
    const results = await Promise.all(
      SENSORS.map(async (sensor) => {
        const url = `${FIRMS_BASE}/${mapKey}/${sensor}/${bbox}/1/${date}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`FIRMS returned ${res.status} for ${sensor}`);
        const text = await res.text();
        // FIRMS reports auth/quota problems as a 200 with a plain-text body.
        if (!text.includes(',') || /invalid|error/i.test(text.slice(0, 200))) return [];
        return parseCsv(text).map((row) => ({
          sensor,
          lat: Number(row.latitude),
          lon: Number(row.longitude),
          acqDate: row.acq_date,
          acqTime: row.acq_time,
          frp: Number(row.frp) || 0,
          confidence: row.confidence,
        }));
      })
    );

    const hotspots = results.flat();
    const windowStart = new Date(startedAt).getTime() - toleranceMin * 60000;
    const windowEnd = new Date(containedAt).getTime() + toleranceMin * 60000;
    const matched = hotspots.filter((h) => {
      if (!h.acqDate || !h.acqTime) return false;
      const hh = h.acqTime.padStart(4, '0').slice(0, 2);
      const mm = h.acqTime.padStart(4, '0').slice(2, 4);
      const t = new Date(`${h.acqDate}T${hh}:${mm}:00+00:00`).getTime();
      return t >= windowStart && t <= windowEnd;
    });

    return { status: 'ok', hotspots, matched };
  } catch (err) {
    return { status: 'error', message: err.message };
  }
}