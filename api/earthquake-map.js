const PHIVOLCS_ORIGIN = 'https://earthquake.phivolcs.dost.gov.ph';
const MAP_PATH_PATTERN = /^\/\d{4}_Earthquake_Information\/[A-Za-z]+\/\d{4}(?:_\d{4})?_\d{4,}_B1F?\.jpg$/;
const REQUEST_TIMEOUT_MS = 12_000;

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const path = request.query?.path;
  if (typeof path !== 'string' || !MAP_PATH_PATTERN.test(path)) {
    return response.status(400).json({ error: 'Invalid earthquake map path' });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const upstream = await fetch(new URL(path, PHIVOLCS_ORIGIN), {
      signal: controller.signal,
      headers: { Accept: 'image/jpeg' },
    });
    if (!upstream.ok) {
      return response.status(502).json({ error: `PHIVOLCS map returned ${upstream.status}` });
    }

    const contentType = upstream.headers.get('content-type')?.split(';')[0];
    if (contentType !== 'image/jpeg' && contentType !== 'image/png') {
      return response.status(502).json({ error: 'PHIVOLCS returned an unsupported map image' });
    }

    response.setHeader('Content-Type', contentType);
    response.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return response.status(200).send(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Earthquake map is unavailable';
    return response.status(502).json({ error: message });
  } finally {
    clearTimeout(timeoutId);
  }
}
