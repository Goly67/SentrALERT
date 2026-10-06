import { distanceMeters } from './geo.js';

const STATION_CACHE_MS = 60 * 1000;
// PAGASA station feeds can lag by several hours, especially outside the main
// metro areas. Keep a full daily window so the map still shows the latest valid
// reading instead of dropping Surigao City just because the last update was
// earlier in the day.
const MAX_OBSERVATION_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_CITY_STATION_DISTANCE_M = 50_000;
const MAX_LOCAL_STATION_DISTANCE_M = 100_000;

let stationCache = null;
let stationRequest = null;

function parseMeasurement(value) {
  const match = String(value ?? '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

export function temperatureFeel(tempC) {
  if (typeof tempC !== 'number' || !Number.isFinite(tempC)) return 'weather unavailable';
  if (tempC < 20) return 'cold today';
  if (tempC < 24) return 'a bit cool today';
  if (tempC < 28) return 'mild today';
  if (tempC < 33) return 'warm today';
  return 'hot today';
}

function normalizePagasaStations(data) {
  const now = Date.now();
  const stationsById = new Map();

  for (const row of Object.values(data).flat()) {
    const tempC = parseMeasurement(row.temperature);
    const lat = Number(row.latitude);
    const lng = Number(row.longitude);
    const observedDate = new Date(`${row.datetime} GMT+0800`);
    const ageMs = now - observedDate.getTime();
    if (
      tempC == null || tempC < -10 || tempC > 60 ||
      !Number.isFinite(lat) || !Number.isFinite(lng) ||
      !Number.isFinite(ageMs) || ageMs < -5 * 60 * 1000 || ageMs > MAX_OBSERVATION_AGE_MS
    ) continue;

    const station = {
      id: `pagasa-${row.site_id}-${lat.toFixed(4)}-${lng.toFixed(4)}`,
      location: [lat, lng],
      tempC,
      rainMm: parseMeasurement(row.precipitation),
      humidity: parseMeasurement(row.humidity),
      observedAt: row.datetime,
      ageMs,
    };
    const previous = stationsById.get(station.id);
    if (!previous || station.ageMs < previous.ageMs) stationsById.set(station.id, station);
  }

  return [...stationsById.values()];
}

async function fetchPagasaStations(forceRefresh = false) {
  if (!forceRefresh && stationCache && Date.now() - stationCache.cachedAt < STATION_CACHE_MS) {
    return stationCache.value;
  }
  if (!forceRefresh && stationRequest) return stationRequest;

  stationRequest = fetch('/api/pagasa-weather', {
    method: 'POST',
    headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
  })
    .then((response) => {
      if (!response.ok) throw new Error(`Weather service returned ${response.status}`);
      return response.json();
    })
    .then((data) => {
      const value = normalizePagasaStations(data);
      stationCache = { value, cachedAt: Date.now() };
      return value;
    })
    .catch(() => stationCache?.value ?? [])
    .finally(() => { stationRequest = null; });

  return stationRequest;
}

export async function fetchCityTemperatures(cities, forceRefresh = false) {
  const stations = await fetchPagasaStations(forceRefresh);
  const cityStations = new Map();

  for (const station of stations) {
    let closestCity = null;
    let closestDistance = Infinity;
    for (const city of cities) {
      const distance = distanceMeters(station.location, city.location);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestCity = city;
      }
    }

    if (!closestCity || closestDistance > MAX_CITY_STATION_DISTANCE_M) continue;
    const previous = cityStations.get(closestCity.id);
    if (!previous || closestDistance < previous.distance) {
      cityStations.set(closestCity.id, {
        ...station,
        name: closestCity.name,
        distance: closestDistance,
      });
    }
  }

  return [...cityStations.values()].map(({ distance, ...station }) => station);
}

export async function fetchLocalWeather([lat, lng], forceRefresh = false) {
  const stations = await fetchPagasaStations(forceRefresh);
  let nearest = null;
  let nearestDistance = Infinity;

  for (const station of stations) {
    const distance = distanceMeters([lat, lng], station.location);
    if (distance < nearestDistance) {
      nearest = station;
      nearestDistance = distance;
    }
  }

  if (!nearest || nearestDistance > MAX_LOCAL_STATION_DISTANCE_M) return null;
  return {
    tempC: nearest.tempC,
    rainMm: nearest.rainMm,
    humidity: nearest.humidity,
    observedAt: nearest.observedAt,
  };
}