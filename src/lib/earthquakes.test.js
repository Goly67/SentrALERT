import test from 'node:test';
import assert from 'node:assert/strict';

import {
  earthquakeCoverageKm,
  fetchEarthquakeBulletin,
  fetchEarthquakeEvents,
  getEarthquakeMapImageUrl,
  getWaveAnimationFrame,
  parseEarthquakeBulletin,
  parseEarthquakeEvents,
  parseLatestEarthquake,
  pWaveDurationMs,
  sWaveDurationMs,
  waveCircleFeature,
} from './earthquakes.js';

const olderPhivolcsEvent = {
  details_link: 'https://earthquake.phivolcs.dost.gov.ph/event/old',
  latitude: '9.52',
  longitude: '123.07',
  magnitude: '2.1',
  depth_km: '12',
  date_time: '05 October 2026 - 10:20 AM',
  location: '008 km N 47° W of Pamplona (Negros Oriental)',
};

const latestPhivolcsEvent = {
  latitude: '9.8',
  longitude: '125.5',
  magnitude: '4.7',
  depth_km: '18.4',
  date_time: '06 October 2026 - 12:42 PM',
  location: '018 km NE of Surigao City, Philippines',
};
const TEST_NOW = Date.UTC(2026, 9, 6, 5);
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const bulletinUrl = 'https://earthquake.phivolcs.dost.gov.ph/2026_Earthquake_Information/October/2026_1006_0845_B1.html';

function eventAt(time, overrides = {}) {
  return {
    ...latestPhivolcsEvent,
    date_time: new Date(time).toISOString(),
    ...overrides,
  };
}

test('parses PHIVOLCS events, cleans the location and sorts newest first', () => {
  const events = parseEarthquakeEvents([olderPhivolcsEvent, latestPhivolcsEvent], TEST_NOW);

  assert.equal(events.length, 2);
  assert.ok(events[0].time > events[1].time);
  assert.equal(events[0].time, Date.UTC(2026, 9, 6, 4, 42));
  assert.equal(events[0].id, `${events[0].time}-9.8-125.5`);
  assert.equal(events[0].place, 'NE of Surigao City, Philippines');
  assert.equal(events[0].depthKm, 18.4);
  assert.equal(parseLatestEarthquake([olderPhivolcsEvent, latestPhivolcsEvent], TEST_NOW).id, events[0].id);
  assert.deepEqual(parseEarthquakeEvents({ features: [] }), []);
});

test('ignores malformed and out-of-country events', () => {
  const events = parseEarthquakeEvents([
    olderPhivolcsEvent,
    { ...latestPhivolcsEvent, latitude: '30' },
    { ...latestPhivolcsEvent, date_time: 'not a date' },
  ], TEST_NOW);

  assert.equal(events.length, 1);
  assert.equal(events[0].place, 'N 47° W of Pamplona (Negros Oriental)');
});

test('shows only events from the rolling seven-day window', () => {
  const events = parseEarthquakeEvents([
    eventAt(TEST_NOW),
    eventAt(TEST_NOW - WEEK_MS),
    eventAt(TEST_NOW - WEEK_MS - 1),
    eventAt(TEST_NOW + 1),
  ], TEST_NOW);

  assert.equal(events.length, 2);
  assert.deepEqual(events.map((event) => event.time), [TEST_NOW, TEST_NOW - WEEK_MS]);
});

