import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchFeatureLayer } from './arcgis.js';

test('queries a FeatureServer layer URL and preserves its token', async (t) => {
  const originalFetch = globalThis.fetch;
  let requestedUrl;
  globalThis.fetch = async (url) => {
    requestedUrl = new URL(url);
    return {
      ok: true,
      json: async () => ({ type: 'FeatureCollection', features: [] }),
    };
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const result = await fetchFeatureLayer(
    'https://example.org/arcgis/rest/services/Fires/FeatureServer/0/query?token=example-token',
    { bounds: { west: 125.25, south: 9.45, east: 125.8, north: 10.1 }, zoom: 14 }
  );

  assert.equal(result.type, 'FeatureCollection');
  assert.equal(requestedUrl.pathname, '/arcgis/rest/services/Fires/FeatureServer/0/query');
  assert.equal(requestedUrl.searchParams.get('token'), 'example-token');
  assert.equal(requestedUrl.searchParams.get('f'), 'geojson');
  assert.equal(requestedUrl.searchParams.get('outSR'), '4326');
  assert.equal(requestedUrl.searchParams.get('where'), '1=1');
  assert.equal(requestedUrl.searchParams.get('resultOffset'), '0');
  assert.equal(requestedUrl.searchParams.get('geometry'), '125.25,9.45,125.8,10.1');
  assert.equal(requestedUrl.searchParams.get('geometryType'), 'esriGeometryEnvelope');
  assert.equal(requestedUrl.searchParams.get('maxAllowableOffset'), '0.00015625');
  assert.equal(requestedUrl.searchParams.get('resultRecordCount'), '100');
});

test('requires a layer index for a FeatureServer service URL', async () => {
  await assert.rejects(
    fetchFeatureLayer('https://example.org/arcgis/rest/services/Fires/FeatureServer', {
      bounds: { west: 125, south: 9, east: 126, north: 10 },
    }),
    /Add a layer number/
  );
});

test('loads a direct GeoJSON URL without rewriting its path', async (t) => {
  const originalFetch = globalThis.fetch;
  let requestedUrl;
  globalThis.fetch = async (url) => {
    requestedUrl = new URL(url);
    return {
      ok: true,
      json: async () => ({ type: 'FeatureCollection', features: [] }),
    };
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  await fetchFeatureLayer('https://example.org/data/fires.geojson');

  assert.equal(requestedUrl.href, 'https://example.org/data/fires.geojson');
});

test('follows ArcGIS transfer-limit pages', async (t) => {
  const originalFetch = globalThis.fetch;
  const offsets = [];
  globalThis.fetch = async (url) => {
    const offset = Number(new URL(url).searchParams.get('resultOffset'));
    offsets.push(offset);
    return {
      ok: true,
      json: async () => ({
        type: 'FeatureCollection',
        exceededTransferLimit: offset === 0,
        features: [{ type: 'Feature', id: offset }],
      }),
    };
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const result = await fetchFeatureLayer('https://example.org/FeatureServer/0', {
    bounds: { west: 125, south: 9, east: 126, north: 10 },
  });

  assert.deepEqual(offsets, [0, 1]);
  assert.deepEqual(result.features.map((feature) => feature.id), [0, 1]);
  assert.equal(result.exceededTransferLimit, false);
});
