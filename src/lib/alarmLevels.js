/**
 * Five-level warning system, plus a Light Warning tier below the first alarm.
 *
 * Wording follows the BFP escalation people already recognise: each alarm is a
 * standing order for a bigger slice of the region's fire service, not a
 * severity adjective. The level is set by the 30-minute spread projection, so
 * the trucks are called for the fire that is coming rather than the one
 * currently burning.
 */

export const LIGHT_WARNING = {
  key: 'light',
  level: 0,
  code: 'LW',
  label: 'Light Warning',
  summary: 'White smoke barely noticeable.',
  detail:
    'Logged but not dispatched. Publishes itself the moment a second report lands nearby.',
  units: 0,
  color: '#6B7280',
  tint: '#F3F4F6',
};

export const ALARM_LEVELS = [
  {
    key: 'a1',
    level: 1,
    code: '1st',
    label: '1st Alarm',
    summary:
      'The initial group of fire trucks and firefighters sent automatically when a fire call comes in.',
    minStructures: 0,
    minReports: 5,
    units: 4,
    color: '#FF7A00',
    tint: '#FFF0DB',
  },
  {
    key: 'a2',
    level: 2,
    code: '2nd',
    label: '2nd Alarm',
    summary:
      'Called when the first team finds the fire is too big for them alone. Doubles the number of workers and adds support gear.',
    minStructures: 12,
    minReports: 15,
    units: 8,
    color: '#B3261E',
    tint: '#FBE4E1',
  },
  {
    key: 'a3',
    level: 3,
    code: '3rd',
    label: '3rd Alarm',
    summary:
      'A major, dangerous fire. Triples the baseline resources and brings in heavy equipment and many more shift crews.',
    minStructures: 35,
    minReports: 35,
    units: 12,
    color: '#B3261E',
    tint: '#FBE4E1',
  },
  {
    key: 'a4',
    level: 4,
    code: '4th',
    label: '4th Alarm',
    summary:
      'Extreme emergency needing help from outside the city. Engine companies, ladder trucks, and medical teams from surrounding towns respond.',
    minStructures: 80,
    minReports: 45,
    units: 18,
    color: '#C62F17',
    tint: '#FBD5CE',
  },
  {
    key: 'a5',
    level: 5,
    code: '5th',
    label: '5th Alarm',
    summary:
      'Rare, massive regional response. Dozens of engine companies, ladder trucks, medical teams, and support units from surrounding districts converge on the scene.',
    minStructures: 150,
    minReports: 50,
    units: 30,
    color: '#9B1410',
    tint: '#F6C9C4',
  },
];

/** The five cards shown in the warning-system reference, 4th and 5th merged. */
export const WARNING_CARDS = [
  { ...LIGHT_WARNING, cardLabel: 'Light Warning' },
  { ...ALARM_LEVELS[0], cardLabel: '1st Alarm' },
  { ...ALARM_LEVELS[1], cardLabel: '2nd Alarm' },
  { ...ALARM_LEVELS[2], cardLabel: '3rd Alarm' },
  {
    ...ALARM_LEVELS[4],
    key: 'a45',
    code: '4th & 5th',
    cardLabel: '4th & 5th Alarm',
    summary:
      'Rare, extreme emergencies that require massive regional help. Dozens of engine companies, ladder trucks, medical teams, and support units from surrounding towns or districts respond to the scene.',
  },
];

export function alarmForStructures(count) {
  let match = ALARM_LEVELS[0];
  for (const step of ALARM_LEVELS) {
    if (count >= step.minStructures) match = step;
  }
  return match;
}

export function alarmForReports(count) {
  let match = null;
  for (const step of ALARM_LEVELS) {
    if (count >= step.minReports) match = step;
  }
  return match;
}

export function nextReportThreshold(currentLevel, reportCount) {
  if (!Number.isFinite(currentLevel) || !Number.isFinite(reportCount)) {
    return null;
  }

  return ALARM_LEVELS.find((step) => (
    step.level > currentLevel && reportCount < step.minReports
  )) ?? null;
}

/**
 * Final level for an incident.
 *
 * The spread model can describe how large a fire may become, but it cannot
 * independently assign a higher alarm. Report count is the operational
 * ceiling: 5, 15, 35, 45, and 50 reports permit alarms 1 through 5.
 */
export function classifyAlarm({
  estimatedStructures,
  corroboration = 1,
  minutesElapsed = 0,
  held = false,
}) {
  if (held) {
    return {
      ...LIGHT_WARNING,
      baseLevel: 0,
      escalatedBy: 0,
      respondingUnits: 'No units dispatched',
    };
  }

  const base = alarmForStructures(estimatedStructures);
  const reportBase = alarmForReports(corroboration);
  const reportCeiling = reportBase?.level ?? 1;
  const modelLevel = Math.max(base.level, 1);
  const capped = Math.min(modelLevel, reportCeiling, ALARM_LEVELS.length);
  const step = ALARM_LEVELS[capped - 1];

  return {
    ...step,
    baseLevel: base.level,
    escalatedBy: capped - base.level,
    respondingUnits: `${step.units} units`,
  };
}
