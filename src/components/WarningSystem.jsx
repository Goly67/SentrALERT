import { useState } from 'react';
import { WARNING_CARDS } from '../lib/alarmLevels.js';

/**
 * The five-level reference, always reachable. Cards expand one at a time so the
 * ladder stays readable on a phone; the level currently in play is highlighted
 * so the reference and the live map agree without anyone cross-checking.
 */
export default function WarningSystem({ activeLevel = null, onClose }) {
  const [open, setOpen] = useState(null);

  return (
    <div className="panel warning-system">
      <div className="panel-head">
        <h2>5-Level Warning System</h2>
        {onClose && (
          <button className="icon-button" onClick={onClose} aria-label="Close" title="Close">
            <span className="icon-close" aria-hidden="true" />
          </button>
        )}
      </div>

      <ol className="ladder">
        {WARNING_CARDS.map((card, index) => {
          const isOpen = open === card.key;
          const isActive =
            activeLevel !== null &&
            (card.key === 'a45' ? activeLevel >= 4 : activeLevel === card.level);

          return (
            <li key={card.key} style={{ '--step': index }}>
              <button
                className={`ladder-card ${isOpen ? 'is-open' : ''} ${isActive ? 'is-active' : ''}`}
                style={{ '--alarm': card.color, '--tint': card.tint }}
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : card.key)}
              >
                <span className="ladder-icon">
                  {card.level === 0 ? <SmokeGlyph /> : <TruckGlyph count={Math.min(card.level, 3)} />}
                </span>
                <span className="ladder-body">
                  <span className="ladder-title">
                    {card.cardLabel}
                    {isActive && <span className="live-dot" aria-label="in effect now" />}
                  </span>
                  <span className="ladder-summary">{card.summary}</span>
                  {isOpen && (
                    <span className="ladder-detail">
                      {card.level === 0
                        ? card.detail
                        : `Dispatches ${card.units} units. Triggered once the 30-minute projection covers ${card.minStructures === 0 ? 'any' : card.minStructures + ' or more'} structures.`}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <p className="muted small">
        The level is set by where the fire will be in thirty minutes, not by what is
        burning now — so the trucks are already moving when it gets there.
      </p>
    </div>
  );
}

function TruckGlyph({ count }) {
  return (
    <svg viewBox="0 0 34 24" className="truck-glyph" aria-hidden="true">
      <g className="truck-body">
        <rect x="2" y="7" width="17" height="9" rx="1.6" />
        <path d="M19 9h6l5 4.2V16h-11z" />
        <rect x="4.5" y="9" width="4.5" height="3.4" rx="0.6" className="truck-window" />
      </g>
      <circle className="wheel" cx="9" cy="18" r="3.2" />
      <circle className="wheel wheel-b" cx="24" cy="18" r="3.2" />
      {count > 1 && <rect className="beacon" x="8" y="4" width="5" height="2.4" rx="1.2" />}
    </svg>
  );
}

function SmokeGlyph() {
  return (
    <svg viewBox="0 0 34 24" className="smoke-glyph" aria-hidden="true">
      <circle cx="12" cy="15" r="5.5" />
      <circle cx="19" cy="11" r="4" className="puff-b" />
      <circle cx="24" cy="15.5" r="3" className="puff-c" />
    </svg>
  );
}
