// Floating pill shown on the map whenever the earthquake layer is on.
// It stays visible even after the Alerts panel is closed with the X,
// so people always have a clear way back to the fire map.
export default function EarthquakeExitChip({ onExit }) {
  return (
    <div className="quake-exit-chip" role="status" aria-live="polite">
      <span className="quake-exit-icon" aria-hidden="true" />
      <span className="quake-exit-label">Earthquake layer on</span>
      <button type="button" className="quake-exit-btn" onClick={onExit}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M19 12H5M11 6l-6 6 6 6" />
        </svg>
        Back to fire map
      </button>
    </div>
  );
}