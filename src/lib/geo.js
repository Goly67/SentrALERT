const EARTH_RADIUS_M = 6371000;

export const USER_LOCATION_PERIMETER_M = 100;

export const toRad = (deg) => (deg * Math.PI) / 180;
export const toDeg = (rad) => (rad * 180) / Math.PI;

/** Move from [lat, lng] along a compass bearing for a distance in metres. */
export function destination([lat, lng], bearingDeg, distanceM) {
  const d = distanceM / EARTH_RADIUS_M;
  const brg = toRad(bearingDeg);
  const lat1 = toRad(lat);
  const lng1 = toRad(lng);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brg)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(brg) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
    );

  return [toDeg(lat2), ((toDeg(lng2) + 540) % 360) - 180];
}

/** Great-circle distance in metres between two [lat, lng] points. */
export function distanceMeters([lat1, lng1], [lat2, lng2]) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/** Initial compass bearing from point A to point B, in degrees. */
export function bearingBetween([lat1, lng1], [lat2, lng2]) {
  const p1 = toRad(lat1);
  const p2 = toRad(lat2);
  const dl = toRad(lng2 - lng1);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** "NE", "SSW", etc. from a bearing in degrees. */
export function compassLabel(bearingDeg) {
  const points = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return points[Math.round((bearingDeg % 360) / 22.5) % 16];
}
