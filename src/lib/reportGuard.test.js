import test from 'node:test';
import assert from 'node:assert/strict';

import { canAcceptReport, REPORT_SPAM_LIMIT, REPORT_SPAM_WINDOW_MS } from './reportGuard.js';

function buildReport(id, lat, lng, hoursAgo = 0) {
  const reportedAt = new Date(Date.now() - (hoursAgo * 60 * 60 * 1000)).toISOString();
  return { id, location: [lat, lng], reportedAt };
}

test('allows the first four distinct locations in an 8-hour window', () => {
  const now = Date.now();
  const reports = [
    buildReport('a', 9.0, 125.5, 1),
    buildReport('b', 9.1, 125.6, 2),
    buildReport('c', 9.2, 125.7, 3),
    buildReport('d', 9.3, 125.8, 4),
  ];

  for (const report of reports) {
    assert.equal(canAcceptReport(report, reports.filter((candidate) => candidate.id !== report.id), now), true);
  }

  assert.equal(canAcceptReport(buildReport('e', 9.4, 125.9, 5), reports, now), false);
});

test('treats nearby reports as the same fire instead of a new fake location', () => {
  const now = Date.now();
  const sameFire = buildReport('a', 9.0, 125.5, 1);
  const duplicate = buildReport('b', 9.0001, 125.5001, 2);

  assert.equal(canAcceptReport(duplicate, [sameFire], now), true);
});

test('ignores reports older than 8 hours when calculating the cap', () => {
  const now = Date.now();
  const reports = Array.from({ length: REPORT_SPAM_LIMIT }, (_, index) =>
    buildReport(`old-${index}`, 9.5 + index * 0.01, 125.9 + index * 0.01, (REPORT_SPAM_WINDOW_MS / 3600000) + 1 + index)
  );

  assert.equal(canAcceptReport(buildReport('new', 9.9, 126.0, 0), reports, now), true);
});
