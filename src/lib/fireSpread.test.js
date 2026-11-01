import test from 'node:test';
import assert from 'node:assert/strict';

import { burningFromMapped, countMappedBuildings, projectSpread, spreadRates } from './fireSpread.js';
import { distanceMeters } from './geo.js';

const origin = [9.652, 125.605];
const params = { origin, windFromDeg: 270, windKmh: 14, fuel: 'dense_residential' };

test('dense housing in a 14 km/h wind matches a hand calculation of the Hamada formula', () => {
  const { head, flank, back } = spreadRates({ fuel: 'dense_residential', windKmh: 14 });
  assert.ok(head > 2.7 && head < 3.2, `head ${head}`);
  assert.ok(flank > 0.85 && flank < 1.15, `flank ${flank}`);
  assert.ok(back > 0.8 && back < 1.1, `back ${back}`);
});

test('fire runs fastest downwind and slowest into the wind, once the wind is steady', () => {
  for (const windKmh of [7, 10, 14, 30, 60]) {
    const { head, flank, back } = spreadRates({ fuel: 'mixed_residential', windKmh });
    assert.ok(head > flank && flank >= back && back > 0, `at ${windKmh} km/h`);
  }
});

test('in calm air a fire spreads evenly and has no direction', () => {
  for (const windKmh of [0, 0.2, 5]) {
    const { head, flank, back } = spreadRates({ fuel: 'mixed_residential', windKmh });
    assert.equal(head, flank, `head at ${windKmh} km/h`);
    assert.equal(back, flank, `back at ${windKmh} km/h`);
    assert.ok(flank > 0);
  }
  const spread = projectSpread({ ...params, windKmh: 0.2, minutes: 30 });
  assert.equal(spread.calm, true);
  assert.deepEqual(spread.rearPolygon, []);
  assert.equal(spread.frontPolygon.length, spread.polygon.length);
  const reach = spread.polygon.map((point) => distanceMeters(origin, point));
  assert.ok(Math.max(...reach) - Math.min(...reach) < 0.5, 'should be a circle');
});

test('direction eases in as the wind picks up instead of jumping', () => {
  const headAt = (windKmh) => spreadRates({ fuel: 'mixed_residential', windKmh }).head;
  assert.ok(headAt(6) > headAt(5));
  assert.ok(headAt(8) > headAt(6));
  assert.ok(headAt(10) > headAt(8));
  assert.equal(projectSpread({ ...params, windKmh: 6, minutes: 30 }).calm, false);
});

test('open lots spread slower than any built-up area', () => {
  for (const windKmh of [5, 14, 30]) {
    const sparse = spreadRates({ fuel: 'sparse', windKmh }).head;
    for (const fuel of ['dense_residential', 'mixed_residential', 'commercial']) {
      assert.ok(sparse < spreadRates({ fuel, windKmh }).head, `${fuel} at ${windKmh} km/h`);
    }
  }
});

test('stronger wind pushes the head further ahead of the back', () => {
  const ratio = (windKmh) => {
    const { head, back } = spreadRates({ fuel: 'mixed_residential', windKmh });
    return head / back;
  };
  assert.ok(ratio(40) > ratio(10));
});

test('the outline reaches the head and back distances and stays anchored on the fire', () => {
  const spread = projectSpread({ ...params, minutes: 30 });
  assert.equal(spread.headBearing, 90);
  assert.deepEqual(spread.frontPolygon[0], origin);
  assert.deepEqual(spread.rearPolygon[0], origin);
  const reach = (ring) => Math.max(...ring.map((point) => distanceMeters(origin, point)));
  assert.ok(Math.abs(reach(spread.frontPolygon) - spread.headDistanceM) < 0.5);
  assert.ok(Math.abs(reach(spread.rearPolygon) - spread.flankWidthM / 2) < 0.5);
});

test('the front half lies ahead of the fire and the rear half behind it', () => {
  const { frontArc, rearPolygon } = projectSpread({ ...params, minutes: 30 });
  // Wind from the west: downwind is east, so longitude tells front from rear.
  assert.ok(frontArc.every(([, lng]) => lng >= origin[1] - 1e-9));
  assert.ok(rearPolygon.every(([, lng]) => lng <= origin[1] + 1e-9));
});

test('area grows with the square of time', () => {
  const at = (minutes) => projectSpread({ ...params, minutes }).areaHa;
  assert.ok(Math.abs(at(60) / at(30) - 4) < 1e-9);
});

test('an alarm that already involves buildings starts from a bigger fire', () => {
  const fresh = projectSpread({ ...params, minutes: 30 });
  const grown = projectSpread({ ...params, minutes: 30, existingStructures: 40 });
  assert.ok(grown.areaHa > fresh.areaHa);
});

const buildingAt = (lng, lat, id) => ({
  id,
  geometry: {
    type: 'Polygon',
    coordinates: [[[lng, lat], [lng + 0.00002, lat], [lng + 0.00002, lat + 0.00002], [lng, lat]]],
  },
});
const fakeMap = (buildings, zoom = 15) => ({
  getSource: () => ({}),
  getZoom: () => zoom,
  querySourceFeatures: () => buildings,
});

test('only real buildings inside the footprint are counted, once each', () => {
  const { polygon } = projectSpread({ ...params, minutes: 30 });
  const inside = buildingAt(125.6055, 9.652, 1);
  const repeatedInNextTile = buildingAt(125.6055, 9.652, 1);
  const farAway = buildingAt(125.7, 9.7, 2);
  assert.equal(countMappedBuildings(fakeMap([inside, repeatedInNextTile, farAway]), polygon), 1);
});

test('every building in a merged tile feature is counted', () => {
  const { polygon } = projectSpread({ ...params, minutes: 30 });
  const ring = (lng, lat) => buildingAt(lng, lat, 7).geometry.coordinates;
  const merged = {
    id: 7,
    geometry: { type: 'MultiPolygon', coordinates: [ring(125.6055, 9.652), ring(125.6056, 9.652), ring(125.7, 9.7)] },
  };
  assert.equal(countMappedBuildings(fakeMap([merged, merged]), polygon), 2);
});

test('no building data means no count, so the density estimate is used instead', () => {
  const { polygon } = projectSpread({ ...params, minutes: 30 });
  assert.equal(countMappedBuildings(fakeMap([]), polygon), null);
  assert.equal(countMappedBuildings(fakeMap([buildingAt(125.6055, 9.652, 1)], 12), polygon), null);
  assert.equal(countMappedBuildings(null, polygon), null);
});

test('only part of the mapped buildings are expected to burn', () => {
  assert.equal(burningFromMapped(100, 'mixed_residential'), 50);
});
