import { parseEarthquakeBulletin } from '../src/lib/earthquakes.js';

const PHIVOLCS_ORIGIN = 'https://earthquake.phivolcs.dost.gov.ph';
const BULLETIN_PATH_PATTERN = /^\/\d{4}_Earthquake_Information\/[A-Za-z]+\/\d{4}(?:_\d{4})?_\d{4,}_B1F?\.html$/;
const REQUEST_TIMEOUT_MS = 12_000;

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const path = request.query?.path;
  if (typeof path !== 'string' || !BULLETIN_PATH_PATTERN.test(path)) {
    return response.status(400).json({ error: 'Invalid earthquake bulletin path' });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const pageUrl = new URL(path, PHIVOLCS_ORIGIN);
    const upstream = await fetch(pageUrl, {
      signal: controller.signal,
      headers: { Accept: 'text/html' },
    });
    if (!upstream.ok) {
      return response.status(502).json({ error: `PHIVOLCS bulletin returned ${upstream.status}` });
    }

    const html = await upstream.text();
    response.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return response.status(200).json(parseEarthquakeBulletin(html, pageUrl.href));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Earthquake bulletin is unavailable';
    return response.status(502).json({ error: message });
  } finally {
    clearTimeout(timeoutId);
  }
}
