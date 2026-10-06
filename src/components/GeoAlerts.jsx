import { useEffect, useMemo, useRef, useState } from 'react';
import { distanceMeters, bearingBetween, compassLabel } from '../lib/geo.js';

const TIERS = [
  { max: 500, key: 'danger', title: 'Evacuate now', tip: 'Move away from smoke and flames by the safest route. Call 911 once you are safe.' },
  { max: 2000, key: 'warning', title: 'Fire nearby — get ready', tip: 'Pack essentials, know your exit route, and keep children, seniors and anyone with asthma indoors and away from smoke.' },
  { max: 5000, key: 'advisory', title: 'Advisory for your area', tip: 'Smoke can travel. Close windows, wear an N95 or damp cloth if you go out, and watch for updates.' },
];
const km = (m) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

export default function GeoAlerts({ incidents, userLocation, onSelect }) {
  const [perm, setPerm] = useState(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  const [locError, setLocError] = useState('');
  const lastKey = useRef('');

  const nearest = useMemo(() => {
    if (!userLocation) return null;
    return incidents
      .filter((i) => i.alarm.level > 0)
      .map((incident) => ({ incident, d: distanceMeters(userLocation, incident.location) }))
      .sort((a, b) => a.d - b.d)[0] ?? null;
  }, [incidents, userLocation]);
  const tier = nearest ? TIERS.find((t) => nearest.d <= t.max) : null;

  useEffect(() => {
    const key = tier ? `${nearest.incident.id}:${tier.key}` : '';
    if (key && key !== lastKey.current && perm === 'granted') {
      try {
        new Notification(`SentraLERT · ${tier.title}`, {
          body: `${nearest.incident.barangayName} · ${km(nearest.d)} away. ${tier.tip}`,
          tag: 'sentralert-geo',
        });
      } catch { /* some mobile browsers require a service worker */ }
    }
    lastKey.current = key;
  }, [tier, nearest, perm]);

  const askLocation = () => navigator.geolocation?.getCurrentPosition(
    () => setLocError(''),
    () => setLocError('Location is blocked. Allow it in your browser settings to get alerts for your area.'),
    { enableHighAccuracy: true, timeout: 15000 }
  );

  if (!userLocation) {
    return (
      <section className="sa-geo is-off">
        <h3>Get alerts for where you are</h3>
        <p>Share your location to be warned when a fire is reported near you. It stays on your device.</p>
        <button type="button" className="primary block" onClick={askLocation}>Enable location alerts</button>
        {locError && <p className="sa-geo-err">{locError}</p>}
      </section>
    );
  }
  return (
    <section className={`sa-geo ${tier ? `is-${tier.key}` : 'is-safe'}`} role={tier ? 'alert' : 'status'}>
      <p className="sa-geo-kicker">Your location</p>
      <h3>{tier ? tier.title : 'No reported fires near you'}</h3>
      {tier ? (
        <>
          <p>
            <b>{nearest.incident.barangayName}</b> · {km(nearest.d)} to the {compassLabel(bearingBetween(userLocation, nearest.incident.location))} · {nearest.incident.alarm.label}
          </p>
          <p>{tier.tip}</p>
          <button type="button" className="sa-geo-btn" onClick={() => onSelect(nearest.incident.id)}>View on map</button>
        </>
      ) : (
        <p>Nothing within 5 km. You will be alerted automatically if that changes.</p>
      )}
      {perm === 'default' && (
        <button type="button" className="sa-geo-btn" onClick={() => Notification.requestPermission().then(setPerm)}>
          Turn on phone notifications
        </button>
      )}
    </section>
  );
}