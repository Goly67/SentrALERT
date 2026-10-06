import { destination } from './geo.js';

/**
 * Fuel profiles tuned for Surigao City's urban fabric.
 *
 * baseRos          head rate of spread in metres/minute with no wind
 * structuresPerHa  rough building count per hectare
 * involvementRate  share of buildings inside the footprint that actually burn
 *
 * Dense residential is the important one here: walls physically touching means
 * fire moves building-to-building by direct contact, not only by radiant heat,
 * so its no-wind spread rate is already high before wind is applied.
 */
export const FUEL_PROFILES = {
  dense_residential: {
    label: 'Dense residential — walls touching, light materials',
    baseRos: 1.8,
    structuresPerHa: 160,
    involvementRate: 0.45,
  },
  mixed_residential: {
    label: 'Mixed residential — partial setbacks',
    baseRos: 1.1,
    structuresPerHa: 95,
    involvementRate: 0.5,
  },
  commercial: {
    label: 'Commercial / concrete',
    baseRos: 0.7,
    structuresPerHa: 45,
    involvementRate: 0.35,
  },
  sparse: {
    label: 'Sparse lots / open ground',
    baseRos: 0.45,
    structuresPerHa: 18,
    involvementRate: 0.3,
  },
};

/**
 * Length-to-breadth ratio of the spread ellipse (Anderson, 1983).
 * Stronger wind stretches the burn into a longer, narrower tongue.
 */
export function lengthToBreadth(windKmh) {
  // A calm-wind forecast still has a head direction from the weather model;
  // keep enough elongation to show that predicted direction instead of a dot.
  return Math.max(1.35, 1 + 8.729 * Math.pow(1 - Math.exp(-0.03 * Math.max(windKmh, 0)), 2.155));
}

/** Head-to-back ratio derived from the ellipse eccentricity. */
export function headToBackRatio(lb) {
  const e = Math.sqrt(Math.max(lb * lb - 1, 1e-9));
  return (lb + e) / Math.max(lb - e, 1e-6);
}

/** Head rate of spread in metres per minute. */
export function headRateOfSpread({ fuel, windKmh, humidity = 75 }) {
  const profile = FUEL_PROFILES[fuel] ?? FUEL_PROFILES.mixed_residential;
  const windFactor = Math.min(1 + 0.14 * Math.max(windKmh, 0), 7);
  const moistureFactor = Math.min(Math.max(1.3 - humidity / 160, 0.55), 1.3);
  return profile.baseRos * windFactor * moistureFactor;
}

/**
 * Project the burn footprint after `minutes` of unchecked spread.
 *
 * This is a worst case: it assumes nothing is suppressing the fire for the
 * whole window. That is the point — the alarm should be called for the fire
 * that is coming, not the one already burning.
 *
 * Returns an ellipse whose rear focus sits on the ignition point, oriented
 * downwind. `windFromDeg` is the meteorological convention (the direction the
 * wind blows FROM), so the fire heads toward windFromDeg + 180.
 */
export function projectSpread({
  origin,
  windFromDeg,
  windKmh,
  fuel,
  minutes,
  humidity = 75,
  points = 72,
}) {
  const profile = FUEL_PROFILES[fuel] ?? FUEL_PROFILES.mixed_residential;
  const ros = headRateOfSpread({ fuel, windKmh, humidity });
  const headBearing = (windFromDeg + 180) % 360;

  const headDistance = ros * minutes;
  const lb = lengthToBreadth(windKmh);
  const hb = headToBackRatio(lb);
  const backDistance = headDistance / hb;

  const a = (headDistance + backDistance) / 2;
  const b = a / lb;
  const center = destination(origin, headBearing, a - backDistance);

  const polygon = [];
  for (let i = 0; i < points; i += 1) {
    const theta = (i / points) * 2 * Math.PI;
    const along = a * Math.cos(theta);
    const cross = b * Math.sin(theta);
    const dist = Math.hypot(along, cross);
    const bearing = (headBearing + (Math.atan2(cross, along) * 180) / Math.PI + 360) % 360;
    polygon.push(destination(center, bearing, dist));
  }

  const areaHa = (Math.PI * a * b) / 10000;
  const estimatedStructures = Math.round(
    areaHa * profile.structuresPerHa * profile.involvementRate
  );

  return {
    minutes,
    polygon,
    headBearing,
    headDistanceM: headDistance,
    flankWidthM: b * 2,
    areaHa,
    estimatedStructures,
    rosMetresPerMin: ros,
  };
}

/** Projections at several horizons, widest first so smaller ones draw on top. */
export function projectHorizons(params, horizons = [60, 30, 15]) {
  return horizons.map((minutes) => projectSpread({ ...params, minutes }));
}
