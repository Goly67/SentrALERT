// ArcGIS compatibility: export incidents as GeoJSON / Esri JSON (WKID 4326)
// and load any public FeatureServer / MapServer layer or .geojson onto the map.
const props = (i) => ({
  incident_id: i.id,
  barangay: i.barangayName,
  alarm_level: i.alarm.level,
  alarm_label: i.alarm.label,
  reported_at: i.reportedAt,
  minutes_elapsed: Math.round(i.minutesElapsed),
  report_count: i.reports.length,
  triage_status: i.triage?.status ?? '',
  head_direction: i.headDirection,
  fuel: i.fuelLabel,
});

export const toGeoJSON = (incidents) => ({
  type: 'FeatureCollection',
  features: incidents.map((i) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [i.location[1], i.location[0]] },
    properties: props(i),
  })),
});

// Shape accepted by a FeatureServer applyEdits "adds" payload.
export const toEsriJSON = (incidents) => ({
  spatialReference: { wkid: 4326 },
  geometryType: 'esriGeometryPoint',
  features: incidents.map((i) => ({
    geometry: { x: i.location[1], y: i.location[0], spatialReference: { wkid: 4326 } },
    attributes: props(i),
  })),
});

export function toCSV(incidents) {
  const rows = incidents.map((i) => ({ ...props(i), lat: i.location[0], lng: i.location[1] }));
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}

export function download(name, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function fetchFeatureLayer(rawUrl, { bounds, zoom = 10 } = {}) {
  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error('Enter a valid public https:// layer URL.');
  }
  if (parsed.protocol !== 'https:') throw new Error('Use a public https:// layer URL.');

  const endpoint = parsed.pathname.match(/\/(?:FeatureServer|MapServer)(?:\/(\d+))?(?:\/query)?\/?$/i);
  if (endpoint) {
    const layerId = endpoint[1];
    if (!layerId) throw new Error('Add a layer number, e.g. …/FeatureServer/0.');
    if (!bounds || ![bounds.west, bounds.south, bounds.east, bounds.north].every(Number.isFinite)) {
      throw new Error('Wait for the map to load, then try again.');
    }
    parsed.pathname = parsed.pathname.replace(/\/query\/?$/i, '').replace(/\/$/, '') + '/query';
    parsed.searchParams.set('where', parsed.searchParams.get('where') || '1=1');
    parsed.searchParams.set('outFields', parsed.searchParams.get('outFields') || '*');
    parsed.searchParams.set('geometry', `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`);
    parsed.searchParams.set('geometryType', 'esriGeometryEnvelope');
    parsed.searchParams.set('spatialRel', 'esriSpatialRelIntersects');
    parsed.searchParams.set('inSR', '4326');
    parsed.searchParams.set('outSR', '4326');
    parsed.searchParams.set('f', 'geojson');
    parsed.searchParams.set('maxAllowableOffset', String(Math.max(0.00002, 0.01 / (2 ** Math.max(0, zoom - 8)))));
    parsed.searchParams.set('resultRecordCount', '100');
  }

  const features = [];
  let data;
  let offset = 0;
  do {
    if (endpoint) parsed.searchParams.set('resultOffset', String(offset));

    let res;
    try {
      res = await fetch(parsed.href);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      throw new Error('Could not reach this layer. Check that it is public and allows browser access (CORS).');
    }
    if (!res.ok) {
      if (res.status === 504) {
        throw new Error('ArcGIS timed out for this area. Zoom in closer on the map and try again.');
      }
      throw new Error(`Layer returned ${res.status}.`);
    }
    try {
      data = await res.json();
    } catch {
      throw new Error('The layer did not return JSON. Check the URL and browser access permissions.');
    }
    if (data.error) throw new Error(data.error.message || 'ArcGIS rejected the request.');
    if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
      throw new Error('Not a GeoJSON feature collection.');
    }
    features.push(...data.features);
    if (!endpoint || !data.exceededTransferLimit) break;
    if (!data.features.length) throw new Error('The layer reported more records but returned an empty page.');
    offset += data.features.length;
    if (offset >= 10000) {
      throw new Error('This layer contains more than 10,000 features. Filter it to a smaller area before loading.');
    }
  } while (true);
  return { ...data, features, exceededTransferLimit: false };
}

// DOM node (not HTML string) so attribute values can never inject markup.
export function popupNode(properties = {}) {
  const box = document.createElement('div');
  box.className = 'sa-popup';
  Object.entries(properties).slice(0, 8).forEach(([k, v]) => {
    const row = document.createElement('div');
    const b = document.createElement('b');
    b.textContent = `${k}: `;
    row.append(b, document.createTextNode(String(v ?? '')));
    box.appendChild(row);
  });
  return box;
}