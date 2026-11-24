import { ONI_URL, WEEKLY_URL, parseOniText, parseWeeklyText, buildEnsoContext } from '../src/lib/ensoData.js';

const REQUEST_TIMEOUT_MS = 12_000;

async function fetchText(url, signal) {
  const upstream = await fetch(url, { signal, headers: { Accept: 'text/plain' } });
  if (!upstream.ok) throw new Error(`NOAA feed returned ${upstream.status}`);
  return upstream.text();
}

/** NOAA ONI history plus the weekly Niño 3.4 readings (see src/lib/ensoData.js). */
export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const [oniText, weeklyText] = await Promise.all([
      fetchText(ONI_URL, controller.signal),
      // The weekly readings are a bonus: the ONI alone still answers.
      fetchText(WEEKLY_URL, controller.signal).catch(() => ''),
    ]);
    const context = buildEnsoContext(parseOniText(oniText), parseWeeklyText(weeklyText));
    response.setHeader('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=43200');
    return response.status(200).json(context);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'NOAA ONI feed is unavailable';
    return response.status(502).json({ error: message });
  } finally {
    clearTimeout(timeoutId);
  }
}
