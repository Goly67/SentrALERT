import { useEffect, useRef, useState } from 'react';
import { CircleMarker, MapContainer, TileLayer, useMap } from 'react-leaflet';
import { toBlob } from 'html-to-image';
import { BrandHeader } from './Brand.jsx';
import { fetchEarthquakeBulletin, parseIntensityReport } from '../lib/earthquakes.js';
import 'leaflet/dist/leaflet.css';

const EVENTS_PER_PAGE = 20;

function formatEventTime(time) {
  return new Date(time).toLocaleString('en-PH', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Manila',
  });
}

function formatCoordinates(value, direction) {
  return `${Math.abs(value).toFixed(3)}° ${direction}`;
}

function magnitudeColorClass(magnitude) {
  if (magnitude >= 7) return 'is-magnitude-extreme';
  if (magnitude >= 5) return 'is-magnitude-high';
  if (magnitude >= 3) return 'is-magnitude-moderate';
  return 'is-magnitude-low';
}

function EventValue({ label, children, wide = false }) {
  return (
    <div className={`earthquake-info-value ${wide ? 'is-wide' : ''}`}>
      <span>{label}</span>
      {wide ? <div className="earthquake-info-rich">{children}</div> : <strong>{children}</strong>}
    </div>
  );
}

// PHIVOLCS Earthquake Intensity Scale colours, light to severe.
const INTENSITY_COLORS = {
  I: '#E4E7EC', II: '#C7DDF7', III: '#9CC6F0', IV: '#9BE3B3', V: '#F8E58A', VI: '#F9C27A',
  VII: '#F58A4C', VIII: '#E5483B', IX: '#B42318', X: '#7A1F17',
};
const DARK_INTENSITY = new Set(['VII', 'VIII', 'IX', 'X', 'XI', 'XII']);

