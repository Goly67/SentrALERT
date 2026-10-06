import { useState } from 'react';
import { download, fetchFeatureLayer, toCSV, toEsriJSON, toGeoJSON } from '../lib/arcgis.js';

export default function ArcGISPanel({ layer, onLayer, incidents, mapRef }) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadLayer = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const map = mapRef?.current;
      const mapBounds = map?.getBounds();
      const bounds = mapBounds ? {
        west: mapBounds.getWest(),
        south: mapBounds.getSouth(),
        east: mapBounds.getEast(),
        north: mapBounds.getNorth(),
      } : undefined;
      const data = await fetchFeatureLayer(url, { bounds, zoom: map?.getZoom() });
      onLayer({ data, key: `${url.trim()}-${Date.now()}` });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load this layer.');
    } finally {
      setLoading(false);
    }
  };

  const exportGeoJSON = () => download(
    'sentralert-incidents.geojson',
    JSON.stringify(toGeoJSON(incidents), null, 2)
  );
  const exportEsriJSON = () => download(
    'sentralert-incidents-esri.json',
    JSON.stringify(toEsriJSON(incidents), null, 2)
  );
  const exportCSV = () => download('sentralert-incidents.csv', toCSV(incidents), 'text/csv');

  return (
    <div className="panel arcgis-panel">
      <header>
        <h2 className="sa-title">ArcGIS tools</h2>
        <p className="muted small">
            Load public ArcGIS layers for the map’s current view, or export current incidents.
        </p>
      </header>

      <form className="sa-card arcgis-load-card" onSubmit={loadLayer}>
        <div className="field">
          <label htmlFor="arcgis-layer-url">Public layer URL</label>
          <input
            id="arcgis-layer-url"
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://.../FeatureServer/0"
            autoComplete="url"
            required
          />
          <span className="hint">FeatureServer/0, MapServer/0, or a GeoJSON URL. ArcGIS services load only the visible map area to avoid server timeouts.</span>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        {layer && !error && (
          <p className="arcgis-load-status" role="status">
            {layer.data.features.length.toLocaleString()} features are displayed on the map.
          </p>
        )}
        <button className="primary block" type="submit" disabled={loading || !url.trim()}>
          {loading ? 'Loading layer…' : 'Load layer on map'}
        </button>
        {layer && (
          <button className="secondary block" type="button" onClick={() => onLayer(null)}>
            Remove loaded layer
          </button>
        )}
      </form>

      <section className="sa-card arcgis-export-card">
        <h3>Export fire reports</h3>
        <p className="muted small">{incidents.length} current incidents · coordinates use WGS 84 (EPSG:4326).</p>
        <button className="secondary block" type="button" onClick={exportGeoJSON} disabled={!incidents.length}>
          Download GeoJSON
        </button>
        <button className="secondary block" type="button" onClick={exportEsriJSON} disabled={!incidents.length}>
          Download Esri JSON
        </button>
        <button className="secondary block" type="button" onClick={exportCSV} disabled={!incidents.length}>
          Download CSV
        </button>
      </section>
    </div>
  );
}
