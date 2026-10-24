const SURIGAO_BOUNDS = [125.35, 9.65, 125.65, 9.9];
const ESRI_FIRE_URL =
  'https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/' +
  'Satellite_VIIRS_Thermal_Hotspots_and_Fire_Activity/FeatureServer/0/query';
const HOTSPOT_WINDOW_H = 24;
const THERMAL_CACHE_MS = 60 * 1000;
let cache = null;
let request = null;

function consolidateHotspots(hotspots) {
  const bestByCell = new Map();
  for (const hotspot of hotspots) {
    const confidence = String(hotspot.confidence ?? '').trim().toLowerCase();
    if (confidence === 'l' || confidence === 'low') continue;
    const key = `${Math.round(hotspot.lat * 100)}_${Math.round(hotspot.lon * 100)}`;
    const previous = bestByCell.get(key);
    if (!previous || hotspot.frp > previous.frp) bestByCell.set(key, hotspot);
  }
  return [...bestByCell.values()];
}

async function fetchArcgisHotspots(query) {
  const rows = [];
  let offset = 0;
  for (;;) {
    const pageQuery = new URLSearchParams(query);
    pageQuery.set('resultOffset', String(offset));
    pageQuery.set('resultRecordCount', '2000');
    const response = await fetch(`${ESRI_FIRE_URL}?${pageQuery}`);
    if (!response.ok) throw new Error(`Thermal service returned ${response.status}`);
    const body = await response.json();
    if (body.error) throw new Error(body.error.message || 'Thermal service error');
    const page = (body.features || []).flatMap((feature) => {
      const lat = feature.geometry?.y;
      const lon = feature.geometry?.x;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
      return [{
        lat,
        lon,
        frp: Number(feature.attributes?.frp) || 0,
        confidence: feature.attributes?.confidence,
        sensor: feature.attributes?.satellite || 'Esri VIIRS mirror',
        hoursOld: Number(feature.attributes?.hours_old) || 0,
        acqTime: feature.attributes?.acq_time,
      }];
    });
    rows.push(...page);
    if (!body.exceededTransferLimit || page.length === 0) break;
    offset += page.length;
  }
  return rows;
}

/**
 * VIIRS thermal detections are evidence, not located reports. A hotspot can
 * support a nearby human report, but it must never create a fire pin alone.
 */
export async function fetchThermalHotspots() {
  if (cache && Date.now() - cache.fetchedAt < THERMAL_CACHE_MS) return cache.value;
  if (request) return request;
  const [west, south, east, north] = SURIGAO_BOUNDS;
  const query = new URLSearchParams({
    where: `hours_old <= ${HOTSPOT_WINDOW_H}`,
    geometry: JSON.stringify({ xmin: west, ymin: south, xmax: east, ymax: north, spatialReference: { wkid: 4326 } }),
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'frp,confidence,hours_old,acq_time,satellite',
    returnGeometry: 'true',
    outSR: '4326',
    resultRecordCount: '200',
    f: 'json',
  });

  const arcgisRows = fetchArcgisHotspots(query);
  const nextRequest = arcgisRows
    .then((rows) => {
      const consolidated = consolidateHotspots(rows);
      cache = { value: consolidated, fetchedAt: Date.now() };
      return consolidated;
    })
    .catch(() => cache?.value ?? [])
    .finally(() => {
      request = null;
    });
  request = nextRequest;
  return nextRequest;
}

