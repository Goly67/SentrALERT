/**
 * Some phone and tablet graphics chips (seen on iPads) draw nothing at all
 * with the 3D globe view: the map stays see-through and only the page
 * background shows. These helpers notice that and fall back to the flat map,
 * which every device can draw, and remember it for this device.
 */

const FLAT_KEY = 'sentralert-map-flat-v1';
// Long enough for a slow phone to draw its first frames after 'load'.
const CHECK_AFTER_MS = 4000;

/** True once this device has shown it cannot draw the globe. */
export function globeBlocked() {
  try {
    return window.localStorage.getItem(FLAT_KEY) === '1';
  } catch {
    return false;
  }
}

function blockGlobe() {
  try {
    window.localStorage.setItem(FLAT_KEY, '1');
  } catch {
    // Storage off (private mode): the fallback still applies to this visit.
  }
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
 * Watches a freshly loaded map. If nothing is drawn, switches to the flat map
 * (onFlat), and if even that draws nothing, reports it (onFail). Returns a
 * function that stops watching.
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
        blockGlobe();
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