/** Reported intensities as a tidy list: level badge, then towns by province. */
function IntensityReport({ text }) {
  const report = parseIntensityReport(text);
  // Small quakes sometimes carry a stray value here (e.g. "11.20a") and no
  // intensities at all; say so plainly instead of printing it.
  if (!report) return <strong>{/intensit/i.test(text) ? text : 'None reported'}</strong>;
  return (
    <div className="eq-intensity">
      {report.sections.map((section, sectionIndex) => (
        <div className="eq-intensity-section" key={`${section.type ?? 'all'}-${sectionIndex}`}>
          {section.type && <p className="eq-intensity-type">{section.type} intensities</p>}
          <ul className="eq-intensity-levels">
            {section.levels.map((level) => (
              <li key={level.level} className="eq-intensity-level">
                <span
                  className={`eq-intensity-badge ${DARK_INTENSITY.has(level.level) ? 'is-dark' : ''}`}
                  style={{ '--peis': INTENSITY_COLORS[level.level] ?? '#E4E7EC' }}
                  title={`Intensity ${level.level}`}
                >
                  <small>INT</small>{level.level}
                </span>
                <ul className="eq-intensity-provinces">
                  {level.provinces.map((group) => (
                    <li key={group.province || group.places.join()}>
                      <strong>{group.places.join(', ')}</strong>
                      {group.province && <span>{group.province}</span>}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {report.notes.map((note) => <p key={note} className="eq-intensity-note">{note}</p>)}
    </div>
  );
}

/**
 * Leaflet measures its box once. The map frame stretches to the height of the
 * details beside it (and changes size while the image is saved), so re-measure
 * whenever the frame resizes, or a grey strip is left where the map should be.
 */
function KeepMapSized() {
  const map = useMap();
  useEffect(() => {
    const frame = map.getContainer().parentElement;
    if (!frame || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(frame);
    map.invalidateSize();
    return () => observer.disconnect();
  }, [map]);
  return null;
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

/** Waits (up to ~4 s) for the epicenter map to resize and finish loading tiles. */
async function settleMap(panel) {
  await nextFrame();
  await nextFrame();
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    const tiles = [...panel.querySelectorAll('.earthquake-map-frame .leaflet-tile')];
    if (tiles.length && tiles.every((tile) => tile.complete && tile.classList.contains('leaflet-tile-loaded'))) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await new Promise((resolve) => setTimeout(resolve, 150));
}

function EpicenterMap({ event }) {
  return (
    <section className="earthquake-map-section" aria-label="Earthquake epicenter map">
      <div className="earthquake-map-heading">
        <div>
          <span className="earthquake-section-kicker">LOCATION</span>
          <h3>Epicenter map</h3>
        </div>
        <span className="earthquake-map-region">Philippines</span>
      </div>
      <div className="earthquake-map-frame">
        <MapContainer
          key={event.id}
          center={[event.latitude, event.longitude]}
          zoom={6}
          scrollWheelZoom={false}
          dragging={false}
          doubleClickZoom={false}
          zoomControl={false}
          attributionControl={false}
          keyboard={false}
          aria-label={`Map showing the earthquake epicenter near ${event.place}`}
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <KeepMapSized />
          <CircleMarker
            center={[event.latitude, event.longitude]}
            radius={10}
            pathOptions={{
              color: '#ffffff',
              weight: 3,
              fillColor: '#ef4d45',
              fillOpacity: 1,
            }}
          />
        </MapContainer>
        <span className="earthquake-map-marker-label">EPICENTER</span>
      </div>
      <div className="earthquake-map-caption">
        <span className="earthquake-map-key" aria-hidden="true" />
        <span>Reported epicenter</span>
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
        >
          © OpenStreetMap
        </a>
      </div>
    </section>
  );
}

export default function EarthquakeInfo({
  events,
  selectedEvent,
  loaded,
  error,
  incidents = [],
  onSelect,
  fullscreen = false,
  onBack,
}) {
  const [visibleCount, setVisibleCount] = useState(EVENTS_PER_PAGE);
  const [bulletin, setBulletin] = useState(null);
  const [bulletinLoading, setBulletinLoading] = useState(false);
  const [imageSaving, setImageSaving] = useState(false);
  const [imageSaveError, setImageSaveError] = useState('');
  const [imageSaveStatus, setImageSaveStatus] = useState('');
  const panelRef = useRef(null);
  const highestAlarm = incidents.reduce(
    (max, incident) => (incident.alarm.level > max.level ? incident.alarm : max),
    { level: -1 }
  );
  const visibleEvents = events.slice(0, visibleCount);
  if (selectedEvent && !visibleEvents.some((event) => event.id === selectedEvent.id)) {
    visibleEvents.push(selectedEvent);
  }

  useEffect(() => {
    if (!selectedEvent?.url) {
      setBulletin(null);
      setBulletinLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    setBulletin(null);
    setBulletinLoading(true);
    fetchEarthquakeBulletin(selectedEvent.url, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setBulletin(data);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setBulletin(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setBulletinLoading(false);
      });
    return () => controller.abort();
  }, [selectedEvent?.id, selectedEvent?.url]);

  async function saveReportAsImage() {
    if (!panelRef.current || !selectedEvent) return;
    setImageSaving(true);
    setImageSaveError('');
    setImageSaveStatus('');
    const panel = panelRef.current;
    panel.classList.add('is-exporting-landscape');
    // The image uses a wider layout than the screen (much wider on a phone):
    // let the map resize and load its new tiles before taking the picture,
    // or a grey strip is left where they were missing.
    await settleMap(panel);

    try {
      const imageBlob = await toBlob(panel, {
        backgroundColor: '#ffffff',
        cacheBust: true,
        pixelRatio: 2,
        skipFonts: true,
        filter: (node) => !(node instanceof HTMLElement && node.dataset.exportExclude === 'true'),
      });
      if (!imageBlob) throw new Error('Could not create the earthquake bulletin image.');
      const eventDate = new Date(selectedEvent.time).toISOString().slice(0, 10);
      const place = selectedEvent.place
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .slice(0, 60);
      const download = document.createElement('a');
      download.download = `sentralert-earthquake-${place}-${eventDate}.png`;
      const imageUrl = URL.createObjectURL(imageBlob);
      download.href = imageUrl;
      document.body.append(download);
      download.click();
      download.remove();
      window.setTimeout(() => URL.revokeObjectURL(imageUrl), 1000);
      setImageSaveStatus('PNG image saved to your downloads.');
    } catch (error) {
      setImageSaveError(error instanceof Error ? error.message : 'Could not save the earthquake bulletin image.');
    } finally {
      panel.classList.remove('is-exporting-landscape');
      setImageSaving(false);
    }
  }

  return (
    <div ref={panelRef} className={`panel earthquake-info-panel ${fullscreen ? 'is-fullscreen' : ''}`}>
      <BrandHeader incidents={incidents} highestAlarm={highestAlarm} />

      <header className="earthquake-info-heading">
        {fullscreen && (
          <>
            <div className="earthquake-report-actions" data-export-exclude="true">
              <button type="button" className="earthquake-report-back" onClick={onBack}>
                <span aria-hidden="true">←</span> Back to map
              </button>
              <button
                type="button"
                className="earthquake-report-save"
                onClick={saveReportAsImage}
                disabled={imageSaving || !selectedEvent || bulletinLoading}
              >
                {imageSaving ? 'Saving image…' : 'Save as image'}
              </button>
            </div>
            {imageSaveStatus && (
                <p className="earthquake-bulletin-status" role="status" data-export-exclude="true">
                  {imageSaveStatus}
                </p>
            )}
            {imageSaveError && (
              <p className="earthquake-bulletin-error" role="alert" data-export-exclude="true">
                {imageSaveError}
              </p>
            )}
          </>
        )}
        <p className="earthquake-info-kicker">SENTRALERT · SEISMIC MONITOR</p>
        <h2>Earthquake information</h2>
        <p>PHIVOLCS bulletin details for the selected earthquake event.</p>
      </header>

      {error && (
        <p className="earthquake-info-error" role="status">
          {loaded ? 'Live update failed; showing the last available events.' : 'Could not load earthquake events.'} {error}
        </p>
      )}

      {!selectedEvent ? (
        <div className="earthquake-info-empty" role="status">
          {loaded ? 'No earthquakes were reported in the past seven days.' : 'Loading recent earthquake events…'}
        </div>
      ) : (
        <article className="earthquake-report" aria-labelledby="earthquake-report-title">
          <header className={`earthquake-report-banner ${magnitudeColorClass(selectedEvent.magnitude)}`}>
            <div className="earthquake-report-eyebrow">
              <span className="earthquake-report-brand">SENTRALERT</span>
              <span className="earthquake-report-type">SEISMIC EVENT</span>
            </div>
            <div className="earthquake-report-title-row">
              <div className="earthquake-report-title-copy">
                <p>EARTHQUAKE INFORMATION</p>
                <h3 id="earthquake-report-title">{selectedEvent.place}</h3>
              </div>
              <div className="earthquake-report-magnitude" aria-label={`Magnitude ${selectedEvent.magnitude.toFixed(1)}`}>
                <strong>{selectedEvent.magnitude.toFixed(1)}</strong>
                <span>MAGNITUDE</span>
              </div>
            </div>
          </header>

          <EpicenterMap event={selectedEvent} />

          <section className="earthquake-report-details" aria-labelledby="earthquake-details-title">
            <div className="earthquake-section-title">
              <span className="earthquake-section-kicker">EVENT SUMMARY</span>
              <h3 id="earthquake-details-title">Reported details</h3>
            </div>
            <div className="earthquake-report-grid">
              <EventValue label="Date and time">
                <time dateTime={new Date(selectedEvent.time).toISOString()}>
                  {formatEventTime(selectedEvent.time)} PHT
                </time>
              </EventValue>
              <EventValue label="Coordinates">
                {formatCoordinates(selectedEvent.latitude, selectedEvent.latitude < 0 ? 'S' : 'N')},{' '}
                {formatCoordinates(selectedEvent.longitude, selectedEvent.longitude < 0 ? 'W' : 'E')}
              </EventValue>
              <EventValue label="Depth of focus">
                {selectedEvent.depthKm == null ? 'Not reported' : `${selectedEvent.depthKm.toFixed(1)} km`}
              </EventValue>
              <EventValue label="Origin">{bulletinLoading ? 'Loading…' : bulletin?.origin || 'Not listed'}</EventValue>
              <EventValue label="Reported intensities" wide={!bulletinLoading && Boolean(bulletin?.intensities)}>
                {bulletinLoading ? 'Loading…' : bulletin?.intensities ? <IntensityReport text={bulletin.intensities} /> : 'Not listed'}
              </EventValue>
              <EventValue label="Expecting damage">{bulletinLoading ? 'Loading…' : bulletin?.expectedDamage || 'Not reported'}</EventValue>
              <EventValue label="Expecting aftershocks">{bulletinLoading ? 'Loading…' : bulletin?.expectedAftershocks || 'Not reported'}</EventValue>
              <EventValue label="Issued on">{bulletinLoading ? 'Loading…' : bulletin?.issuedOn || 'Not reported'}</EventValue>
              <EventValue label="Prepared by">{bulletinLoading ? 'Loading…' : bulletin?.preparedBy || 'Not listed'}</EventValue>
            </div>
          </section>

          {bulletinLoading && <p className="earthquake-bulletin-status" role="status">Loading bulletin details…</p>}
        </article>
      )}

      {!fullscreen && <section className="earthquake-event-list" aria-labelledby="earthquake-event-list-title">
        <div className="earthquake-event-list-heading">
          <h3 id="earthquake-event-list-title">Recent events</h3>
          <span>{events.length} in the past 7 days</span>
        </div>
        {events.length > 0 ? (
          <ul>
            {visibleEvents.map((event) => (
              <li key={event.id}>
                <button
                  type="button"
                  className={`earthquake-event-item ${event.id === selectedEvent?.id ? 'is-selected' : ''}`}
                  onClick={() => onSelect(event.id)}
                  aria-pressed={event.id === selectedEvent?.id}
                >
                  <span className="earthquake-event-magnitude">M {event.magnitude.toFixed(1)}</span>
                  <span className="earthquake-event-summary">
                    <strong>{event.place}</strong>
                    <time dateTime={new Date(event.time).toISOString()}>{formatEventTime(event.time)}</time>
                  </span>
                  <span className="earthquake-event-chevron" aria-hidden="true">›</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="earthquake-event-empty">{loaded ? 'No recent events to display.' : 'Events will appear here after loading.'}</p>
        )}
        {visibleCount < events.length && (
          <button
            type="button"
            className="secondary earthquake-event-more"
            onClick={() => setVisibleCount((count) => count + EVENTS_PER_PAGE)}
          >
            Show more events ({events.length - visibleCount} remaining)
          </button>
        )}
      </section>}
    </div>
  );
}
