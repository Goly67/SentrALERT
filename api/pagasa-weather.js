const PAGASA_HEADERS = {
  Accept: 'application/json, text/javascript, */*; q=0.01',
  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
  Origin: 'https://pagasa.dost.gov.ph',
  Referer: 'https://pagasa.dost.gov.ph/',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.7871.250 Safari/537.36',
  'X-Requested-With': 'XMLHttpRequest',
};

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const upstream = await fetch('https://pagasa.dost.gov.ph/api/NearestAWS', {
      method: 'POST',
      headers: PAGASA_HEADERS,
      body: '',
    });

    if (!upstream.ok) return response.status(502).json({ error: 'Weather data is unavailable' });

    response.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');
    return response.status(200).json(await upstream.json());
  } catch {
    return response.status(502).json({ error: 'Weather data is unavailable' });
  }
}