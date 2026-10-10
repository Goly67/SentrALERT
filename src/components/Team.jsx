const TEAM_MEMBERS = [
  { name: 'Sam Yujoco', role: 'Chief Executive Officer', shortRole: 'CEO', photo: null },
  { name: 'James Plaza', role: 'Chief Technology Officer', shortRole: 'CTO', photo: null },
  { name: 'Mercy Alberca', role: 'Chief Marketing Officer', shortRole: 'CMO', photo: null },
];

function TeamMemberCard({ member, index, leader = false }) {
  const initials = member.name.split(' ').map((part) => part[0]).join('');
  return (
    <article className={`team-member${leader ? ' is-leader' : ''}`}>
      <div className="team-member-art">
        <span className="team-member-number">0{index + 1}</span>
        <span className="team-member-orbit" aria-hidden="true" />
        <div className="team-member-photo">
          {member.photo ? (
            <img src={member.photo} alt={member.name} loading="lazy" />
          ) : (
            <span className="team-member-initials" aria-hidden="true">{initials}</span>
          )}
        </div>
        <span className="team-member-short-role">{member.shortRole}</span>
      </div>
      <div className="team-member-info">
        <strong>{member.name}</strong>
        <span className="team-member-role">{member.role}</span>
        <span className="team-member-divider" aria-hidden="true" />
        <span className="team-member-caption">{leader ? 'EXECUTIVE LEADERSHIP' : 'LEADERSHIP TEAM'}</span>
      </div>
    </article>
  );
}

export default function Team() {
  return (
    <section className="panel team-panel" aria-labelledby="team-title">
      <header className="team-intro">
        <span className="team-kicker"><i /> THE PEOPLE BEHIND THE MISSION</span>
        <h2 id="team-title" className="sa-title">Meet the team<span>.</span></h2>
        <p className="muted small">A team building a safer, more prepared tomorrow.</p>
      </header>

      <div
        className="team-org-chart"
        role="group"
        aria-label="Organization chart: Sam Yujoco, Chief Executive Officer, leads James Plaza, Chief Technology Officer, and Mercy Alberca, Chief Marketing Officer."
      >
        <div className="team-leader-node">
          <TeamMemberCard member={TEAM_MEMBERS[0]} index={0} leader />
        </div>
        <ol className="team-reports">
          {TEAM_MEMBERS.slice(1).map((member, index) => (
            <li key={member.name}>
              <TeamMemberCard member={member} index={index + 1} />
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
