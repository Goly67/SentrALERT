/**
 * Current PM2.5 from Copernicus CAMS via Open-Meteo's free air-quality API.
 * This is an observed/assimilated baseline for the current map, not a
 * replacement for the app's fire-trajectory forecast.
 */

export async function fetchPm25(points) {
  if (!points.length) return [];

  const lat = points.map(([value]) => value).join(',');
  const lon = points.map(([, value]) => value).join(',');
  const url =
    'https://air-quality-api.open-meteo.com/v1/air-quality' +
    `?latitude=${lat}&longitude=${lon}&current=pm2_5&domains=auto&timezone=auto`;

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Air quality service returned ${response.status}`);

  const data = await response.json();
  const locations = Array.isArray(data) ? data : [data];
  return points.map((_, index) => {
    const value = locations[index]?.current?.pm2_5;
    return typeof value === 'number' ? value : null;
  });
}

