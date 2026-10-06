/**
 * Indonesia -> Philippines haze watch.
 *
 *   1. Fires   - NASA VIIRS hotspots (last 24 h) inside Indonesia. Primary source
 *                is Esri's open live feed of NASA's data: no key, and it allows
 *                browser requests. NASA FIRMS is used as well when a key is set.
 *                Whatever answers is merged, then cut down to Indonesian land
 *                with a real country border (coarse hand-drawn polygons if the
 *                border service is down).
 *   2. Winds   - Open-Meteo 925 hPa (~750 m) hourly winds on a 4 degree grid, past
 *                24 h plus 72 h forecast. No key needed.
 *   3. Smoke   - parcels released from every fire cluster every 3 h are pushed
 *                along those winds; each one leaves a widening, fading footprint
 *                on a 0.5 degree grid. One grid per 3 h step, now to +72 h.
 *   4. Regions - each Philippine region is read off that grid at a few
 *                representative towns to get "when does it arrive / how bad".
 *
 * This is a screening model, not a dispersion forecast: no plume rise, no rain
 * washout, winds from a 4 degree grid. Use it to see the direction and rough timing,
 * and defer to official weather / health advisories for anything official.
 *
 * If no fire source answers, loadHaze() rejects and the panel says so. It never
 * substitutes made-up fires.
 *
 * Env (all optional, in .env.local):
 *   VITE_FIRMS_MAP_KEY  free key from https://firms.modaps.eosdis.nasa.gov/api/map_key/
 *                       Adds NASA's own feed on top of Esri's. Browsers may block it
 *                       (CORS); that is fine, Esri still supplies the fires.
 *   VITE_FIRMS_BASE     only if you run your own FIRMS proxy.
 *   VITE_HAZE_DEMO=1    development only: draw fake sample fires when every live
 *                       source fails. Off by default.
 */
import { SURIGAO_CENTER } from '../data/surigao.js';
import { fetchPm25 } from './airquality.js';

