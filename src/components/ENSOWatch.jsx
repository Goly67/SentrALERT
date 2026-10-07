import { useEffect, useState } from 'react';

const NOAA_SOURCE = 'https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt';

export default function ENSOWatch({ enabled }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetch('/api/enso', { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `ENSO data request failed (${response.status})`);
        if (!result.latest || !Number.isFinite(result.latest.oni) || !result.phase) {
          throw new Error('ENSO data response was incomplete.');
        }
        setData(result);
      })
      .catch((fetchError) => {
        if (fetchError.name !== 'AbortError') {
          setError(fetchError instanceof Error ? fetchError.message : 'NOAA ENSO data is unavailable.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [enabled, refreshKey]);

  if (!enabled) return null;

  return (
    <aside className="enso-map-card" aria-label="El Niño and ENSO status" aria-live="polite">
      <div className="enso-map-card-heading">
        <span className="enso-map-card-kicker">PACIFIC CLIMATE WATCH</span>
        <button
          type="button"
          className="enso-refresh"
          onClick={() => setRefreshKey((key) => key + 1)}
          disabled={loading}
          aria-label="Refresh ENSO reading"
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>
      {data ? (
        <>
          <strong className="enso-map-phase">{data.phase}</strong>
          <div className="enso-map-reading">
            <span>{data.latest.season} {data.latest.year}</span>
            <b>{data.latest.oni > 0 ? '+' : ''}{data.latest.oni.toFixed(1)} °C</b>
          </div>
          {error && <p className="enso-map-stale">Latest refresh failed: {error}</p>}
        </>
      ) : error ? (
        <p className="enso-map-error" role="alert">{error}</p>
      ) : (
        <p className="enso-map-loading">Loading the latest NOAA Oceanic Niño Index…</p>
      )}
      <p className="enso-map-note">
        Colored ocean layer: sea-surface temperature anomaly. ONI is the NOAA CPC three-month index, not a local forecast.
      </p>
      <a href={NOAA_SOURCE} target="_blank" rel="noreferrer">NOAA CPC · NASA GIBS</a>
    </aside>
  );
}
