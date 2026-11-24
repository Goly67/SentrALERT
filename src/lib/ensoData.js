/**
 * El Niño / ENSO readings from NOAA's Climate Prediction Center, shared by the
 * site and the /api/enso function:
 *
 * - ONI (Oceanic Niño Index): 3-month average sea-surface temperature anomaly
 *   in the Niño 3.4 region of the Pacific, monthly since 1950. NOAA calls an
 *   El Niño when it stays at +0.5 °C or more for five overlapping seasons.
 * - Weekly Niño 3.4 anomaly: the same region, one reading per week (NOAA does
 *   not publish a daily index), since 1981.
 */

export const ONI_URL = 'https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt';
export const WEEKLY_URL = 'https://www.cpc.ncep.noaa.gov/data/indices/wksst9120.for';

// ONI seasons, each named by its three months; the middle month is the date.
const SEASONS = ['DJF', 'JFM', 'FMA', 'MAM', 'AMJ', 'MJJ', 'JJA', 'JAS', 'ASO', 'SON', 'OND', 'NDJ'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** ONI rows from oni.ascii.txt: { season, year, oni }. */
export function parseOniText(text) {
  const rows = [];
  const pattern = /^\s*([A-Z]{3})\s+(\d{4})\s+[-\d.]+\s+(-?\d+(?:\.\d+)?)/gm;
  for (const match of String(text).matchAll(pattern)) {
    rows.push({ season: match[1], year: Number(match[2]), oni: Number(match[3]) });
  }
  return rows;
}

/** Weekly Niño 3.4 anomalies from wksst9120.for: { date: 'YYYY-MM-DD', nino34 }. */
export function parseWeeklyText(text) {
  const rows = [];
  for (const line of String(text).split(/\r?\n/)) {
    const match = /^\s*(\d{2})([A-Z]{3})(\d{4})\s+(.*)$/.exec(line);
    if (!match) continue;
    const month = MONTHS.indexOf(match[2]);
    // Columns run together when an anomaly is negative ("20.6-0.1").
    const values = match[4].match(/-?\d+\.\d/g)?.map(Number) ?? [];
    if (month < 0 || values.length < 8) continue;
    rows.push({ date: `${match[3]}-${String(month + 1).padStart(2, '0')}-${match[1]}`, nino34: values[5] });
  }
  return rows;
}

/** Short phase name from the latest ONI readings (kept for the fire-risk layer). */
export function phaseFor(rows) {
  const latest = rows.at(-1);
  const recent = rows.slice(-5);
  if (recent.length === 5 && recent.every(({ oni }) => oni >= 0.5)) return 'El Niño';
  if (recent.length === 5 && recent.every(({ oni }) => oni <= -0.5)) return 'La Niña';
  if (latest.oni >= 0.5) return 'El Niño signal';
  if (latest.oni <= -0.5) return 'La Niña signal';
  if (latest.oni >= 0.2) return 'Warm ENSO signal';
  if (latest.oni <= -0.2) return 'Cool ENSO signal';
  return 'Near-neutral';
}

/** The whole feed the site uses: latest + recent (as before), plus history for the timeline. */
export function buildEnsoContext(oniRows, weeklyRows = []) {
  if (oniRows.length < 5) throw new Error('ENSO feed contained too few readings');
  return {
    latest: oniRows.at(-1),
    recent: oniRows.slice(-6),
    phase: phaseFor(oniRows),
    history: oniRows,
    // Two years of weeks is plenty for the timeline.
    weekly: weeklyRows.slice(-104),
    source: 'NOAA CPC ONI and weekly Niño 3.4',
  };
}

/** NOAA's strength bands for an anomaly in °C. */
export function ensoStrength(value) {
  if (!Number.isFinite(value)) return { label: 'No reading', tone: 'none' };
  const size = Math.abs(value);
  if (size < 0.5) return { label: 'Neutral', tone: 'neutral' };
  const kind = value > 0 ? 'El Niño' : 'La Niña';
  const tone = value > 0 ? 'warm' : 'cool';
  if (size >= 2) return { label: `Very strong ${kind}`, tone };
  if (size >= 1.5) return { label: `Strong ${kind}`, tone };
  if (size >= 1) return { label: `Moderate ${kind}`, tone };
  return { label: `Weak ${kind}`, tone };
}

// NASA's daily sea-surface temperature anomaly maps start here.
export const SST_MAP_FIRST_DATE = '2019-07-23';

const seasonCenter = ({ season, year }) => {
  // DJF 2026 is Dec 2025 - Feb 2026: its middle month is January 2026.
  const month = SEASONS.indexOf(season);
  return { month, year };
};
const isoDay = (year, month, day) => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const shortDate = (iso) => {
  const [year, month, day] = iso.split('-').map(Number);
  return `${day} ${MONTH_NAMES[month - 1]} ${year}`;
};

const point = (id, label, longLabel, value, date) => ({
  id, label, longLabel, value, date,
  // Only dates NASA has a map for move the map.
  mapDate: date >= SST_MAP_FIRST_DATE ? date : null,
});

/**
 * The three timelines, oldest first; the last point of each is "now".
 *   weeks:  weekly Niño 3.4 for the last 26 weeks
 *   months: ONI for the last 24 seasons
 *   years:  ONI for the same season as now, for the last 30 years
 */
export function ensoTimelines(context, { weeks = 26, months = 24, years = 30 } = {}) {
  const history = context?.history ?? [];
  const weekly = context?.weekly ?? [];
  const seasonPoint = (row) => {
    const { month, year } = seasonCenter(row);
    const label = `${MONTH_NAMES[month]} ${String(year).slice(2)}`;
    return point(`${row.season}-${row.year}`, label, `${row.season} ${row.year} (3 months around ${MONTH_NAMES[month]} ${year})`, row.oni, isoDay(year, month, 15));
  };
  const latest = history.at(-1);
  return {
    weeks: weekly.slice(-weeks).map((row) => {
      const [, month, day] = row.date.split('-').map(Number);
      return point(`w-${row.date}`, `${day} ${MONTH_NAMES[month - 1]}`, `Week of ${shortDate(row.date)}`, row.nino34, row.date);
    }),
    months: history.slice(-months).map(seasonPoint),
    years: latest
      ? history.filter((row) => row.season === latest.season).slice(-years).map((row) => {
        const item = seasonPoint(row);
        return { ...item, label: String(row.year) };
      })
      : [],
  };
}

/** Plain-language comparison of a past reading with now. */
export function compareWithNow(then, now) {
  if (!then || !now || !Number.isFinite(then.value) || !Number.isFinite(now.value)) return '';
  const diff = Math.round((now.value - then.value) * 10) / 10;
  if (Math.abs(diff) < 0.1) return 'About the same as now.';
  return `Now is ${Math.abs(diff).toFixed(1)} °C ${diff > 0 ? 'warmer' : 'cooler'} than then.`;
}
