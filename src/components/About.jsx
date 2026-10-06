const FEATURES = [
  {
    icon: '🔥',
    title: 'Fire reports and incident status',
    description: 'View community-submitted reports, incident locations, and updates as fires become active, controlled, or out.',
  },
  {
    icon: '🗺️',
    title: 'Interactive 3D map',
    description: 'Explore fire locations, weather readings, fire-service coverage, satellite hotspots, and haze layers.',
  },
  {
    icon: '🌬️',
    title: 'Wind prediction and fire-spread context',
    description: 'Follow forecast wind conditions and modeled spread direction to understand possible local impacts. Estimates are not official forecasts.',
  },
  {
    icon: '🌫️',
    title: 'Haze and satellite monitoring',
    description: 'Review Indonesia haze forecasts and satellite fire detections, with their limits clearly identified.',
  },
  {
    icon: '📊',
    title: 'Incident analytics',
    description: 'Track report activity, incident status, alarm levels, and the areas represented in current reports.',
  },
  {
    icon: '📍',
    title: 'Location alerts and safety guidance',
    description: 'Use optional on-device location alerts and practical guidance to support informed safety decisions.',
  },
  {
    icon: '📢',
    title: 'Safety announcements during disasters',
    description: 'Planned: share timely, location-aware safety announcements and response guidance during emergencies.',
    status: 'Planned',
  },
  {
    icon: '📲',
    title: 'Automated SMS and authority calls',
    description: 'Planned: notify residents and contact designated authorities by SMS or phone when defined incident escalation criteria are met. This requires approved contacts and communications service integration.',
    status: 'Planned',
  },
];

export default function About() {
  return (
    <div className="panel about-panel">
      <header>
        <h2 className="sa-title">About SentraLERT</h2>
        <p className="muted small">
          A multi-hazard public safety monitoring tool for Surigao communities.
        </p>
      </header>

      <section className="about-features" aria-label="SentraLERT features">
        {FEATURES.map((feature) => (
          <article className="sa-card about-feature" key={feature.title}>
            <span className="about-feature-icon" aria-hidden="true">{feature.icon}</span>
            <div>
              <div className="about-feature-heading">
                <h3>{feature.title}</h3>
                {feature.status && (
                  <span className={`about-feature-status ${feature.status === 'Planned' ? 'is-planned' : ''}`}>
                    {feature.status}
                  </span>
                )}
              </div>
              <p>{feature.description}</p>
            </div>
          </article>
        ))}
      </section>

      <section className="sa-card about-data-note" aria-labelledby="about-weather-title">
        <div className="about-data-note-top">
          <span className="about-data-note-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M4 19V5M4 19h16M7 15l4-4 3 2 5-6" />
              <circle cx="19" cy="7" r="1.5" />
            </svg>
          </span>
          <span className="about-data-note-source"><i /> OFFICIAL WEATHER SOURCE</span>
        </div>
        <div className="about-data-note-copy">
          <span className="about-data-note-kicker">TRUST THE SOURCE</span>
          <h3 id="about-weather-title">Weather data, with context.</h3>
          <p>
            Local weather readings come from PAGASA government weather stations—not
            generated or substituted by SentraLERT. We add map and safety context to
            help you understand the readings.
          </p>
        </div>
        <div className="about-data-note-satellites">
          <span className="about-data-note-satellite-icon" aria-hidden="true">✦</span>
          <div>
            <h4>More than one satellite view.</h4>
            <p>
              Fire checks can draw on NASA FIRMS VIIRS passes from Suomi-NPP, NOAA-20,
              and NOAA-21, plus MODIS archive data. Satellite hotspots are indicators,
              not confirmed fires; coverage and detection timing vary.
            </p>
          </div>
        </div>
        <div className="about-data-note-footer">
          <span className="about-data-note-mark" aria-hidden="true">i</span>
          <p>SentraLERT does not replace official alerts or emergency instructions.</p>
        </div>
      </section>
    </div>
  );
}
