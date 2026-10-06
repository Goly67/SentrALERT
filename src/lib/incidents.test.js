import test from 'node:test';
import assert from 'node:assert/strict';

import { buildIncidents, resolveBarangay } from './incidents.js';

test('resolves barangays by boundary instead of the nearest approximate center', () => {
  assert.equal(resolveBarangay([9.7795, 125.4735]).name, 'San Juan');
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
