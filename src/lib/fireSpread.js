import { destination } from './geo.js';

/**
 * Building stock for each kind of neighbourhood. The spread formula below
 * works from these, so they decide how fast a fire moves.
 *
 * sideM               typical building side length in metres
 * structuresPerHa     rough building count per hectare (sets the gap between them)
 * fireResistantRatio  share of buildings that resist fire (concrete, block)
 * involvementRate     share of buildings inside the footprint that actually burn
 *
 * ASSUMED, not surveyed: replace with BFP / barangay figures when available.
 */
export const FUEL_PROFILES = {
  dense_residential: {
    label: 'Dense residential — walls touching, light materials',
    sideM: 6,
    structuresPerHa: 160,
    fireResistantRatio: 0.1,
    involvementRate: 0.45,
  },
  mixed_residential: {
    label: 'Mixed residential — partial setbacks',
    sideM: 7.5,
    structuresPerHa: 95,
    fireResistantRatio: 0.35,
    involvementRate: 0.5,
  },
  commercial: {
    label: 'Commercial / concrete',
    sideM: 12,
    structuresPerHa: 45,
    fireResistantRatio: 0.8,
    involvementRate: 0.35,
  },
  sparse: {
    label: 'Sparse lots / open ground',
    sideM: 8,
    structuresPerHa: 18,
    fireResistantRatio: 0.2,
    involvementRate: 0.3,
  },
};

const profileFor = (fuel) => FUEL_PROFILES[fuel] ?? FUEL_PROFILES.mixed_residential;

// The formula assumes fire always crosses to the next building. That holds in
// close-built towns but not across open lots, where it would run faster than
// through dense housing, so wider gaps only thin out the chain of buildings.
const MAX_BRIDGED_GAP_M = 5;

// At or below this (Beaufort "light air") wind has no reliable direction and a
// fire's own heat drives it, so it spreads evenly. The formula is fitted to
// windy fires and would still push one way, so it eases in up to the next limit.
export const CALM_WIND_KMH = 5;
const STEADY_WIND_KMH = 10;

/**
 * Spread rates in metres per minute from the Hamada urban fire model, an
 * empirical fit to real Japanese town fires: downwind (head), sideways (flank)
 * and against the wind (back). Fire still backs into the wind, by radiant heat
 * and contact between buildings, so `back` is never zero. Coefficients as
 * implemented in FireBench's `Hamada_1` (see Himoto & Tanaka, Fire Safety
 * Journal 43(7), 2008). Fitted to Japanese towns, not checked against
 * Philippine fires, and it assumes nobody is fighting the fire.
 */
export function spreadRates({ fuel, windKmh }) {
  const profile = profileFor(fuel);
  const wind = Math.max(windKmh, 0) / 3.6;
  const side = profile.sideM;
  const spacing = Math.sqrt(10000 / profile.structuresPerHa);
  const gap = Math.min(Math.max(spacing - side, 0.5), MAX_BRIDGED_GAP_M);
  const thinning = Math.min((side + gap) / spacing, 1);
  const r = profile.fireResistantRatio;
  // Minutes for fire to cross one building and the gap to the next.
  const crossing = (gapFactor) => (
    (1 - r) * (3 + 0.375 * side + (8 * gap) / gapFactor)
    + r * (5 + 0.625 * side + (16 * gap) / gapFactor)
  );
  const rate = (minutes) => ((side + gap) / minutes) * thinning;
  const head = rate(crossing(25 + 2.5 * wind) / (1.5 * (1 + 0.1 * wind + 0.007 * wind * wind)));
  const flank = rate(crossing(5 + 0.25 * wind) / (1 + 0.005 * wind * wind));
  const back = rate(crossing(5 + 0.2 * wind) / (1 + 0.002 * wind * wind));
  const directional = Math.min(
    Math.max((windKmh - CALM_WIND_KMH) / (STEADY_WIND_KMH - CALM_WIND_KMH), 0), 1
  );
  return {
    head: flank + (head - flank) * directional,
    flank,
    back: flank + (back - flank) * directional,
  };
}

/** Rate toward a direction, where k is the cosine of its angle from downwind. */
function rateToward(k, { head, flank, back }) {
  if (k >= 0) {
    const e = (head - flank) / head;
    return ((head * head) / (2 * head - flank)) * (1 - e * e) / (1 - e * k);
  }
  return (flank * back) / Math.sqrt(back * back * (1 - k * k) + flank * flank * k * k);
}

/**
 * Water estimate per burning dwelling, NFPA 1142 method:
 *   WS (gal) = volume (ft³) × construction class / occupancy hazard, × 1.5 with exposures.
 * Typical dwelling: 30 m² floor (PSA 2020 census: ~46% of homes are under 30 m²,
 * 79% are one storey) × 2.7 m height; wood/light frame = construction class 1.5;
 * dwellings = occupancy hazard 7; neighbours within 50 ft → × 1.5.
 * ≈ 919 gal ≈ 3,480 L per structure.
 */
const DWELLING_VOLUME_FT3 = 30 * 2.7 * 35.3147;
export const WATER_PER_STRUCTURE_L = ((DWELLING_VOLUME_FT3 * 1.5) / 7) * 1.5 * 3.78541;
/** BFP Isuzu FVR34 modernization trucks carry 1,000 gal (3,785 L). */
export const BFP_TRUCK_TANK_L = 3785;

