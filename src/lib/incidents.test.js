import test from 'node:test';
import assert from 'node:assert/strict';

import { buildIncidents, resolveBarangay } from './incidents.js';
import { composePost } from './verification.js';

test('resolves barangays by boundary instead of the nearest approximate center', () => {
  assert.equal(resolveBarangay([9.7795, 125.4735]).name, 'San Juan');
});

const wind = { fromDeg: 0, speedKmh: 5, humidity: 60 };
const crowdReports = (location) => ['a', 'b'].map((id) => ({
  id, location, source: 'crowd', modelConfidence: 0.95, reportedAt: new Date().toISOString(), status: 'approved',
}));

test('a fire far outside the city is not given a Surigao barangay name', () => {
  const quezonCity = [14.73486, 121.06851];
  assert.equal(resolveBarangay(quezonCity).name, 'Outside Surigao City');
  assert.equal(resolveBarangay(quezonCity).fuel, 'mixed_residential');

  const [incident] = buildIncidents(crowdReports(quezonCity), wind);
  assert.equal(incident.barangayName, 'Outside Surigao City');
  assert.equal(composePost(incident, incident.alarm).split('\n')[0], 'FIRE REPORTED — Outside Surigao City');
});

test('a fire inside the city keeps its barangay and the city in the post', () => {
  const [incident] = buildIncidents(crowdReports([9.7795, 125.4735]), wind);
  assert.equal(incident.barangayName, 'San Juan');
  assert.equal(composePost(incident, incident.alarm).split('\n')[0], 'FIRE REPORTED — San Juan, Surigao City');
});

test('a fire uses the wind at its own location, not the city wind', () => {
  const lagro = [14.73486, 121.06851];
  const city = { fromDeg: 230, speedKmh: 20, humidity: 60, source: 'open-meteo' };
  const local = { fromDeg: 270, speedKmh: 15, humidity: 70, source: 'open-meteo' };
  const [incident] = buildIncidents(crowdReports(lagro), city, [], [], { '14.7,121.1': local });
  assert.equal(incident.wind, local);
  assert.equal(incident.headDirection, 'E');
  assert.equal(incident.directionless, false);
});

test('a calm fire has no heading and its post says so', () => {
  const lagro = [14.73486, 121.06851];
  const city = { fromDeg: 230, speedKmh: 20, humidity: 60, source: 'open-meteo' };
  const local = { fromDeg: 90, speedKmh: 0.2, humidity: 70, source: 'open-meteo' };
  const [incident] = buildIncidents(crowdReports(lagro), city, [], [], { '14.7,121.1': local });
  assert.equal(incident.headDirection, 'any direction');
  assert.match(composePost(incident, incident.alarm), /no steady wind/);
  assert.doesNotMatch(composePost(incident, incident.alarm), /Households in that direction/);
});

test('a far-away fire with no wind reading shows no direction instead of the city wind', () => {
  const city = { fromDeg: 230, speedKmh: 20, humidity: 60, source: 'open-meteo' };
  const [incident] = buildIncidents(crowdReports([14.73486, 121.06851]), city);
  assert.equal(incident.wind.source, 'unavailable');
  assert.equal(incident.headDirection, 'any direction');
});

test('skips recent reports without valid coordinates before clustering', () => {
  const malformedReport = {
    id: 'missing-location',
    reportedAt: new Date().toISOString(),
  };

  assert.deepEqual(
    buildIncidents([malformedReport], { fromDeg: 0, speedKmh: 0, humidity: 50 }),
    []
  );
});
