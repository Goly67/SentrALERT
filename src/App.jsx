import { createPortal } from 'react-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MapView from './components/MapLibreView.jsx';
import Sidebar from './components/Sidebar.jsx';
import ReportForm from './components/ReportForm.jsx';
import IncidentPanel from './components/IncidentPanel.jsx';
import WarningSystem from './components/WarningSystem.jsx';
import Timeline from './components/Timeline.jsx';
import HistoricalFireView from './components/HistoricalFireView.jsx';
import NotificationCenter from './components/NotificationCenter.jsx';
import AdminPanel from './components/AdminPanel.jsx';
import GeoAlerts from './components/GeoAlerts.jsx';
import SafetyHub from './components/SafetyHub.jsx';
import Analytics from './components/Analytics.jsx';
import About from './components/About.jsx';
import ArcGISPanel from './components/ArcGISPanel.jsx';
import EarthquakeInfo from './components/EarthquakeInfo.jsx';
import { RailNav } from './components/Brand.jsx';
import {
  HazePanel, HazeTimeline, MapLayersMenu, useHaze,
} from './components/HazeUI.jsx';
import { buildIncidents } from './lib/incidents.js';
import { fetchWind, FALLBACK_WIND } from './lib/wind.js';
import { fetchLocalWeather, fetchCityTemperatures } from './lib/localWeather.js';
import { fetchEarthquakeEvents } from './lib/earthquakes.js';
import { fetchThermalHotspots } from './lib/thermal.js';
import { destination, distanceMeters } from './lib/geo.js';
import { isPointInCaraga } from './lib/haze.js';
import { cities } from './data/bfpStations.js';
import { playAdminReportSound } from './lib/alarmAudio.js';
import { getReportSpamMessage } from './lib/reportGuard.js';
import { readIncidentStatusMap, writeIncidentStatusMap } from './lib/incidentStatusStore.js';
import {
  subscribeToReports, addReport, usingFirebase,
  subscribeToAirQualitySignals, subscribeToPostApprovals, subscribeToIncidentStatuses,
  setIncidentStatus, approveForPost, revokePostApproval,
} from './lib/reportsStore.js';

// Wind and the Indonesia haze forecast both refresh on this cadence.
const REFRESH_MS = 2 * 60 * 1000;
const WEATHER_REFRESH_MS = 60 * 1000;

