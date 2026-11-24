import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ensoTimelines, ensoStrength, compareWithNow } from '../lib/ensoData.js';
import '../enso-timeline.css';

const TABS = [
  { key: 'weeks', label: 'Weeks', note: 'Weekly Niño 3.4 reading, last 6 months' },
  { key: 'months', label: 'Months', note: '3-month average (ONI), last 2 years' },
  { key: 'years', label: 'Years', note: 'Same season each year, last 30 years' },
];
// NOAA's El Niño / La Niña line, drawn on the chart.
const THRESHOLD = 0.5;

const signed = (value) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(1)} °C`;

/** Bar colour: deeper red / blue the stronger the El Niño / La Niña. */
function barColor(value) {
  const size = Math.abs(value);
  if (size < THRESHOLD) return '#A3AFBF';
  if (value > 0) return size >= 2 ? '#9B1410' : size >= 1.5 ? '#D92D20' : size >= 1 ? '#E8590C' : '#F79009';
  return size >= 2 ? '#1E3A8A' : size >= 1.5 ? '#1D4ED8' : size >= 1 ? '#2F6CFF' : '#60A5FA';
}

/** Readable text colour for a reading on the dark panel. */
function textColor(value) {
  const size = Math.abs(value);
  if (size < THRESHOLD) return '#DCE7F3';
  if (value > 0) return size >= 1.5 ? '#FF8F80' : '#FFB36B';
  return size >= 1.5 ? '#8DB8FF' : '#A8CBFF';
}

/**
 * El Niño timeline for the ENSO map: weeks, months or years of NOAA readings,
 * with the latest one as "now". Tapping a past bar compares it with now and
 * (through onSelect) shows that day's sea-temperature map when NASA has one.
 */
export default function EnsoTimeline({ context, selectedId = null, onSelect }) {
  const [tab, setTab] = useState('months');
  const [open, setOpen] = useState(true);
  const timelines = useMemo(() => ensoTimelines(context), [context]);
  const points = timelines[tab] ?? [];
  const now = points.at(-1) ?? null;
  const selected = points.find((item) => item.id === selectedId) ?? null;
  const tabInfo = TABS.find((item) => item.key === tab);

  const values = points.map((item) => item.value);
  // Room above and below zero for the largest reading, and always the ±0.5 lines.
  const top = Math.max(THRESHOLD + 0.3, ...values);
  const bottom = Math.max(THRESHOLD + 0.3, ...values.map((v) => -v));
  const span = top + bottom;
  const zeroPct = (top / span) * 100;
  const linePct = (value) => ((top - value) / span) * 100;

  const pick = (item) => onSelect?.(item && item.id !== now?.id ? item : null);
  const switchTab = (key) => {
    setTab(key);
    onSelect?.(null);
  };

  const body = !open ? (
    <button type="button" className="enso-tl-pill" onClick={() => setOpen(true)} aria-expanded="false">
      <TimelineGlyph />
      El Niño timeline
      {now && <b style={{ color: barColor(now.value) }}>{signed(now.value)}</b>}
    </button>
  ) : (
    <section className="enso-tl" aria-label="El Niño timeline">
      <header className="enso-tl-head">
        <div>
          <span className="enso-tl-kicker">EL NIÑO TIMELINE</span>
          {now ? (
            <strong>
              Now: <span style={{ color: textColor(now.value) }}>{signed(now.value)}</span> · {ensoStrength(now.value).label}
            </strong>
          ) : (
            <strong>{context?.phase === 'Loading' ? 'Loading NOAA readings…' : 'NOAA readings unavailable'}</strong>
          )}
        </div>
        <button type="button" className="enso-tl-close" onClick={() => setOpen(false)} aria-label="Hide El Niño timeline">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 12.5 10 7.5l5 5" /></svg>
        </button>
      </header>

      <div className="enso-tl-tabs" role="tablist" aria-label="Timeline span">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            className={tab === item.key ? 'is-active' : ''}
            onClick={() => switchTab(item.key)}
            disabled={!timelines[item.key]?.length}
          >
            {item.label}
          </button>
        ))}
      </div>

      {points.length > 0 && (
        <>
          <div className="enso-tl-chart" role="group" aria-label={`${tabInfo.label} of El Niño readings`}>
            <span className="enso-tl-line is-zero" style={{ top: `${zeroPct}%` }} />
            <span className="enso-tl-line is-warm" style={{ top: `${linePct(THRESHOLD)}%` }} />
            <span className="enso-tl-line is-cool" style={{ top: `${linePct(-THRESHOLD)}%` }} />
            {points.map((item, index) => {
              const isNow = index === points.length - 1;
              const isPicked = selected?.id === item.id;
              const height = (Math.abs(item.value) / span) * 100;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`enso-tl-bar ${isNow ? 'is-now' : ''} ${isPicked ? 'is-picked' : ''}`}
                  onClick={() => pick(isPicked ? null : item)}
                  aria-pressed={isPicked}
                  title={`${item.longLabel}: ${signed(item.value)} · ${ensoStrength(item.value).label}`}
                  aria-label={`${item.longLabel}: ${signed(item.value)}, ${ensoStrength(item.value).label}${isNow ? ' (now)' : ''}`}
                >
                  <i
                    style={{
                      background: barColor(item.value),
                      height: `${Math.max(height, 1.2)}%`,
                      top: item.value >= 0 ? `${zeroPct - height}%` : `${zeroPct}%`,
                    }}
                  />
                </button>
              );
            })}
          </div>
          <div className="enso-tl-axis">
            <span>{points[0].label}</span>
            <span>{points[Math.floor(points.length / 2)].label}</span>
            <span className="is-now">Now</span>
          </div>
          <p className="enso-tl-note">{tabInfo.note}. Dashed lines: ±0.5 °C, NOAA's El Niño / La Niña line. Tap a bar to compare.</p>
        </>
      )}

      {selected && now && (
        <div className="enso-tl-compare">
          <div>
            <span>Then · {selected.longLabel}</span>
            <b style={{ color: textColor(selected.value) }}>{signed(selected.value)}</b>
            <small>{ensoStrength(selected.value).label}</small>
          </div>
          <div>
            <span>Now · {now.longLabel}</span>
            <b style={{ color: textColor(now.value) }}>{signed(now.value)}</b>
            <small>{ensoStrength(now.value).label}</small>
          </div>
          <p>
            {compareWithNow(selected, now)}{' '}
            {selected.mapDate
              ? 'The map shows the sea temperatures on that date.'
              : 'No satellite map before July 2019, so the map still shows now.'}
          </p>
          <button type="button" className="enso-tl-now" onClick={() => onSelect?.(null)}>Back to now</button>
        </div>
      )}
    </section>
  );

  return createPortal(<div className="enso-tl-wrap">{body}</div>, document.body);
}

function TimelineGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M4 19V5M4 19h16" />
      <path d="M8 15v-3M12 15V8M16 15v-5" />
    </svg>
  );
}
