// Edit ANNOUNCEMENTS and LOCAL_CONTACTS freely — they are plain data.
const ANNOUNCEMENTS = [
  { level: 'info', title: 'Know your exits', body: 'Every household should agree on two ways out and one meeting point. Practice it once a month.' },
  { level: 'health', title: 'Smoke is a health hazard', body: 'Children, seniors, pregnant women and people with asthma or heart conditions should stay indoors when smoke is visible.' },
];
const LOCAL_CONTACTS = [
  { name: 'National Emergency Hotline', number: '911' },
  { name: 'Philippine Red Cross', number: '143' },
  { name: 'BFP Surigao City Central Fire Station', number: '+63 955 554 4012' },
];
const PROCEDURES = [
  { id: 'fire', icon: '🔥', title: 'Fire', steps: {
    Before: ['Install smoke alarms and keep a fire extinguisher where you can reach it.', 'Never overload outlets; unplug appliances when away.', 'Plan two exits and a family meeting point.'],
    During: ['Shout “Fire!”, get everyone out, and stay out.', 'Crawl low under smoke; feel doors before opening them.', 'Stop, drop and roll if clothing catches fire.', 'Call 911 from a safe place.'],
    After: ['Do not re-enter until firefighters say it is safe.', 'Seek medical care for burns and smoke inhalation.', 'Report your status to family and your barangay.'] } },
  { id: 'quake', icon: '🌐', title: 'Earthquake', steps: {
    Before: ['Secure shelves and heavy furniture.', 'Prepare a go-bag: water, food, flashlight, radio, first-aid kit, medicines.'],
    During: ['Drop, Cover and Hold On under sturdy furniture.', 'Stay away from windows; if outside, move to an open area.', 'Near the coast and shaking is strong or long? Move to high ground.'],
    After: ['Check for injuries and gas or electrical hazards.', 'Expect aftershocks; follow PHIVOLCS and LGU advisories.'] } },
  { id: 'storm', icon: '🌀', title: 'Typhoon & flood', steps: {
    Before: ['Follow official weather bulletins and know your barangay evacuation center.', 'Charge phones, store drinking water, secure loose roofing.'],
    During: ['Stay indoors; evacuate early if told to.', 'Never walk or drive through floodwater.', 'Switch off the main power if water enters the house.'],
    After: ['Avoid floodwater and fallen lines.', 'Boil drinking water; watch for leptospirosis symptoms after wading in floodwater.'] } },
  { id: 'smoke', icon: '😷', title: 'Smoke & health', steps: {
    Before: ['Keep N95 masks at home, especially for vulnerable family members.'],
    During: ['Stay indoors with windows closed; limit physical activity.', 'Drink water; avoid frying or burning anything indoors.', 'Keep asthma inhalers and daily medicines within reach.'],
    After: ['Seek care for coughing, wheezing, chest pain or trouble breathing.'] } },
];

export default function SafetyHub() {
  return (
    <div className="panel">
      <div>
        <h2 className="sa-title">Safety & health</h2>
        <p className="muted small">Official-style guidance for the hazards Surigao City faces.</p>
      </div>
      <section className="sa-stack">
        {ANNOUNCEMENTS.map((a) => (
          <article key={a.title} className={`sa-notice is-${a.level}`}>
            <b>{a.title}</b>
            <p>{a.body}</p>
          </article>
        ))}
      </section>
      <section className="sa-stack">
        {PROCEDURES.map((p, i) => (
          <details key={p.id} className="sa-acc" open={i === 0}>
            <summary><span aria-hidden="true">{p.icon}</span>{p.title}</summary>
            {Object.entries(p.steps).map(([phase, items]) => (
              <div key={phase} className="sa-phase">
                <h4>{phase}</h4>
                <ul>{items.map((s) => <li key={s}>{s}</li>)}</ul>
              </div>
            ))}
          </details>
        ))}
      </section>
      <section className="sa-card">
        <h3>Emergency contacts</h3>
        <ul className="sa-contacts">
          {LOCAL_CONTACTS.map((c) => (
            <li key={c.name}>
              <span>{c.name}</span>
              {c.number ? <a href={`tel:${c.number}`}>{c.number}</a> : <em>add number</em>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}