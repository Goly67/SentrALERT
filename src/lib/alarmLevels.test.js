import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyAlarm, nextReportThreshold } from './alarmLevels.js';

test('single reports stay at 1st alarm until corroboration grows', () => {
  const alarm = classifyAlarm({
    estimatedStructures: 200,
    corroboration: 1,
    minutesElapsed: 0,
    held: false,
  });

  assert.equal(alarm.level, 1);
  assert.equal(alarm.code, '1st');
});

test('report count follows the operational alarm procedure', () => {
  const expected = [
    [1, 1],
    [5, 1],
    [15, 2],
    [35, 3],
    [45, 4],
    [50, 5],
  ];

  for (const [reports, level] of expected) {
    const alarm = classifyAlarm({
      estimatedStructures: 200,
      corroboration: reports,
      minutesElapsed: 120,
      held: false,
    });
    assert.equal(alarm.level, level, `${reports} reports should allow ${level}th alarm`);
  }
});

test('progress text starts from the current alarm level instead of always restarting at 1st alarm', () => {
  const next = nextReportThreshold(4, 3);

  assert.ok(next);
  assert.equal(next.level, 5);
  assert.equal(next.label, '5th Alarm');
});