test('fetches PHIVOLCS earthquake events from the endpoint used by the EQ app', async (t) => {
  const originalFetch = globalThis.fetch;
  let requestedUrl;
  globalThis.fetch = async (url) => {
    requestedUrl = new URL(url);
    const now = Date.now();
    return {
      ok: true,
      json: async () => [eventAt(now - 60_000), eventAt(now - WEEK_MS - 1)],
    };
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const events = await fetchEarthquakeEvents();

  assert.equal(requestedUrl.origin, 'https://earthquakeapi.forestparty223.workers.dev');
  assert.equal(requestedUrl.pathname, '/api/earthquakes');
  assert.equal(events.length, 1);
  assert.equal(events[0].place, 'NE of Surigao City, Philippines');
});

test('parses the bulletin details, epicentral map, and omits the IMPORTANT notice', () => {
  const html = `
    <table>
      <tr><td>Origin :</td><td>TECTONIC</td></tr>
      <tr><td>Magnitude :</td><td>Ms 2.0</td></tr>
      <tr><td>Reported Intensities :</td><td>11.20a 2026_1006_0845_M20D018_B1</td></tr>
      <tr><td><img alt="Description: EPICENTRAL MAP" src="2026_1006_0845_B1.jpg"></td></tr>
      <tr><td>Expecting Damage :</td><td>NO</td></tr>
      <tr><td>Expecting Aftershocks :</td><td>NO</td></tr>
      <tr><td>Issued On :</td><td>06 October 2026 - 04:53 PM</td></tr>
      <tr><td>Prepared by :</td><td>MAL/JMG</td></tr>
      <tr><td>IMPORTANT This is a bulletin notice.</td></tr>
    </table>`;

  assert.deepEqual(parseEarthquakeBulletin(html, bulletinUrl), {
    origin: 'TECTONIC',
    intensities: '11.20a',
    expectedDamage: 'NO',
    expectedAftershocks: 'NO',
    issuedOn: '06 October 2026 - 04:53 PM',
    preparedBy: 'MAL/JMG',
    mapImageUrl: 'https://earthquake.phivolcs.dost.gov.ph/2026_Earthquake_Information/October/2026_1006_0845_B1.jpg',
  });
});

test('fetches an event bulletin through the same-origin endpoint', async (t) => {
  const originalFetch = globalThis.fetch;
  let requestedUrl;
  globalThis.fetch = async (url) => {
    requestedUrl = new URL(url, 'https://sentralert.test');
    return {
      ok: true,
      json: async () => ({ expectedDamage: 'NO' }),
    };
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const result = await fetchEarthquakeBulletin(bulletinUrl);

  assert.equal(requestedUrl.pathname, '/api/earthquake-bulletin');
  assert.equal(requestedUrl.searchParams.get('path'), new URL(bulletinUrl).pathname);
  assert.deepEqual(result, { expectedDamage: 'NO', mapImageUrl: '' });
});

test('derives the PHIVOLCS map image URL from an event bulletin URL', () => {
  assert.equal(
    getEarthquakeMapImageUrl(bulletinUrl),
    '/api/earthquake-map?path=%2F2026_Earthquake_Information%2FOctober%2F2026_1006_0845_B1.jpg'
  );
  assert.equal(getEarthquakeMapImageUrl('https://example.com/report.html'), '');
});

test('rewrites the PHIVOLCS map image to a same-origin image proxy', async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      mapImageUrl: 'https://earthquake.phivolcs.dost.gov.ph/2026_Earthquake_Information/October/2026_1006_0845_B1.jpg',
    }),
  });
  t.after(() => { globalThis.fetch = originalFetch; });

  const result = await fetchEarthquakeBulletin(bulletinUrl);

  assert.equal(
    result.mapImageUrl,
    '/api/earthquake-map?path=%2F2026_Earthquake_Information%2FOctober%2F2026_1006_0845_B1.jpg'
  );
});

test('parses an HTML bulletin response from the development proxy', async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    headers: { get: () => 'text/html; charset=utf-8' },
    text: async () => '<tr><td>Expecting Damage :</td><td>NO</td></tr><img alt="EPICENTRAL MAP" src="2026_1006_0845_B1.jpg">',
  });
  t.after(() => { globalThis.fetch = originalFetch; });

  const result = await fetchEarthquakeBulletin(bulletinUrl);

  assert.equal(result.expectedDamage, 'NO');
  assert.equal(
    result.mapImageUrl,
    '/api/earthquake-map?path=%2F2026_Earthquake_Information%2FOctober%2F2026_1006_0845_B1.jpg'
  );
});

test('rejects non-PHIVOLCS or invalid bulletin URLs', async () => {
  await assert.rejects(
    fetchEarthquakeBulletin('https://example.com/2026_Earthquake_Information/October/2026_1006_0845_B1.html'),
    /link is invalid/
  );
  await assert.rejects(
    fetchEarthquakeBulletin('https://earthquake.phivolcs.dost.gov.ph/unexpected-path'),
    /link is invalid/
  );
});

test('lets the P-wave finish and fade before the slower S-wave', () => {
  const coverageKm = earthquakeCoverageKm(6);
  const pDuration = pWaveDurationMs(coverageKm);
  const sDuration = sWaveDurationMs(coverageKm);
  const pAtSArrival = getWaveAnimationFrame(sDuration, coverageKm, pDuration);
  const sAtSArrival = getWaveAnimationFrame(sDuration, coverageKm, sDuration);

  assert.equal(pAtSArrival.done, true);
  assert.equal(pAtSArrival.opacity, 0);
  assert.equal(sAtSArrival.done, false);
  assert.equal(sAtSArrival.opacity, 1);
  assert.equal(sAtSArrival.radiusKm, coverageKm);
});

test('creates a closed GeoJSON wave polygon at the supplied epicenter', () => {
  const wave = waveCircleFeature(9.8, 125.5, 100, 0.75, 12);

  assert.equal(wave.geometry.type, 'Polygon');
  assert.equal(wave.properties.opacity, 0.75);
  assert.deepEqual(wave.geometry.coordinates[0][0], wave.geometry.coordinates[0].at(-1));
  assert.notDeepEqual(wave.geometry.coordinates[0][0], [125.5, 9.8]);
});
