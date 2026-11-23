import { useEffect, useRef, useState } from 'react';
import '../contact.css';

// Edit freely — plain data.
const EMAIL = 'sentralert@gmail.com';
const FACEBOOK = {
  url: 'https://www.facebook.com/sam.yujoco23',
  handle: 'facebook.com/sam.yujoco23',
  name: 'Sam Yujoco',
  role: 'Chief Executive Officer',
};

export default function Contact({ embedded = false }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(EMAIL);
    } catch {
      // Older browsers: select-and-copy fallback.
      const field = document.createElement('textarea');
      field.value = EMAIL;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      field.select();
      document.execCommand('copy');
      field.remove();
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1800);
  }

  return (
    <section className={`${embedded ? 'is-embedded' : 'panel'} contact-panel`} aria-labelledby="contact-title">
      <header className="contact-hero">
        <span className="contact-aurora contact-aurora--one" aria-hidden="true" />
        <span className="contact-aurora contact-aurora--two" aria-hidden="true" />
        <span className="contact-grid" aria-hidden="true" />

        <div className="contact-beacon" aria-hidden="true">
          <span className="contact-beacon-ring" />
          <span className="contact-beacon-ring" />
          <span className="contact-beacon-ring" />
          <span className="contact-beacon-core"><SignalIcon /></span>
        </div>

        <span className="contact-kicker"><i /> GET IN TOUCH</span>
        <h2 id="contact-title" className="contact-title">
          Let&rsquo;s keep Surigao <em>safe</em>, together.
        </h2>
        <p className="contact-lede">
          Questions, partnerships, feedback or a bug to report? Reach the SentrALERT team directly.
        </p>
      </header>

      <div className="contact-cards">
        <article className="contact-card contact-card--email" style={{ '--i': 0 }}>
          <div className="contact-card-head">
            <span className="contact-card-icon" aria-hidden="true"><MailIcon /></span>
            <div className="contact-card-label">
              <span>EMAIL</span>
              <strong>Write to the team</strong>
            </div>
          </div>
          <a className="contact-card-value" href={`mailto:${EMAIL}`}>{EMAIL}</a>
          <div className="contact-card-actions">
            <a className="contact-btn contact-btn--primary" href={`mailto:${EMAIL}?subject=${encodeURIComponent('SentrALERT')}`}>
              <SendIcon /> Send email
            </a>
            <button type="button" className={`contact-btn ${copied ? 'is-done' : ''}`} onClick={copyEmail} aria-live="polite">
              {copied ? <><CheckIcon /> Copied</> : <><CopyIcon /> Copy</>}
            </button>
          </div>
        </article>

        <article className="contact-card contact-card--social" style={{ '--i': 1 }}>
          <div className="contact-card-head">
            <span className="contact-card-icon" aria-hidden="true"><ChatIcon /></span>
            <div className="contact-card-label">
              <span>FACEBOOK</span>
              <strong>Message {FACEBOOK.name}</strong>
            </div>
          </div>
          <a className="contact-card-value" href={FACEBOOK.url} target="_blank" rel="noreferrer">{FACEBOOK.handle}</a>
          <p className="contact-card-note">{FACEBOOK.role}, SentrALERT</p>
          <div className="contact-card-actions">
            <a className="contact-btn contact-btn--primary contact-btn--wide" href={FACEBOOK.url} target="_blank" rel="noreferrer">
              Open profile <ExternalIcon />
            </a>
          </div>
        </article>
      </div>

      <a className="contact-emergency" href="tel:911" style={{ '--i': 2 }}>
        <span className="contact-emergency-icon" aria-hidden="true"><PhoneIcon /></span>
        <span className="contact-emergency-text">
          <strong>Fire or emergency right now?</strong>
          <span>Don&rsquo;t wait for a reply. Call 911.</span>
        </span>
        <span className="contact-emergency-number">911</span>
      </a>

    </section>
  );
}

/* ---------- icons (generic glyphs, no platform logos) ---------- */
const svg = {
  viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2,
  strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
};
function SignalIcon() {
  return (
    <svg {...svg} width="26" height="26">
      <path d="M12 13.5v7" /><circle cx="12" cy="11" r="2.5" />
      <path d="M7.8 15.2a6 6 0 0 1 0-8.4M16.2 6.8a6 6 0 0 1 0 8.4M4.9 18.1a10 10 0 0 1 0-14.2M19.1 3.9a10 10 0 0 1 0 14.2" />
    </svg>
  );
}
function MailIcon() { return <svg {...svg} width="22" height="22"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7 8 6 8-6" /></svg>; }
function ChatIcon() { return <svg {...svg} width="22" height="22"><path d="M4 12a8 8 0 1 1 3.3 6.5L4 19.5l1-3.4A8 8 0 0 1 4 12Z" /><path d="M8.5 13.2 11 10.8l2 1.9 2.5-2.4" /></svg>; }
function SendIcon() { return <svg {...svg} width="15" height="15"><path d="M21 3 10 14M21 3l-7 18-4-7-7-4 18-7Z" /></svg>; }
function CopyIcon() { return <svg {...svg} width="15" height="15"><rect x="9" y="9" width="11" height="11" rx="2.5" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></svg>; }
function CheckIcon() { return <svg {...svg} width="15" height="15"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>; }
function ExternalIcon() { return <svg {...svg} width="14" height="14"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>; }
function PhoneIcon() { return <svg {...svg} width="18" height="18"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" /></svg>; }