const env = import.meta.env ?? {};
// Trim so a key pasted with quotes or spaces in .env.local still works.
const FIRMS_KEY = String(env.VITE_FIRMS_MAP_KEY || '').trim().replace(/^["']|["']$/g, '');
const FIRMS_BASE = env.VITE_FIRMS_BASE || 'https://firms.modaps.eosdis.nasa.gov';
const FIRMS_SOURCES = [
  'VIIRS_NOAA20_NRT',
  'VIIRS_NOAA21_NRT',
  'VIIRS_SNPP_NRT',
  'MODIS_NRT',
];
const DEMO = env.VITE_HAZE_DEMO === '1';

// Esri republishes NASA LANCE VIIRS detections (NOAA-20, NOAA-21, Suomi NPP) as an
// open ArcGIS feature service, refreshed about hourly.
const ESRI_FIRE_URL =
  'https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/' +
  'Satellite_VIIRS_Thermal_Hotspots_and_Fire_Activity/FeatureServer/0/query';
const ESRI_BORDER_URL =
  'https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/' +
  'World_Countries_(Generalized)/FeatureServer/0/query';

const INDONESIA_BBOX = [95, -11.2, 141, 6.1]; // west, south, east, north
const FIRE_WINDOW_H = 24;
const MAX_FIRE_POINTS = 8000;
const MAX_CLUSTERS = 70;

/* ------------------------------------------------------------------ grid */

// Cover the full Indonesia fire query (east to 141E) plus room for the
// dispersion kernel, so the raster does not end over Papua or the Pacific.
export const GRID = { LAT_MIN: -12, LAT_MAX: 24, LON_MIN: 92, LON_MAX: 144, CELL: 0.5 };
GRID.NX = Math.round((GRID.LON_MAX - GRID.LON_MIN) / GRID.CELL);
GRID.NY = Math.round((GRID.LAT_MAX - GRID.LAT_MIN) / GRID.CELL);
export const SMOKE_BOUNDS = [[GRID.LAT_MIN, GRID.LON_MIN], [GRID.LAT_MAX, GRID.LON_MAX]];

export const FRAME_HOURS = 3;
export const FRAME_COUNT = 25; // now, +3 h … +72 h
const MAX_AGE_H = 48;

const WIND_LATS = [-12, -8, -4, 0, 4, 8, 12, 16, 20];
const WIND_LONS = [94, 98, 102, 106, 110, 114, 118, 122, 126, 130, 134];
const WIND_STEP = 4;
const WIND_GRID_CACHE_MS = 10 * 60 * 1000;
const WIND_GRID_RETRY_BACKOFF_MS = 5 * 60 * 1000;
let windGridCache = null;
let windGridRequest = null;
let windGridRetryAt = 0;

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const RAD = Math.PI / 180;

/* --------------------------------------------------------- Indonesia mask */

// Coarse land polygons as [lon, lat]. Foreign land is kept out by tracing the
// borders by hand, so expect ~30 km of slop where Indonesia meets Malaysia.
const INDONESIA_LAND = [
  // Sumatra + Bangka/Belitung
  [[95.0, 5.95], [95.6, 5.85], [96.6, 5.5], [97.6, 5.4], [98.7, 4.2], [100.0, 3.0], [101.4, 2.2], [102.3, 1.7],
   [103.0, 1.15], [104.7, 1.05], [104.9, 0.0], [105.9, -0.9], [107.0, -1.4], [108.5, -2.2], [108.5, -3.4],
   [106.0, -3.4], [105.9, -5.1], [105.5, -6.0], [103.8, -5.9], [102.2, -4.2], [100.9, -2.0], [100.2, -0.9],
   [99.0, 1.0], [97.6, 2.6], [96.0, 4.3], [95.1, 5.3]],
  // Java + Madura + Bali
  [[105.0, -5.95], [115.9, -5.95], [115.9, -9.0], [105.0, -9.0]],
  // Lombok → Sumba → West Timor (stops short of Timor-Leste)
  [[115.9, -7.9], [124.9, -7.9], [124.9, -11.1], [119.0, -11.3], [115.9, -9.9]],
  // Kalimantan — the northern edge follows the Malaysian border
  [[109.65, 2.05], [109.95, 1.55], [110.5, 1.2], [111.1, 1.05], [111.9, 1.45], [113.0, 1.5], [114.1, 1.5],
   [114.9, 2.2], [115.5, 3.0], [115.6, 3.9], [116.5, 4.2], [117.6, 4.3], [118.5, 3.9], [118.8, 2.0],
   [118.3, 0.7], [117.9, -0.6], [117.2, -1.8], [116.6, -3.0], [116.4, -4.3], [114.5, -4.4], [112.0, -3.8],
   [110.3, -3.3], [109.7, -1.8], [108.8, -0.5], [108.8, 1.2], [109.3, 2.0]],
  // Sulawesi
  [[118.7, -7.0], [125.3, -7.0], [125.3, 1.95], [118.7, 1.95]],
  // Sangihe + Talaud
  [[125.2, 2.0], [127.2, 2.0], [127.2, 4.95], [125.2, 4.95]],
  // Maluku + Papua (west of the PNG border, north of Timor-Leste)
  [[125.3, 2.7], [141.0, 2.7], [141.0, -9.3], [129.5, -9.3], [129.5, -8.1], [125.3, -8.1]],
  // Natuna
  [[107.8, 2.9], [109.2, 2.9], [109.2, 4.5], [107.8, 4.5]],
];

function inPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export const inIndonesia = (lat, lon) => INDONESIA_LAND.some((poly) => inPolygon(lon, lat, poly));

/* ------------------------------------------------------------------ fires */

function parseFirmsCsv(text, sensor = null) {
  const lines = text.trim().split(/\r?\n/);
  const head = (lines[0] || '').split(',');
  const col = (name) => head.indexOf(name);
  const iLat = col('latitude');
  const iLon = col('longitude');
  if (iLat < 0 || iLon < 0) throw new Error(`FIRMS said: ${lines[0]?.slice(0, 120) || 'empty response'}`);
  const iFrp = col('frp');
  const iConf = col('confidence');
  const iDate = col('acq_date');
  const iTime = col('acq_time');

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(',');
    const conf = (c[iConf] || '').trim().toLowerCase();
    if (conf === 'l' || conf === 'low') continue; // VIIRS low confidence = often sun glint / hot ground
    const lat = parseFloat(c[iLat]);
    const lon = parseFloat(c[iLon]);
    if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
    const hhmm = (c[iTime] || '0000').padStart(4, '0');
    const at = Date.parse(`${c[iDate]}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00Z`);
    rows.push({
      lat,
      lon,
      frp: parseFloat(c[iFrp]) || 0,
      confidence: c[iConf] || null,
      sensor,
      at: Number.isNaN(at) ? null : at,
    });
  }
  return rows;
}

/** NASA FIRMS rows for both satellites. Throws if no key or neither answers. */
export async function fetchFirmsRowsForBbox(bboxBounds = INDONESIA_BBOX) {
  if (!FIRMS_KEY) throw new Error('no FIRMS key set');
  const bbox = bboxBounds.join(',');
  const results = await Promise.allSettled(
    FIRMS_SOURCES.map(async (source) => {
      const res = await fetch(`${FIRMS_BASE}/api/area/csv/${FIRMS_KEY}/${source}/${bbox}/1`);
      if (!res.ok) throw new Error(`FIRMS returned ${res.status}`);
      return parseFirmsCsv(await res.text(), source);
    })
  );
  if (results.every((r) => r.status === 'rejected')) throw results[0].reason;
  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}

async function fetchFirmsRows() {
  return fetchFirmsRowsForBbox(INDONESIA_BBOX);
}

/** Esri's open copy of NASA VIIRS hotspots. Pages through up to 48,000 rows. */
async function fetchEsriRows() {
  const cutoff = new Date(Date.now() - FIRE_WINDOW_H * 3600e3).toISOString().slice(0, 19).replace('T', ' ');
  // hours_old is the documented age field; the timestamp filter is a fallback if a
  // future schema change ever drops it.
  const wheres = [`hours_old <= ${FIRE_WINDOW_H}`, `acq_time >= timestamp '${cutoff}'`];
  const [west, south, east, north] = INDONESIA_BBOX;
  let lastError = null;

  for (const where of wheres) {
    try {
      const rows = [];
      let offset = 0;
      for (let page = 0; page < 3; page++) {
        const q = new URLSearchParams({
          where,
          geometry: JSON.stringify({ xmin: west, ymin: south, xmax: east, ymax: north, spatialReference: { wkid: 4326 } }),
          geometryType: 'esriGeometryEnvelope',
          inSR: '4326',
          spatialRel: 'esriSpatialRelIntersects',
          outFields: 'frp,confidence,hours_old,acq_time',
          returnGeometry: 'true',
          outSR: '4326',
          geometryPrecision: '3',
          orderByFields: 'OBJECTID',
          resultOffset: String(offset),
          resultRecordCount: '16000',
          f: 'json',
        });
        const res = await fetch(`${ESRI_FIRE_URL}?${q}`);
        if (!res.ok) throw new Error(`Esri fire feed returned ${res.status}`);
        const json = await res.json();
        if (json.error) throw new Error(json.error.message || 'Esri fire feed error');
        const feats = json.features || [];
        for (const f of feats) {
          const a = f.attributes || {};
          const lon = f.geometry?.x ?? a.longitude;
          const lat = f.geometry?.y ?? a.latitude;
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
          const conf = String(a.confidence ?? '').trim().toLowerCase();
          if (conf === 'l' || conf === 'low') continue;
          const at = Number.isFinite(a.acq_time) ? a.acq_time : Date.now() - (a.hours_old ?? 0) * 3600e3;
          rows.push({ lat, lon, frp: Number(a.frp) || 0, at });
        }
        if (!json.exceededTransferLimit || feats.length === 0) break;
        offset += feats.length;
      }
      return rows;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

/* ---- country border: the real thing when reachable, hand-drawn polygons otherwise ---- */

const BORDER_TOLERANCE = 0.025; // ~2.8 km, forgives the generalized coastline

function ringHas(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** GeoJSON (Polygon / MultiPolygon) -> [{ bbox, rings }] */
function bordersFromGeoJson(gj) {
  const out = [];
  for (const f of gj.features || []) {
    const g = f.geometry;
    if (!g) continue;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const rings of polys) {
      if (!rings.length) continue;
      let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
      for (const [x, y] of rings[0]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
      out.push({ bbox: [x0, y0, x1, y1], rings });
    }
  }
  return out;
}

function inBorder(x, y, borders) {
  for (const b of borders) {
    const [x0, y0, x1, y1] = b.bbox;
    if (x < x0 || x > x1 || y < y0 || y > y1) continue;
    if (!ringHas(x, y, b.rings[0])) continue;
    let inHole = false;
    for (let k = 1; k < b.rings.length; k++) {
      if (ringHas(x, y, b.rings[k])) { inHole = true; break; }
    }
    if (!inHole) return true;
  }
  return false;
}

let borderPromise = null;

/** Resolves to a border list, or null if the service is unreachable (never rejects). */
function loadBorder() {
  if (borderPromise) return borderPromise;
  borderPromise = (async () => {
    try {
      const q = new URLSearchParams({
        where: "COUNTRY = 'Indonesia'",
        outFields: 'COUNTRY',
        outSR: '4326',
        returnGeometry: 'true',
        geometryPrecision: '3',
        maxAllowableOffset: '0.004',
        f: 'geojson',
      });
      const res = await fetch(`${ESRI_BORDER_URL}?${q}`);
      if (!res.ok) throw new Error(`border service returned ${res.status}`);
      const gj = await res.json();
      if (gj.error) throw new Error(gj.error.message || 'border service error');
      const borders = bordersFromGeoJson(gj);
      if (!borders.length) throw new Error('no Indonesia polygon returned');
      return borders;
    } catch {
      borderPromise = null; // try again on the next refresh
      return null;
    }
  })();
  return borderPromise;
}

/** Fetch every fire source that answers, merge, keep Indonesian land only. */
async function fetchFires() {
  const tasks = [['Esri', fetchEsriRows()]];
  if (FIRMS_KEY) tasks.push(['FIRMS', fetchFirmsRows()]);
  const [settled, borders] = await Promise.all([Promise.allSettled(tasks.map((t) => t[1])), loadBorder()]);

  const sources = [];
  const notes = [];
  const rows = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      sources.push(tasks[i][0]);
      rows.push(...r.value);
    } else {
      notes.push(`${tasks[i][0]}: ${r.reason?.message || r.reason}`);
    }
  });
  if (!sources.length) throw new Error(`No fire data source answered (${notes.join('; ')})`);

  const inside = borders
    ? (lat, lon) =>
        inBorder(lon, lat, borders) ||
        inBorder(lon + BORDER_TOLERANCE, lat, borders) || inBorder(lon - BORDER_TOLERANCE, lat, borders) ||
        inBorder(lon, lat + BORDER_TOLERANCE, borders) || inBorder(lon, lat - BORDER_TOLERANCE, borders)
    : inIndonesia;

  // The satellites see the same fire minutes apart, and both sources overlap:
  // keep one hotspot per ~1 km cell, the strongest.
  const best = new Map();
  for (const f of rows) {
    if (!inside(f.lat, f.lon)) continue;
    const key = `${Math.round(f.lat * 100)}_${Math.round(f.lon * 100)}`;
    const prev = best.get(key);
    if (!prev || f.frp > prev.frp) best.set(key, f);
  }
  return {
    fires: [...best.values()].sort((a, b) => b.frp - a.frp),
    sources,
    notes,
    approxBorder: !borders,
  };
}

/** Deterministic fake hotspots so the screen still works with no key / no network. */
function sampleFires() {
  let s = 20260919;
  const rand = () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gauss = () => (rand() + rand() + rand() + rand() - 2) * 1.2;
  const centers = [
    [0.5, 101.9, 90], [-1.7, 103.2, 110], [-3.3, 104.9, 150], [-0.4, 110.6, 120],
    [-2.3, 113.6, 170], [-3.2, 115.3, 90], [0.9, 116.4, 50], [-4.0, 120.2, 40],
  ];
  const out = [];
  for (const [lat, lon, n] of centers) {
    for (let i = 0; i < n; i++) {
      const la = lat + gauss() * 0.45;
      const lo = lon + gauss() * 0.45;
      if (inIndonesia(la, lo)) out.push({ lat: la, lon: lo, frp: 4 + rand() * rand() * 90, at: Date.now() - rand() * 20 * 3600e3 });
    }
  }
  return out.sort((a, b) => b.frp - a.frp);
}

const SOURCE_AREAS = [
  ['Aceh', 4.7, 96.8], ['North Sumatra', 2.2, 99.0], ['West Sumatra', -0.9, 100.4], ['Riau', 0.5, 101.8],
  ['Jambi', -1.6, 103.0], ['South Sumatra', -3.2, 104.5], ['Bengkulu', -3.8, 102.3], ['Lampung', -4.9, 105.0],
  ['Bangka Belitung', -2.4, 106.5], ['West Kalimantan', -0.3, 110.7], ['Central Kalimantan', -1.7, 113.3],
  ['South Kalimantan', -3.0, 115.3], ['East Kalimantan', 0.7, 116.5], ['North Kalimantan', 3.0, 116.5],
  ['Java', -7.3, 110.5], ['Bali / Nusa Tenggara', -8.6, 118.5], ['South Sulawesi', -3.6, 120.0],
  ['Central Sulawesi', -1.2, 121.0], ['Southeast Sulawesi', -4.0, 122.2], ['North Sulawesi', 1.0, 124.2],
  ['Maluku', -3.3, 128.5], ['North Maluku', 1.0, 127.8], ['Papua', -4.0, 138.0],
];

function nameArea(lat, lon) {
  let best = SOURCE_AREAS[0];
  let bestD = Infinity;
  for (const a of SOURCE_AREAS) {
    const d = (a[1] - lat) ** 2 + (a[2] - lon) ** 2;
    if (d < bestD) { bestD = d; best = a; }
  }
  return best[0];
}

/** Bin hotspots into 0.5° cells; each cell becomes one smoke source. */
function clusterFires(fires) {
  const cells = new Map();
  for (const f of fires) {
    const key = `${Math.floor(f.lat / 0.5)}_${Math.floor(f.lon / 0.5)}`;
    let c = cells.get(key);
    if (!c) { c = { n: 0, frp: 0, w: 0, lat: 0, lon: 0 }; cells.set(key, c); }
    const w = Math.max(f.frp, 1);
    c.n += 1; c.frp += f.frp; c.w += w; c.lat += f.lat * w; c.lon += f.lon * w;
  }
  return [...cells.values()]
    .map((c) => {
      const lat = c.lat / c.w;
      const lon = c.lon / c.w;
      return { lat, lon, count: c.n, frp: c.frp, strength: Math.min(Math.sqrt(c.frp), 70), area: nameArea(lat, lon) };
    })
    .sort((a, b) => b.strength - a.strength)
    .slice(0, MAX_CLUSTERS);
}

/* ------------------------------------------------------------------ wind */

export async function fetchWindGrid() {
  if (windGridCache && Date.now() - windGridCache.cachedAt < WIND_GRID_CACHE_MS) return windGridCache.value;
  if (windGridRequest) return windGridRequest;
  if (Date.now() < windGridRetryAt) {
    if (windGridCache) return windGridCache.value;
    throw new Error('Wind grid temporarily unavailable; retrying shortly');
  }
  const lats = [];
  const lons = [];
  for (const la of WIND_LATS) for (const lo of WIND_LONS) { lats.push(la); lons.push(lo); }
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${lats.join(',')}&longitude=${lons.join(',')}` +
    '&hourly=wind_speed_925hPa,wind_direction_925hPa' +
    '&wind_speed_unit=ms&timezone=GMT&past_days=1&forecast_days=4';

  windGridRequest = fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error(`Open-Meteo returned ${res.status}`);
      return res.json();
    })
    .then((response) => {
      let data = response;
      if (!Array.isArray(data)) data = [data];
      if (data.length !== lats.length) throw new Error('Open-Meteo returned an incomplete wind grid');

      const nLat = WIND_LATS.length;
      const nLon = WIND_LONS.length;
      const times = data[0].hourly.time;
      const hours = times.length;
      const u = new Float32Array(hours * nLat * nLon);
      const v = new Float32Array(hours * nLat * nLon);

      data.forEach((loc, idx) => {
    const i = Math.floor(idx / nLon);
    const j = idx % nLon;
    const spd = loc.hourly.wind_speed_925hPa;
    const dir = loc.hourly.wind_direction_925hPa;
    let lastU = 0;
    let lastV = 0;
    for (let h = 0; h < hours; h++) {
      if (spd[h] != null && dir[h] != null) {
        const th = dir[h] * RAD; // direction the wind blows FROM
        lastU = -spd[h] * Math.sin(th);
        lastV = -spd[h] * Math.cos(th);
      }
      u[(h * nLat + i) * nLon + j] = lastU;
      v[(h * nLat + i) * nLon + j] = lastV;
    }
      });

      const nowIso = `${new Date().toISOString().slice(0, 13)}:00`;
      let nowIdx = times.indexOf(nowIso);
      if (nowIdx < 0) nowIdx = Math.min(24 + new Date().getUTCHours(), hours - 1);
      const value = { u, v, nLat, nLon, hours, nowIdx, baseTime: Date.parse(`${times[nowIdx]}Z`) };
      windGridCache = { value, cachedAt: Date.now() };
      return value;
    })
    .catch((error) => {
      windGridRetryAt = Date.now() + WIND_GRID_RETRY_BACKOFF_MS;
      if (windGridCache) return windGridCache.value;
      throw error;
    })
    .finally(() => { windGridRequest = null; });
  return windGridRequest;
}

/** Bilinear wind (m/s east, m/s north) at a point, at an integer hour index. */
function windAt(w, lat, lon, h) {
  const hh = clamp(h, 0, w.hours - 1);
  const gy = clamp((lat - WIND_LATS[0]) / WIND_STEP, 0, w.nLat - 1);
  const gx = clamp((lon - WIND_LONS[0]) / WIND_STEP, 0, w.nLon - 1);
  const y0 = Math.min(Math.floor(gy), w.nLat - 2);
  const x0 = Math.min(Math.floor(gx), w.nLon - 2);
  const fy = gy - y0;
  const fx = gx - x0;
  const base = hh * w.nLat * w.nLon;
  const pick = (arr) => {
    const a = arr[base + y0 * w.nLon + x0];
    const b = arr[base + y0 * w.nLon + x0 + 1];
    const c = arr[base + (y0 + 1) * w.nLon + x0];
    const d = arr[base + (y0 + 1) * w.nLon + x0 + 1];
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  };
  return [pick(w.u), pick(w.v)];
}

/* ------------------------------------------------------------ smoke model */

/** One parcel, hourly positions. `rot` turns the wind clockwise (degrees). */
function trajectory(wind, lat, lon, startH, hours, rot, speedK) {
  const pts = [[lat, lon]];
  const c = Math.cos(rot * RAD);
  const s = Math.sin(rot * RAD);
  let la = lat;
  let lo = lon;
  for (let k = 0; k < hours; k++) {
    const [u, v] = windAt(wind, la, lo, startH + k);
    const ue = (u * c + v * s) * speedK;
    const vn = (-u * s + v * c) * speedK;
    la += (vn * 3600) / 111320;
    lo += (ue * 3600) / (111320 * Math.max(Math.cos(la * RAD), 0.2));
    la = clamp(la, -60, 60);
    pts.push([la, lo]);
  }
  return pts;
}

// Spread three parcels per release — wind turned -12° / 0 / +12° — so a plume
// fans out with distance instead of being a single thin line.
const VARIANTS = [
  { rot: -12, speed: 0.92, w: 0.25 },
  { rot: 0, speed: 1.0, w: 0.5 },
  { rot: 12, speed: 1.08, w: 0.25 },
];
const RELEASE_SCALE = 0.18;

function deposit(grid, lat, lon, ageH, mass) {
  const R = 44 + 4 * ageH; // km
  const dilution = (40 / R) ** 2 * Math.exp(-ageH / 48);
  const cosLat = Math.max(Math.cos(lat * RAD), 0.3);
  const dLat = R / 111;
  const dLon = R / (111 * cosLat);
  const y0 = Math.max(0, Math.floor((lat - dLat - GRID.LAT_MIN) / GRID.CELL));
  const y1 = Math.min(GRID.NY - 1, Math.floor((lat + dLat - GRID.LAT_MIN) / GRID.CELL));
  const x0 = Math.max(0, Math.floor((lon - dLon - GRID.LON_MIN) / GRID.CELL));
  const x1 = Math.min(GRID.NX - 1, Math.floor((lon + dLon - GRID.LON_MIN) / GRID.CELL));
  const R2 = R * R;
  for (let iy = y0; iy <= y1; iy++) {
    const dy = (GRID.LAT_MIN + (iy + 0.5) * GRID.CELL - lat) * 111;
    for (let ix = x0; ix <= x1; ix++) {
      const dx = (GRID.LON_MIN + (ix + 0.5) * GRID.CELL - lon) * 111 * cosLat;
      const d2 = dx * dx + dy * dy;
      if (d2 >= R2) continue;
      const k = 1 - d2 / R2;
      grid[iy * GRID.NX + ix] += mass * dilution * k * k;
    }
  }
}

function buildSmoke(clusters, wind) {
  const frames = Array.from({ length: FRAME_COUNT }, () => new Float32Array(GRID.NX * GRID.NY));
  const horizonH = (FRAME_COUNT - 1) * FRAME_HOURS;

  for (const cl of clusters) {
    for (let r = -24; r <= horizonH; r += FRAME_HOURS) {
      const hours = Math.min(MAX_AGE_H, horizonH - r);
      for (const vr of VARIANTS) {
        const path = trajectory(wind, cl.lat, cl.lon, wind.nowIdx + r, hours, vr.rot, vr.speed);
        for (let a = 0; a <= hours; a += FRAME_HOURS) {
          const T = r + a;
          if (T < 0) continue;
          deposit(frames[T / FRAME_HOURS], path[a][0], path[a][1], a, cl.strength * RELEASE_SCALE * vr.w);
        }
      }
    }
    // The line drawn on the map: today's smoke, straight down the middle.
    const centre = trajectory(wind, cl.lat, cl.lon, wind.nowIdx, MAX_AGE_H, 0, 1.0);
    cl.path = centre.filter((_, i) => i % FRAME_HOURS === 0);
  }
  return frames;
}

/* --------------------------------------------------------------- regions */

export const LEVELS = [
  { key: 'clear', label: 'Clear', min: 0, color: '#B9C2B3' },
  { key: 'light', label: 'Light haze', min: 0.12, color: '#2F6CFF' },
  { key: 'moderate', label: 'Moderate haze', min: 0.5, color: '#173564' },
  { key: 'heavy', label: 'Heavy haze', min: 1.5, color: '#B3261E' },
];
export const levelOf = (v) => (v >= LEVELS[3].min ? 3 : v >= LEVELS[2].min ? 2 : v >= LEVELS[1].min ? 1 : 0);

export const HOME_REGION = 'XIII'; // Caraga — Surigao City

export function pointInPolygon(point, polygon) {
  const [lat, lon] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [latI, lonI] = polygon[i];
    const [latJ, lonJ] = polygon[j];
    const intersects = ((latI > lat) !== (latJ > lat))
      && (lon < ((lonJ - lonI) * (lat - latI)) / (latJ - latI + Number.EPSILON) + lonI);
    if (intersects) inside = !inside;
  }
  return inside;
}

export function isPointInCaraga(point) {
  const caraga = REGIONS.find((r) => r.code === HOME_REGION);
  return Boolean(caraga && pointInPolygon(point, caraga.points));
}

// Representative towns per region, [lat, lon]. A region counts as hazed when
// the smoke grid near any of them crosses a threshold.
const REGIONS = [
  { code: 'NCR', name: 'Metro Manila (NCR)', points: [[14.60, 121.00]] },
  { code: 'CAR', name: 'Cordillera (CAR)', points: [[16.41, 120.59], [17.09, 120.98]] },
  { code: 'I', name: 'Ilocos (Region I)', points: [[18.20, 120.59], [17.57, 120.39], [16.62, 120.32], [16.04, 120.33]] },
  { code: 'II', name: 'Cagayan Valley (Region II)', points: [[17.61, 121.73], [17.15, 121.89], [16.69, 121.55], [20.45, 121.97]] },
  { code: 'III', name: 'Central Luzon (Region III)', points: [[15.15, 120.59], [14.83, 120.28], [15.76, 121.56], [15.49, 120.97]] },
  { code: 'IV-A', name: 'CALABARZON (Region IV-A)', points: [[14.21, 121.16], [13.94, 121.62], [13.76, 121.06], [14.59, 121.18]] },
  { code: 'IV-B', name: 'MIMAROPA (Region IV-B)', points: [[8.78, 117.83], [9.74, 118.74], [12.00, 120.20], [13.41, 121.18], [12.58, 122.27]] },
  { code: 'V', name: 'Bicol (Region V)', points: [[13.14, 123.74], [13.62, 123.19], [13.58, 124.23], [12.97, 124.00]] },
  { code: 'VI', name: 'Western Visayas (Region VI)', points: [[10.72, 122.56], [11.70, 122.36], [11.59, 122.75], [10.75, 121.94]] },
  { code: 'NIR', name: 'Negros Island Region', points: [[10.68, 122.96], [9.31, 123.31], [9.21, 123.51]] },
  { code: 'VII', name: 'Central Visayas (Region VII)', points: [[10.32, 123.89], [9.65, 123.85], [11.05, 124.00]] },
  { code: 'VIII', name: 'Eastern Visayas (Region VIII)', points: [[11.24, 125.00], [11.78, 124.88], [11.61, 125.43], [10.13, 124.84]] },
  { code: 'IX', name: 'Zamboanga Peninsula (Region IX)', points: [[6.91, 122.08], [7.83, 123.44], [8.59, 123.34]] },
  { code: 'X', name: 'Northern Mindanao (Region X)', points: [[8.48, 124.65], [8.23, 124.24], [8.15, 125.13]] },
  { code: 'XI', name: 'Davao (Region XI)', points: [[7.19, 125.46], [7.45, 125.81], [6.75, 125.36], [6.95, 126.22]] },
  { code: 'XII', name: 'SOCCSKSARGEN (Region XII)', points: [[6.11, 125.17], [6.50, 124.85], [7.01, 125.09], [6.69, 124.68]] },
  { code: 'XIII', name: 'Caraga (Region XIII)', points: [[9.79, 125.49], [8.95, 125.54], [9.08, 126.20], [8.21, 126.32]] },
  { code: 'BARMM', name: 'BARMM', points: [[8.00, 124.29], [7.22, 124.25], [6.05, 121.00], [5.03, 119.77], [6.70, 121.97]] },
].map((r) => ({
  ...r,
  center: [
    r.points.reduce((a, p) => a + p[0], 0) / r.points.length,
    r.points.reduce((a, p) => a + p[1], 0) / r.points.length,
  ],
}));

const ALL_REGION_POINTS = REGIONS.flatMap((r) => r.points);

/** Highest smoke value in the 3×3 cells around a point. */
function sampleMax(grid, lat, lon) {
  const cx = Math.floor((lon - GRID.LON_MIN) / GRID.CELL);
  const cy = Math.floor((lat - GRID.LAT_MIN) / GRID.CELL);
  let m = 0;
  for (let y = cy - 1; y <= cy + 1; y++) {
    for (let x = cx - 1; x <= cx + 1; x++) {
      if (x < 0 || y < 0 || x >= GRID.NX || y >= GRID.NY) continue;
      m = Math.max(m, grid[y * GRID.NX + x]);
    }
  }
  return m;
}

function analyseRegions(frames, pm25ByPoint = null) {
  return REGIONS.map((r) => {
    const series = frames.map((g) => Math.max(...r.points.map(([la, lo]) => sampleMax(g, la, lo))));
    const levels = series.map(levelOf);
    const readings = r.points
      .map((point) => pm25ByPoint?.[ALL_REGION_POINTS.indexOf(point)])
      .filter((value) => typeof value === 'number');
    const pm25 = readings.length ? Math.max(...readings) : null;
    let peak = 0;
    let peakFrame = 0;
    series.forEach((v, i) => { if (v > peak) { peak = v; peakFrame = i; } });
    const firstFrame = levels.findIndex((l) => l >= 1);
    return {
      code: r.code, name: r.name, center: r.center, series, levels,
      pm25, airQuality: airQualityOf(pm25),
      nowLevel: levels[0], peak, peakLevel: levelOf(peak), peakFrame,
      firstFrame: firstFrame < 0 ? null : firstFrame,
    };
  }).sort((a, b) => b.peak - a.peak);
}

function airQualityOf(pm25) {
  if (pm25 == null) return { label: 'Unavailable', color: '#7A8179' };
  if (pm25 <= 12) return { label: 'Good', color: '#2D7D46' };
  if (pm25 <= 35.4) return { label: 'Poor', color: '#2F6CFF' };
  if (pm25 <= 55.4) return { label: 'Unhealthy for sensitive groups', color: '#173564' };
  if (pm25 <= 150.4) return { label: 'Unhealthy', color: '#B3261E' };
  if (pm25 <= 250.4) return { label: 'Very unhealthy', color: '#7C2D73' };
  return { label: 'Hazardous', color: '#5A1A1A' };
}

// Convert CAMS PM2.5 (ug/m3) into the small internal scale used by the
// fire-trajectory model. The mapping follows the app's four display bands,
// while retaining a little variation inside each band.
function pm25ToHazeValue(pm25) {
  if (pm25 == null || !Number.isFinite(pm25) || pm25 <= 5) return 0;
  if (pm25 <= 15) return 0.12 * ((pm25 - 5) / 10);
  if (pm25 <= 35) return 0.12 + 0.38 * ((pm25 - 15) / 20);
  if (pm25 <= 55) return 0.5 + 1 * ((pm25 - 35) / 20);
  return Math.min(3, 1.5 + (pm25 - 55) / 50);
}

// CAMS gives the current atmospheric burden; let it anchor the present map
// and fade it over the first day while the fire/wind model carries the outlook.
function applyPm25Baseline(frames, readings) {
  const baseline = new Float32Array(GRID.NX * GRID.NY);
  ALL_REGION_POINTS.forEach(([lat, lon], index) => {
    const value = pm25ToHazeValue(readings[index]);
    if (value > 0) deposit(baseline, lat, lon, 0, value);
  });
  for (let frame = 0; frame < frames.length; frame++) {
    const fade = Math.exp(-(frame * FRAME_HOURS) / 24);
    const grid = frames[frame];
    for (let index = 0; index < grid.length; index++) {
      grid[index] = Math.max(grid[index], baseline[index] * fade);
    }
  }
}

function haversineKm(a, b) {
  const dLat = (b[0] - a[0]) * RAD;
  const dLon = (b[1] - a[1]) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/** Does this cluster's smoke line pass within ~120 km of a Philippine town? */
function flagPhilippineTracks(clusters) {
  for (const cl of clusters) {
    cl.reachesPH = false;
    cl.phHours = null;
    for (let i = 0; i < cl.path.length; i++) {
      if (ALL_REGION_POINTS.some((p) => haversineKm(cl.path[i], p) < 120)) {
        cl.reachesPH = true;
        cl.phHours = i * FRAME_HOURS;
        break;
      }
    }
  }
}

/* ------------------------------------------------------------ orchestrate */

let cache = null;
let inflight = null;

export function loadHaze(force = false) {
  if (!force && cache && Date.now() - cache.generatedAt < 30 * 60 * 1000) return Promise.resolve(cache);
  if (inflight) return inflight; // StrictMode / quick toggles shouldn't double-hit the APIs
  inflight = buildHaze().finally(() => { inflight = null; });
  return inflight;
}

async function buildHaze() {
  // These services are independent. Start them together so a slow fire feed
  // or air-quality request does not add its latency to the other requests.
  const [firesResult, windResult, pm25Result] = await Promise.allSettled([
    fetchFires(),
    fetchWindGrid(),
    fetchPm25(ALL_REGION_POINTS),
  ]);

  let found;
  if (firesResult.status === 'fulfilled') {
    found = firesResult.value;
  } else {
    const err = firesResult.reason;
    if (!DEMO) throw err; // no live fires: say so, do not invent any
    found = { fires: sampleFires(), sources: ['sample'], notes: [err.message], approxBorder: false };
  }
  const fires = found.fires.slice(0, MAX_FIRE_POINTS);
  const fireSource = found.sources.join('+').toLowerCase(); // esri | firms | esri+firms | sample
  const fireNote = found.notes.length ? found.notes.join('; ') : null;
  const clusters = clusterFires(fires);

  const wind = windResult.status === 'fulfilled' ? windResult.value : null;
  const windError = windResult.status === 'rejected' ? windResult.reason.message : null;

  let frames = null;
  let regions = [];
  const pm25 = pm25Result.status === 'fulfilled' ? pm25Result.value : null;
  const pm25Error = pm25Result.status === 'rejected' ? pm25Result.reason.message : null;
  if (wind) {
    frames = buildSmoke(clusters, wind);
    if (pm25) applyPm25Baseline(frames, pm25);
    flagPhilippineTracks(clusters);
    regions = analyseRegions(frames, pm25);
  }

  const affected = regions.filter((r) => r.peakLevel >= 1);
  const result = {
    generatedAt: Date.now(),
    fires, fireSource, fireNote, approxBorder: found.approxBorder, clusters,
    frpTotal: fires.reduce((a, f) => a + f.frp, 0),
    windError, pm25, pm25Error, baseTime: wind ? wind.baseTime : Date.now(),
    frames, regions,
    summary: {
      affected: affected.length,
      total: REGIONS.length,
      underHazeNow: regions.filter((r) => r.nowLevel >= 1).length,
      first: affected.filter((r) => r.firstFrame != null).sort((a, b) => a.firstFrame - b.firstFrame)[0] || null,
      tracksToPH: clusters.filter((c) => c.reachesPH).length,
    },
  };
  cache = result;
  return result;
}

/* -------------------------------------------------------------- painting */

const mercY = (latDeg) => Math.log(Math.tan(Math.PI / 4 + (latDeg * RAD) / 2));
const Y_TOP = mercY(GRID.LAT_MAX);
const Y_BOT = mercY(GRID.LAT_MIN);
const SMOKE_W = 320;
const SMOKE_H = Math.round((SMOKE_W * (Y_TOP - Y_BOT)) / ((GRID.LON_MAX - GRID.LON_MIN) * RAD));

function sampleBilinear(grid, lat, lon) {
  const gx = clamp((lon - GRID.LON_MIN) / GRID.CELL - 0.5, 0, GRID.NX - 1);
  const gy = clamp((lat - GRID.LAT_MIN) / GRID.CELL - 0.5, 0, GRID.NY - 1);
  const x0 = Math.min(Math.floor(gx), GRID.NX - 2);
  const y0 = Math.min(Math.floor(gy), GRID.NY - 2);
  const fx = gx - x0;
  const fy = gy - y0;
  const i = y0 * GRID.NX + x0;
  return (grid[i] * (1 - fx) + grid[i + 1] * fx) * (1 - fy) + (grid[i + GRID.NX] * (1 - fx) + grid[i + GRID.NX + 1] * fx) * fy;
}

/** One PNG data-URL per frame, drawn in Web-Mercator rows so it lines up under Leaflet. */
export function renderSmokeFrames(frames) {
  const canvas = document.createElement('canvas');
  canvas.width = SMOKE_W;
  canvas.height = SMOKE_H;
  const ctx = canvas.getContext('2d');

  const rowLat = new Float32Array(SMOKE_H);
  for (let j = 0; j < SMOKE_H; j++) {
    const y = Y_TOP - ((j + 0.5) / SMOKE_H) * (Y_TOP - Y_BOT);
    rowLat[j] = ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI;
  }
  const colLon = new Float32Array(SMOKE_W);
  for (let i = 0; i < SMOKE_W; i++) colLon[i] = GRID.LON_MIN + ((i + 0.5) / SMOKE_W) * (GRID.LON_MAX - GRID.LON_MIN);

  return frames.map((grid) => {
    const img = ctx.createImageData(SMOKE_W, SMOKE_H);
    for (let j = 0; j < SMOKE_H; j++) {
      for (let i = 0; i < SMOKE_W; i++) {
        const v = sampleBilinear(grid, rowLat[j], colLon[i]);
        const o = (j * SMOKE_W + i) * 4;
        // Make the smoke plume broader and more atmospheric so it reads like a
        // dense Indonesian haze band instead of a faint wash.
        if (v < 0.001) continue;
        const t = clamp(v / 1.6, 0, 1);
        const edge = clamp((v - 0.001) / (LEVELS[2].min + 0.18), 0, 1);
        img.data[o] = Math.max(80, 170 - 42 * t);
        img.data[o + 1] = Math.max(76, 164 - 38 * t);
        img.data[o + 2] = Math.max(72, 158 - 35 * t);
        img.data[o + 3] = 255 * (0.22 + edge * 0.42 + Math.pow(t, 0.78) * 0.56);
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas.toDataURL('image/png');
  });
}

export const HOME = SURIGAO_CENTER;