export default function App() {
  const [reports, setReports] = useState([]);
  const [facebookLeads, setFacebookLeads] = useState([]);
  const [airQualitySignals, setAirQualitySignals] = useState([]);
  const [thermalHotspots, setThermalHotspots] = useState([]);
  const [postApprovals, setPostApprovals] = useState({});
  const [wind, setWind] = useState(FALLBACK_WIND);
  const [localWeather, setLocalWeather] = useState(null);
  const [cityTemps, setCityTemps] = useState([]);
  const [earthquakeMode, setEarthquakeMode] = useState(false);
  const [earthquakeEvents, setEarthquakeEvents] = useState([]);
  const [latestEarthquake, setLatestEarthquake] = useState(null);
  const [selectedEarthquakeId, setSelectedEarthquakeId] = useState(null);
  const [earthquakeReportOpen, setEarthquakeReportOpen] = useState(false);
  const [earthquakeLoaded, setEarthquakeLoaded] = useState(false);
  const [earthquakeError, setEarthquakeError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [view, setView] = useState('list');
  const [pendingLocation, setPendingLocation] = useState(null);
  const [horizonMinutes, setHorizonMinutes] = useState(30);
  const [showStations, setShowStations] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const [hazeOn, setHazeOn] = useState(false); // haze is a map layer, not a separate mode
  const [hazeFrame, setHazeFrame] = useState(0); // 0..24, 3 h apart
  const [hazeFocus, setHazeFocus] = useState(null);
  const [nationalFireMode, setNationalFireMode] = useState(false);
  const [nationalFireHotspots, setNationalFireHotspots] = useState([]);
  const [nationalFireLoading, setNationalFireLoading] = useState(false);
  const [nationalFireFetchedAt, setNationalFireFetchedAt] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [locationAccuracy, setLocationAccuracy] = useState(null);
  const [evacuationIncidentId, setEvacuationIncidentId] = useState(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminAuthorized, setAdminAuthorized] = useState(false);
  const [adminAudioReady, setAdminAudioReady] = useState(false);
  const [incidentStatusError, setIncidentStatusError] = useState('');
  const [incidentStatusMap, setIncidentStatusMap] = useState(() => readIncidentStatusMap());
  const [historicalOverlay, setHistoricalOverlay] = useState(null);
  const [arcgisLayer, setArcgisLayer] = useState(null);
  const [mapIs3d, setMapIs3d] = useState(true);

  const appRef = useRef(null);
  const mapRef = useRef(null);
  const recentAdminReportIdsRef = useRef(new Set());
  const reportsRef = useRef(reports);
  reportsRef.current = reports;
  const userLocationRef = useRef(userLocation);
  userLocationRef.current = userLocation;
  const handleMapReady = useCallback((map) => {
    mapRef.current = map;
  }, []);
  const resetMapDirection = useCallback(() => {
    mapRef.current?.easeTo({ pitch: mapIs3d ? 52 : 0, bearing: 0, duration: 500 });
  }, [mapIs3d]);
  // Rounded to ~1 km so ordinary GPS jitter doesn't retrigger the weather
  // fetch below on every watchPosition tick — only a real move does, and
  // going null the instant location is turned off.
  const userLocationKey = userLocation
    ? `${userLocation[0].toFixed(2)}:${userLocation[1].toFixed(2)}`
    : null;

  const haze = useHaze(hazeOn);

  useEffect(() => {
    if (!railOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setRailOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [railOpen]);

  // Firebase Realtime Database when configured, in-memory sample data
  // otherwise — reportsStore.js hides which one this is.
  useEffect(() => subscribeToReports(setReports), []);
  useEffect(() => subscribeToIncidentStatuses(
    setIncidentStatusMap,
    (error) => setIncidentStatusError(
      error?.code === 'PERMISSION_DENIED'
        ? 'The app cannot read shared fire statuses. Check the incidentStatuses .read rule.'
        : 'The app cannot connect to shared fire statuses.'
    )
  ), []);
  useEffect(() => subscribeToAirQualitySignals(setAirQualitySignals), []);
  useEffect(() => {
    let cancelled = false;
    const refresh = () => fetchThermalHotspots().then((hotspots) => {
      if (!cancelled) setThermalHotspots(hotspots);
    });
    refresh();
    const id = setInterval(refresh, 15 * 60 * 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  useEffect(() => {
    if (!nationalFireMode) return undefined;
    let cancelled = false;
    const refresh = () => {
      setNationalFireLoading(true);
      fetchThermalHotspots({ national: true })
        .then((hotspots) => {
          if (cancelled) return;
          setNationalFireHotspots(hotspots);
          setNationalFireFetchedAt(Date.now());
        })
        .finally(() => { if (!cancelled) setNationalFireLoading(false); });
    };
    refresh();
    const id = setInterval(refresh, 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [nationalFireMode]);
  useEffect(() => subscribeToPostApprovals(setPostApprovals), []);

  useEffect(() => {
    if (!earthquakeMode) return undefined;
    let cancelled = false;
    const refresh = () => fetchEarthquakeEvents()
      .then((events) => {
        if (cancelled) return;
        setEarthquakeEvents(events);
        setLatestEarthquake(events[0] ?? null);
        setEarthquakeLoaded(true);
        setEarthquakeError('');
      })
      .catch((error) => {
        if (cancelled) return;
        setEarthquakeError(error instanceof Error ? error.message : 'Earthquake feed unavailable.');
      });
    refresh();
    const id = setInterval(refresh, 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [earthquakeMode]);

  useEffect(() => {
    let cancelled = false;
    fetchWind(undefined, true).then((w) => !cancelled && setWind(w));
    const id = setInterval(() => {
      fetchWind(undefined, true).then((w) => !cancelled && setWind(w));
    }, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

    // Public weather station readings load independently of device location.
  useEffect(() => {
    let cancelled = false;
    const refresh = () => fetchCityTemperatures(cities).then((rows) => !cancelled && setCityTemps(rows));
    refresh();
      const id = setInterval(refresh, WEATHER_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // The person's own temperature reading only exists while their
  // device is actually sharing a location — it disappears the moment
  // userLocation does, and it's never sent anywhere shared.
  useEffect(() => {
    if (!userLocationKey) {
      setLocalWeather(null);
      return undefined;
    }
    let cancelled = false;
    const refresh = () =>
      fetchLocalWeather(userLocationRef.current).then((w) => !cancelled && setLocalWeather(w));
    refresh();
    const id = setInterval(refresh, WEATHER_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLocationKey]);

  useEffect(() => {
    if (!adminAuthorized) return;
    if (!adminAudioReady) return;

    const nextIds = new Set(reports.map((report) => report.id));
    const newReportIds = [...nextIds].filter((id) => !recentAdminReportIdsRef.current.has(id));
    recentAdminReportIdsRef.current = nextIds;

    if (newReportIds.length > 0) {
      void playAdminReportSound();
    }
  }, [reports, adminAuthorized, adminAudioReady]);

  // If this device has already granted location access, keep the private
  // marker current without requiring another button press.
  useEffect(() => {
    if (!navigator.geolocation) return undefined;
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setUserLocation([position.coords.latitude, position.coords.longitude]);
        setLocationAccuracy(position.coords.accuracy);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Elapsed time feeds escalation, so recompute on a timer.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const allIncidents = useMemo(
    () => buildIncidents(reports, wind, airQualitySignals, thermalHotspots),
    [reports, wind, airQualitySignals, thermalHotspots, tick]
  );
  const incidents = useMemo(() => allIncidents.filter((incident) => {
    const status = incidentStatusMap[incident.id] ?? 'active';
    return status !== 'fire_out';
  }), [allIncidents, incidentStatusMap]);
  const incidentStateMap = useMemo(() => Object.fromEntries(
    allIncidents.map((incident) => [incident.id, incidentStatusMap[incident.id] ?? 'active'])
  ), [allIncidents, incidentStatusMap]);
  const activeIncidents = useMemo(() => incidents.filter((incident) => (
    (incidentStatusMap[incident.id] ?? 'active') === 'active'
  )), [incidents, incidentStatusMap]);
  const airQualityActive = airQualitySignals.some((signal) => {
    const detectedAt = new Date(signal.detectedAt).getTime();
    return Number.isFinite(detectedAt) && Date.now() - detectedAt <= 30 * 60 * 1000;
  });
  const selected = incidents.find((i) => i.id === selectedId) ?? null;
  const selectedEarthquake = earthquakeEvents.find((event) => event.id === selectedEarthquakeId)
    ?? latestEarthquake;
  const nearbyIncident = userLocation
    ? incidents
      .map((incident) => ({ incident, distance: distanceMeters(userLocation, incident.location) }))
      .filter(({ incident, distance }) => distance <= 500 && incident.alarm.level > 0)
      .sort((a, b) => a.distance - b.distance)[0]?.incident ?? null
    : null;
  const nearbyIncidentId = nearbyIncident?.id ?? null;

  useEffect(() => {
    setEvacuationIncidentId((current) => {
      if (!nearbyIncidentId) return null;
      return current === nearbyIncidentId ? current : nearbyIncidentId;
    });
  }, [nearbyIncidentId]);

  // 'confirmed' means 2+ independent reports already agree — that
  // corroboration is itself the safety check, so these post without
  // waiting on an admin. Only single-source 'unverified' incidents need a
  // person to click Approve (see IncidentPanel). Runs whenever the
  // incident list changes; skips anything already recorded either way.
  useEffect(() => {
    for (const incident of incidents) {
      if (
        incident.triage.status === 'confirmed' &&
        incident.triage.autoPost &&
        !(incident.id in postApprovals)
      ) {
        approveForPost(incident.id, 'auto-corroborated');
      }
    }
  }, [incidents, postApprovals]);

  const changeHorizon = useCallback((next) => {
    setHorizonMinutes((prev) => (typeof next === 'function' ? next(prev) : next));
  }, []);

  const updateIncidentStatus = useCallback((incidentId, nextStatus) => {
    setIncidentStatusError('');
    void setIncidentStatus(incidentId, nextStatus)
      .then(() => {
        setIncidentStatusMap((current) => {
          const next = { ...current, [incidentId]: nextStatus };
          writeIncidentStatusMap(undefined, next);
          return next;
        });
      })
      .catch((error) => {
        setIncidentStatusError(
          error?.code === 'PERMISSION_DENIED'
            ? 'UC/FO was not shared. Publish the incidentStatuses Firebase rule and sign in as the assigned admin.'
            : 'UC/FO could not be shared. Check the Firebase connection and try again.'
        );
      });
  }, []);

  const handleAdminAuthorizationChange = useCallback((authorized) => {
    setAdminAuthorized(authorized);
    if (authorized) {
      recentAdminReportIdsRef.current = new Set(reportsRef.current.map((report) => report.id));
      setAdminAudioReady(true);
    } else {
      setAdminAudioReady(false);
      recentAdminReportIdsRef.current = new Set();
    }
  }, []);

  useEffect(() => {
    writeIncidentStatusMap(undefined, incidentStatusMap);
  }, [incidentStatusMap]);

  // Passed down into MapView -> the memoized LocalLayer (see MapView.jsx).
  // An inline arrow here would get a new reference every render — including
  // every haze-timeline tick — which would defeat that memoization and
  // force every fire pin to re-render for no reason.
  const selectIncident = useCallback((id) => {
    setView('list');
    setSelectedId(id);
    setHorizonMinutes(30);
    setRailOpen(true);
  }, []);
  const selectEarthquake = useCallback((id) => {
    setSelectedEarthquakeId(id);
    setEarthquakeReportOpen(true);
  }, []);

  function submitReport(report) {
    const message = getReportSpamMessage(report, reports);
    if (message) {
      window.alert(message);
      return;
    }

    addReport(report);
    setView('list');
    setPendingLocation(null);
    setSelectedId(report.id);
    setHorizonMinutes(30);
  }

  function reportExistingFire(location) {
    setPendingLocation([...location]);
    setView('report');
    setSelectedId(null);
  }

  function toggleHaze(on) {
    setHazeOn(on);
    if (on) {
      setNationalFireMode(false);
      setShowStations(false);
    } else {
      setShowStations(true);
    }
    if (on) {
      setView('list');
      setSelectedId(null);
      setPendingLocation(null);
      setRailOpen(true);
    }
  }

  function toggleNationalFireMode(on) {
    setNationalFireMode(on);
    setShowStations(!on);
    if (on) {
      setHazeOn(false);
      setView('list');
      setSelectedId(null);
      setPendingLocation(null);
      setRailOpen(true);
    }
  }

  const reporting = !hazeOn && view === 'report';
  const showHazeTimeline = hazeOn && Boolean(haze.data?.frames);
  const selectedIsActive = selected
    && (incidentStatusMap[selected.id] ?? 'active') === 'active';
  const showSpreadTimeline = !hazeOn && Boolean(selectedIsActive) && selected.alarm.level > 0 && !reporting;
  const timelineVisible = showHazeTimeline || showSpreadTimeline;
  const userInCaraga = userLocation ? isPointInCaraga(userLocation) : false;

  // Publish the playback bar's real height as --timeline-clearance so the
  // mobile hide/show handle (styles.css) always sits above it, never on it.
  useEffect(() => {
    const app = appRef.current;
    if (!app) return undefined;
    const timeline = timelineVisible ? app.querySelector('.timeline') : null;
    const apply = () => {
      if (!timeline) {
        app.style.setProperty('--timeline-clearance', '0px');
        return;
      }
      const gap = parseFloat(getComputedStyle(timeline).bottom) || 0;
      app.style.setProperty('--timeline-clearance', `${Math.ceil(timeline.offsetHeight + gap)}px`);
    };
    apply();
    if (!timeline || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(apply);
    observer.observe(timeline);
    return () => observer.disconnect();
  }, [timelineVisible, hazeOn]);

  let rail;
  if (hazeOn) {
    rail = (
      <HazePanel
        haze={haze}
        frame={hazeFrame}
        onFocus={(c) => setHazeFocus([...c])}
        userLocation={userLocation}
        userInCaraga={userInCaraga}
      />
    );
  } else if (reporting) {
    rail = (
      <ReportForm
        location={pendingLocation}
        incidents={incidents}
        onPlaceRequest={setPendingLocation}
        onSubmit={submitReport}
        onCancel={() => {
          setView('list');
          setPendingLocation(null);
        }}
      />
    );
  } else if (earthquakeMode) {
    rail = (
      <EarthquakeInfo
        events={earthquakeEvents}
        selectedEvent={selectedEarthquake}
        loaded={earthquakeLoaded}
        error={earthquakeError}
        incidents={activeIncidents}
        onSelect={selectEarthquake}
      />
    );
  } else if (view === 'safety') {
    rail = <SafetyHub />;
  } else if (view === 'analytics') {
    rail = <Analytics incidents={allIncidents} reports={reports} incidentStatusMap={incidentStatusMap} />;
  } else if (view === 'about') {
    rail = <About />;
  } else if (view === 'arcgis') {
    rail = <ArcGISPanel layer={arcgisLayer} onLayer={setArcgisLayer} incidents={allIncidents} mapRef={mapRef} />;
  } else if (view === 'levels') {
    rail = (
      <WarningSystem
        activeLevel={selected ? selected.alarm.level : null}
        onClose={() => setView('list')}
      />
    );
  } else if (view === 'historical') {
    rail = (
      <HistoricalFireView
        onClose={() => {
          setView('list');
          setHistoricalOverlay(null);
        }}
        onOverlayChange={setHistoricalOverlay}
      />
    );
  } else if (selected) {
    rail = (
      <IncidentPanel
        incident={selected}
        incidentState={incidentStatusMap[selected.id] ?? 'active'}
        horizonMinutes={horizonMinutes}
        onBack={() => setSelectedId(null)}
        onOpenLevels={() => setView('levels')}
        postApproval={postApprovals[selected.id] ?? null}
        onApprovePost={() => approveForPost(selected.id)}
        onRevokePost={() => revokePostApproval(selected.id)}
        onReportFire={reportExistingFire}
      />
    );
  } else {
    rail = (
      <Sidebar
        topSlot={<GeoAlerts incidents={activeIncidents} userLocation={userLocation} onSelect={selectIncident} />}
        incidents={activeIncidents}
        wind={wind}
        userLocation={userLocation}
        localWeather={localWeather}
        selectedId={selectedId}
        showStations={showStations}
        onToggleStations={() => setShowStations((s) => !s)}
        onSelect={setSelectedId}
        airQualityActive={airQualityActive}
        onReport={() => {
          setView('report');
          setSelectedId(null);
        }}
        onOpenLevels={() => setView('levels')}
        onOpenHistory={() => setView('historical')}
        earthquakeMode={earthquakeMode}
        onToggleEarthquake={() => {
          const nextEnabled = !earthquakeMode;
          if (nextEnabled) {
            setHazeOn(false);
            setNationalFireMode(false);
            setSelectedId(null);
            setPendingLocation(null);
          }
          setEarthquakeMode(nextEnabled);
        }}
      />
    );
  }

  if (earthquakeReportOpen) {
    return (
      <main className="earthquake-report-screen">
        <EarthquakeInfo
          fullscreen
          events={earthquakeEvents}
          selectedEvent={selectedEarthquake}
          loaded={earthquakeLoaded}
          error={earthquakeError}
          incidents={activeIncidents}
          onSelect={selectEarthquake}
          onBack={() => setEarthquakeReportOpen(false)}
        />
      </main>
    );
  }

  return (
    <div ref={appRef} className={`app ${railOpen ? 'has-category-open' : 'rail-collapsed'} ${timelineVisible ? 'has-playback' : ''} ${hazeOn ? 'is-haze-active' : ''}`}>
      <main className="stage">
        {!earthquakeMode && (
          <MapLayersMenu
            hazeOn={hazeOn}
            onHazeChange={toggleHaze}
            nationalFireOn={nationalFireMode}
            onNationalFireChange={toggleNationalFireMode}
            is3d={mapIs3d}
            onToggle3d={() => setMapIs3d((value) => !value)}
            onResetDirection={resetMapDirection}
            loading={nationalFireLoading}
            hotspots={nationalFireHotspots}
            fetchedAt={nationalFireFetchedAt}
          />
        )}

        {!earthquakeMode && (
          <NotificationCenter
            incidents={activeIncidents}
            reports={reports}
            onSelect={(id) => {
              setHazeOn(false);
              setView('list');
              setSelectedId(id);
              setHorizonMinutes(30);
              setRailOpen(true);
            }}
            onOpenAdmin={() => {
              setAdminOpen(true);
            }}
          />
        )}

        {adminOpen && (
          <AdminPanel
            reports={reports}
            incidents={allIncidents}
            incidentStatusMap={incidentStatusMap}
            incidentStatusError={incidentStatusError}
            onUpdateIncidentStatus={updateIncidentStatus}
            onAdminAuthorizationChange={handleAdminAuthorizationChange}
            onClose={() => setAdminOpen(false)}
          />
        )}

        {!usingFirebase && !hazeOn && !earthquakeMode && (
          <div className="db-flag" title="Copy .env.example to .env.local with your Firebase project to go live">
            Sample data — connect Firebase to go live
          </div>
        )}

        <MapView
          incidents={incidents}
          incidentStateMap={incidentStateMap}
          selectedId={selectedId}
          onSelect={selectIncident}
          placing={reporting}
          pendingLocation={pendingLocation}
          onPickLocation={setPendingLocation}
          horizonMinutes={horizonMinutes}
          showStations={showStations}
          railOpen={railOpen}
          hazeMode={hazeOn}
          haze={haze.data}
          hazeFrame={hazeFrame}
          hazeFocus={hazeFocus}
          userLocation={userLocation}
          userLocationAccuracy={locationAccuracy}
          localWeather={localWeather}
          cityTemps={cityTemps}
          historicalOverlay={view === 'historical' ? historicalOverlay : null}
          nationalFireMode={nationalFireMode}
          nationalFireHotspots={nationalFireHotspots}
          arcgisLayer={arcgisLayer}
          earthquake={latestEarthquake}
          selectedEarthquake={selectedEarthquake}
          earthquakeEvents={earthquakeEvents}
          earthquakeLoaded={earthquakeLoaded}
          earthquakeError={earthquakeError}
          earthquakeMode={earthquakeMode}
          onSelectEarthquake={selectEarthquake}
          is3d={mapIs3d}
          onMapReady={handleMapReady}
        />

        {reporting && <div className="map-hint">Tap the map where the fire is</div>}

        {showHazeTimeline && (
          <HazeTimeline frame={hazeFrame} onChange={setHazeFrame} baseTime={haze.data.baseTime} />
        )}

        {showSpreadTimeline && (
          <Timeline
            minutes={horizonMinutes}
            onChange={changeHorizon}
            alarmColor={selected.alarm.color}
          />
        )}
      </main>

      {railOpen && (
        <div className="category-modal-backdrop" role="presentation" onClick={() => setRailOpen(false)}>
          <section
            className="category-modal"
            role="dialog"
            aria-modal="false"
            aria-labelledby="category-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="category-modal-heading">
              <div>
                <span className="category-modal-kicker">SENTRALERT · CATEGORY</span>
                <h2 id="category-modal-title">
                  {view === 'safety' ? 'Safety'
                    : view === 'analytics' ? 'Analytics'
                      : view === 'arcgis' ? 'ArcGIS'
                        : view === 'about' ? 'About'
                          : 'Alerts'}
                </h2>
              </div>
              <button type="button" className="icon-button" onClick={() => setRailOpen(false)} aria-label="Close category">
                <span className="icon-close" aria-hidden="true" />
              </button>
            </header>
            <div className="category-modal-content" key={hazeOn ? 'haze' : reporting ? 'report' : view + (selectedId ?? '')}>
              {rail}
            </div>
          </section>
        </div>
      )}

      <RailNav
        active={railOpen
          ? (['safety', 'analytics', 'arcgis', 'about'].includes(view) && !hazeOn ? view : 'alerts')
          : null}
        onChange={(tab) => {
          setHazeOn(false);
          setEarthquakeMode(false);
          setPendingLocation(null);
          setRailOpen(true);
          if (tab === 'alerts') { setView('list'); setSelectedId(null); } else { setView(tab); }
        }}
      />

      {nearbyIncident && evacuationIncidentId && createPortal(
        <div className="evacuation-backdrop" role="presentation">
          <section className="evacuation-modal" role="alertdialog" aria-modal="true" aria-labelledby="evacuation-title">
            <div className="evacuation-icon" aria-hidden="true">!</div>
            <p className="evacuation-kicker">You are within 500 m of a reported fire</p>
            <h2 id="evacuation-title">EVACUATE NOW</h2>
            <p>Move away from the fire and smoke immediately. Follow official evacuation instructions.</p>
            <ul>
              <li>Leave by the safest route away from smoke and flames.</li>
              <li>Do not return for belongings or approach electrical lines.</li>
              <li>Call emergency services when you are in a safe location.</li>
            </ul>
            <button className="primary block" onClick={() => setEvacuationIncidentId(null)}>I understand</button>
          </section>
        </div>,
        document.body
      )}

    </div>
  );
}