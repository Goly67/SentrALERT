import { useEffect, useRef, useState } from 'react';

const MAX_MINUTES = 60;

/**
 * Scrub the spread projection forward in time. Watching the front move is the
 * part that makes the wind model legible — a static polygon reads as a blob,
 * a moving one reads as a direction to get out of.
 */
export default function Timeline({ minutes, onChange, alarmColor }) {
  const [playing, setPlaying] = useState(false);
  const frame = useRef(null);
  const last = useRef(null);

  useEffect(() => {
    if (!playing) return undefined;

    const step = (now) => {
      if (last.current == null) last.current = now;
      const delta = (now - last.current) / 1000;
      last.current = now;

      onChange((prev) => {
        const next = prev + delta * 12; // 12 projected minutes per real second
        if (next >= MAX_MINUTES) {
          setPlaying(false);
          return MAX_MINUTES;
        }
        return next;
      });
      frame.current = requestAnimationFrame(step);
    };

    frame.current = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame.current);
      last.current = null;
    };
  }, [playing, onChange]);

  function toggle() {
    if (!playing && minutes >= MAX_MINUTES) onChange(0);
    setPlaying((p) => !p);
  }

  return (
    <div className="timeline" style={{ '--alarm': alarmColor }}>
      <button
        className={`play ${playing ? 'is-playing' : ''}`}
        onClick={toggle}
        aria-label={playing ? 'Pause the projection' : 'Play the projection'}
      >
        <span className="play-glyph" />
      </button>

      <div className="timeline-track">
        <input
          type="range"
          min="0"
          max={MAX_MINUTES}
          step="1"
          value={Math.round(minutes)}
          aria-label="Minutes from now"
          onChange={(e) => {
            setPlaying(false);
            onChange(Number(e.target.value));
          }}
        />
        <div className="timeline-marks">
          <span>now</span>
          <span>15</span>
          <span>30</span>
          <span>45</span>
          <span>60 min</span>
        </div>
      </div>

      <span className="timeline-readout">+{Math.round(minutes)}′</span>
    </div>
  );
}