export function waterNeededLitres(structures) {
  return Math.round((Math.max(structures, 1) * WATER_PER_STRUCTURE_L) / 100) * 100;
}

/**
 * Project the burn footprint after `minutes` of unchecked spread.
 *
 * This is a worst case: it assumes nothing is suppressing the fire for the
 * whole window. That is the point — the alarm should be called for the fire
 * that is coming, not the one already burning.
 *
 * Returns the footprint around the ignition point, stretched downwind.
 * `frontPolygon` is the half ahead of the fire and `rearPolygon` the slow half
 * behind it. `windFromDeg` is the meteorological convention (the direction the
 * wind blows FROM), so the fire heads toward windFromDeg + 180.
 */
export function projectSpread({
  origin,
  windFromDeg,
  windKmh,
  fuel,
  minutes,
  points = 72,
  existingStructures = 0,
}) {
  const profile = profileFor(fuel);
  // Spread speed is physics (buildings, wind), not the alarm level.
  const rates = spreadRates({ fuel, windKmh });
  const headBearing = (windFromDeg + 180) % 360;

  // Distance covered per minute in each direction, walking round from the
  // left flank through the head to the right flank, then behind the fire.
  const steps = Array.from({ length: points }, (_, i) => {
    const offsetDeg = (i / points) * 360 - 90;
    return { offsetDeg, rate: rateToward(Math.cos((offsetDeg * Math.PI) / 180), rates) };
  });

  // A higher alarm means the fire is already bigger when it is called, so
  // start from the time this fire would need to involve `existingStructures`
  // (area grows with time²; area per minute² = ½∮rate²dθ).
  const burnedPerHa = profile.structuresPerHa * profile.involvementRate;
  const stepRad = (2 * Math.PI) / points;
  const haPerMinSq = steps.reduce((sum, { rate }) => sum + 0.5 * rate * rate * stepRad, 0) / 10000;
  const headStartMinutes = existingStructures > 0
    ? Math.sqrt(existingStructures / (haPerMinSq * burnedPerHa))
    : 0;
  const elapsed = headStartMinutes + minutes;

  const outline = steps.map(({ offsetDeg, rate }) => ({
    offsetDeg,
    point: destination(origin, (headBearing + offsetDeg + 360) % 360, rate * elapsed),
  }));
  // In calm air there is no "ahead" or "behind": the whole ring is one zone.
  const calm = windKmh <= CALM_WIND_KMH;
  const ring = outline.map(({ point }) => point);
  const front = calm
    ? [...ring, ring[0]]
    : outline.filter(({ offsetDeg }) => offsetDeg <= 90).map(({ point }) => point);
  const rear = outline.filter(({ offsetDeg }) => offsetDeg >= 90).map(({ point }) => point);
  rear.push(outline[0].point);

  const areaHa = haPerMinSq * elapsed * elapsed;
  const estimatedStructures = Math.round(areaHa * burnedPerHa);

  return {
    minutes,
    headStartMinutes,
    calm,
    polygon: ring,
    frontArc: front,
    frontPolygon: calm ? ring : [origin, ...front],
    rearPolygon: calm ? [] : [origin, ...rear],
    headBearing,
    headDistanceM: rates.head * elapsed,
    backDistanceM: rates.back * elapsed,
    flankWidthM: rates.flank * elapsed * 2,
    areaHa,
    estimatedStructures,
    rosMetresPerMin: rates.head,
    backRosMetresPerMin: rates.back,
  };
}

/** Structures expected to burn, given the real buildings mapped inside a footprint. */
export function burningFromMapped(mappedBuildings, fuel) {
  return Math.round(mappedBuildings * profileFor(fuel).involvementRate);
}

/**
 * Buildings OpenStreetMap has inside a [lat, lng] polygon, read from the map's
 * own loaded vector tiles, so the sea and empty land count for nothing.
 * Returns null when the map cannot say: zoomed too far out for building tiles,
 * or no buildings mapped there (which may only mean nobody has mapped them).
 */
export function countMappedBuildings(map, polygon) {
  if (!map?.getSource('openmaptiles') || map.getZoom() < 14) return null;
  const ring = polygon.map(([lat, lng]) => [lng, lat]);
  const seen = new Set();
  // A tile merges a whole neighbourhood into one feature, and repeats it for
  // each tile it touches, so walk every polygon and dedupe by position, not id.
  for (const { geometry } of map.querySourceFeatures('openmaptiles', { sourceLayer: 'building' })) {
    const buildings = geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates];
    for (const [outline] of buildings) {
      if (!outline?.length) continue;
      const lng = outline.reduce((sum, c) => sum + c[0], 0) / outline.length;
      const lat = outline.reduce((sum, c) => sum + c[1], 0) / outline.length;
      if (insideRing([lng, lat], ring)) seen.add(`${lng.toFixed(5)},${lat.toFixed(5)}`);
    }
  }
  return seen.size > 0 ? seen.size : null;
}

function insideRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Projections at several horizons, widest first so smaller ones draw on top. */
export function projectHorizons(params, horizons = [60, 30, 15]) {
  return horizons.map((minutes) => projectSpread({ ...params, minutes }));
}
