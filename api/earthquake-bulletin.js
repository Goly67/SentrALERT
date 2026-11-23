import https from 'node:https';
import zlib from 'node:zlib';
import { parseEarthquakeBulletin } from '../src/lib/earthquakes.js';
import { phivolcsAgent } from '../server/phivolcs-ca.js';

const PHIVOLCS_ORIGIN = 'https://earthquake.phivolcs.dost.gov.ph';
const BULLETIN_PATH_PATTERN = /^\/\d{4}_Earthquake_Information\/[A-Za-z]+\/\d{4}(?:_\d{4})?_\d{4,}_B1F?\.html$/;
const REQUEST_TIMEOUT_MS = 12_000;

/**
 * GET a PHIVOLCS page as text. Uses https (not fetch) so the request can use
 * phivolcsAgent, which trusts PHIVOLCS's intermediate certificate even when
 * their server leaves it out (see server/phivolcs-ca.js).
 */
function getPhivolcsPage(url, signal) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      agent: phivolcsAgent,
      signal,
      headers: { Accept: 'text/html', 'Accept-Encoding': 'gzip, deflate, br' },
    }, (upstream) => {
      // PHIVOLCS compresses its pages (fetch used to unpack this for us).
      const encoding = String(upstream.headers['content-encoding'] || '').toLowerCase();
      const stream = encoding === 'gzip' ? upstream.pipe(zlib.createGunzip())
        : encoding === 'deflate' ? upstream.pipe(zlib.createInflate())
          : encoding === 'br' ? upstream.pipe(zlib.createBrotliDecompress())
            : upstream;
      let body = '';
      stream.setEncoding('utf8');
      stream.on('data', (chunk) => { body += chunk; });
      stream.on('end', () => resolve({ ok: upstream.statusCode >= 200 && upstream.statusCode < 300, status: upstream.statusCode, text: body }));
      stream.on('error', reject);
      upstream.on('error', reject);
    });
    request.on('error', reject);
  });
}

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
    const upstream = await getPhivolcsPage(pageUrl, controller.signal);
    if (!upstream.ok) {
      return response.status(502).json({ error: `PHIVOLCS bulletin returned ${upstream.status}` });
    }

    const html = upstream.text;
    response.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return response.status(200).json(parseEarthquakeBulletin(html));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Earthquake bulletin is unavailable';
    return response.status(502).json({ error: message });
  } finally {
    clearTimeout(timeoutId);
  }
}
