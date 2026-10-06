const { onSchedule } = require('firebase-functions/v2/scheduler');
const { getApps, initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');

if (!getApps().length) initializeApp();

const SURIGAO_CENTER = [9.7839, 125.4889];
const HISTORY_LIMIT = 8;
// A citywide reading must be a clear jump before it influences a report.
const PM25_SPIKE_RATIO = 1.8;

async function fetchPM25(lat, lng) {
  const url =
    'https://air-quality-api.open-meteo.com/v1/air-quality' +
    `?latitude=${lat}&longitude=${lng}&hourly=pm2_5&timezone=Asia%2FManila`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Air quality service returned ${res.status}`);
  const data = await res.json();
  const values = data.hourly?.pm2_5 ?? [];
  for (let i = values.length - 1; i >= 0; i--) {
    if (typeof values[i] === 'number' && Number.isFinite(values[i])) return values[i];
  }
  throw new Error('Air quality service returned no PM2.5 reading');
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * A PM2.5 spike is corroboration, not a fire location. It can strengthen an
 * existing nearby report, but this function deliberately never writes to
 * `reports` and therefore cannot create a pin from a citywide reading alone.
 */
exports.pollAirQuality = onSchedule(
  {
    schedule: 'every 15 minutes',
    timeoutSeconds: 30,
  },
  async () => {
    const db = getDatabase();
    const historyRef = db.ref('_meta/pm25History');
    const stored = (await historyRef.get()).val();
    const history = Array.isArray(stored)
      ? stored
      : Object.values(stored ?? {});
    const readings = history.filter((value) => typeof value === 'number' && Number.isFinite(value));
    const value = await fetchPM25(...SURIGAO_CENTER);
    const baseline = readings.length ? median(readings) : value;
    const ratio = baseline > 0 ? value / baseline : 1;
    const detectedAt = new Date().toISOString();

    if (readings.length && ratio >= PM25_SPIKE_RATIO) {
      await db.ref(`airQualitySignals/${Date.now()}`).set({
        value,
        baseline,
        ratio,
        detectedAt,
      });
    }

    await historyRef.set([...readings, value].slice(-HISTORY_LIMIT));
  }
);

exports.fetchPM25 = fetchPM25;

