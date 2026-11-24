/**
 * Some phone and tablet graphics chips (seen on iPads) cannot draw the full
 * map: the 3D globe view comes out see-through, or the chip crashes and the
 * browser shuts the map's graphics off ("context lost"). These helpers step
 * such a device down to a lighter map and remember it on that device:
 *
 *   level 0  full map: 3D globe, sky, tilt and 3D buildings
 *   level 1  flat map (no globe, no sky)
 *   level 2  flat map, no tilt or 3D buildings, drawn at lower sharpness
 */

const LEVEL_KEY = 'sentralert-map-level-v1';
// Written by the first version of this check (flat map only).
const OLD_FLAT_KEY = 'sentralert-map-flat-v1';
// Reload at most once per level in a visit, so a device can never loop.
const RELOADED_KEY = 'sentralert-map-reloaded-level';
export const MAX_MAP_LEVEL = 2;
// Long enough for a slow phone to draw its first frames after 'load'.
const CHECK_AFTER_MS = 4000;
// A crash this soon after the map starts is the device, not a passing glitch.
export const STARTUP_CRASH_MS = 30000;

function read(storage, key) {
  try {
    return window[storage].getItem(key);
  } catch {
    return null;
  }
}

function write(storage, key, value) {
  try {
    window[storage].setItem(key, value);
  } catch {
    // Storage off (private mode): the step-down still applies to this visit.
  }
}

let sessionLevel = null;

/** How far this device has been stepped down (0 = full map). */
export function mapLevel() {
  if (sessionLevel !== null) return sessionLevel;
  const stored = Number(read('localStorage', LEVEL_KEY));
  const level = Number.isInteger(stored) && stored > 0 ? stored : 0;
  sessionLevel = Math.min(Math.max(level, read('localStorage', OLD_FLAT_KEY) === '1' ? 1 : 0), MAX_MAP_LEVEL);
  return sessionLevel;
}

/** Steps this device down one level (up to MAX_MAP_LEVEL); returns the new level. */
export function lowerMapLevel(to = mapLevel() + 1) {
  sessionLevel = Math.min(Math.max(to, mapLevel()), MAX_MAP_LEVEL);
  write('localStorage', LEVEL_KEY, String(sessionLevel));
  return sessionLevel;
}

/** True once this device has shown it cannot draw the globe. */
export function globeBlocked() {
  return mapLevel() >= 1;
}

/** True when the map should skip tilt and 3D buildings and draw at lower sharpness. */
export function lightMap() {
  return mapLevel() >= 2;
}

/**
 * Reloads the page once for the current level. Returns false when this visit
 * already reloaded for it (then the caller shows a message instead).
 */
export function reloadForLevel() {
  const level = String(mapLevel());
  if (read('sessionStorage', RELOADED_KEY) === level) return false;
  write('sessionStorage', RELOADED_KEY, level);
  window.setTimeout(() => window.location.reload(), 1200);
  return true;
}

// Spots across the map. A working map paints every one of them: its land and
// sea fill the whole canvas, and the globe view adds a sky around the globe.
const SAMPLE_POINTS = [[0.5, 0.5], [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]];

/**
 * Whether the frame MapLibre just drew put anything on screen. Must run in a
 * 'render' handler, before the browser shows the frame and clears it.
 * Returns null when this frame cannot be read.
 */
function frameHasPixels(gl) {
  if (gl.isContextLost()) return null;
  // Only read the visible canvas, and never disturb MapLibre's own bindings.
  if (gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) !== null) return null;
  if (gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING) !== null) return null;
  const pixel = new Uint8Array(4);
  const width = gl.drawingBufferWidth;
  const height = gl.drawingBufferHeight;
  return SAMPLE_POINTS.some(([x, y]) => {
    gl.readPixels(Math.floor(width * x), Math.floor(height * y), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    return pixel[3] > 0;
  });
}

/**
 * Watches a freshly loaded map. If nothing is drawn with the globe, switches
 * to the flat map (onFlat); if even that draws nothing, reports it (onFail).
 * Returns a function that stops watching.
 */
export function watchMapDrawing(map, { onFlat, onFail }) {
  const gl = map.getCanvas().getContext('webgl2');
  if (!gl) return () => {};
  let stage = map.getProjection()?.type === 'globe' ? 'globe' : 'flat';
  let drawn = false;
  let timer = 0;
  let stopped = false;

  const onRender = () => {
    if (frameHasPixels(gl)) {
      drawn = true;
      stop();
    }
  };

  const decide = () => {
    if (stopped || drawn) return;
    // One more frame, read as it is drawn, before deciding.
    map.once('render', () => {
      if (stopped) return;
      const result = frameHasPixels(gl);
      if (result !== false) {
        if (result) stop();
        else timer = window.setTimeout(decide, CHECK_AFTER_MS);
        return;
      }
      if (stage === 'globe') {
        stage = 'flat';
        lowerMapLevel(1);
        map.setProjection({ type: 'mercator' });
        map.setSky(undefined);
        onFlat?.();
        timer = window.setTimeout(decide, CHECK_AFTER_MS);
      } else {
        stop();
        onFail?.();
      }
    });
    map.triggerRepaint();
  };

  function stop() {
    if (stopped) return;
    stopped = true;
    window.clearTimeout(timer);
    map.off('render', onRender);
  }

  map.on('render', onRender);
  timer = window.setTimeout(decide, CHECK_AFTER_MS);
  return stop;
}
