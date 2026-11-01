import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchWindAt, UNKNOWN_WIND, windCell, windForFire } from './wind.js';

const city = { speedKmh: 6, fromDeg: 230, source: 'open-meteo' };
const lagro = [14.73486, 121.06851];
const surigao = [9.787, 125.491];
const placer = [9.652183, 125.604865];

test('a far-away fire uses the wind measured for its own location', () => {
  const local = { speedKmh: 0.2, fromDeg: 90, source: 'open-meteo' };
  assert.equal(windForFire(lagro, city, { [windCell(lagro)]: local }), local);
});

test('a far-away fire never borrows the city wind while its own is missing', () => {
  assert.equal(windForFire(lagro, city, {}), UNKNOWN_WIND);
  assert.equal(windForFire(placer, city, {}), UNKNOWN_WIND);
});

test('a fire in the city can share the city wind', () => {
  assert.equal(windForFire(surigao, city, {}), city);
});

test('fires close together share one wind reading', () => {
  assert.equal(windCell([14.7349, 121.0685]), windCell([14.7301, 121.0712]));
  assert.notEqual(windCell(lagro), windCell(surigao));
});

test('the wind request asks for the fire location, and a failure gives no reading', async (t) => {
  const seen = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    seen.push(url);
    return { ok: false, status: 500 };
  });
  assert.equal(await fetchWindAt([1.1, 2.2]), null);
  assert.match(seen[0], /latitude=1\.1&longitude=2\.2/);
});

test('a successful reading is returned with its speed and direction', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    json: async () => ({ current: {
      wind_speed_10m: 0.2, wind_direction_10m: 90, relative_humidity_2m: 80, time: '2026-11-01T23:00',
    } }),
  }));
  const reading = await fetchWindAt([3.3, 4.4]);
  assert.equal(reading.speedKmh, 0.2);
  assert.equal(reading.fromDeg, 90);
  assert.equal(reading.source, 'open-meteo');
});
