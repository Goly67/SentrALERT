import { useMemo } from 'react';
import { ALARM_LEVELS } from '../lib/alarmLevels.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

function dateValue(value) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function Analytics({ incidents = [], reports = [], incidentStatusMap = {} }) {
  const stats = useMemo(() => {
    const now = Date.now();
    const reportTimes = reports.map((report) => dateValue(report.reportedAt));
    const reportsLastDay = reportTimes.filter((time) => time != null && now - time <= DAY_MS && time <= now).length;
    const visibleIncidents = incidents.filter((incident) => incidentStatusMap[incident.id] !== 'fire_out');
    const statusCounts = {
      active: incidents.filter((incident) => (incidentStatusMap[incident.id] ?? 'active') === 'active').length,
      underControl: incidents.filter((incident) => incidentStatusMap[incident.id] === 'under_control').length,
      fireOut: incidents.filter((incident) => incidentStatusMap[incident.id] === 'fire_out').length,
    };
    const alarms = ALARM_LEVELS.map((alarm) => ({
      ...alarm,
      count: visibleIncidents.filter((incident) => incident.alarm.level === alarm.level).length,
    }));
    const barangays = Object.values(visibleIncidents.reduce((groups, incident) => {
      const name = incident.barangayName || 'Unknown location';
      groups[name] ??= { name, fires: 0, reports: 0 };
      groups[name].fires += 1;
      groups[name].reports += incident.reports?.length ?? 0;
      return groups;
    }, {})).sort((a, b) => b.fires - a.fires || b.reports - a.reports).slice(0, 5);

    const currentHour = Math.floor(now / HOUR_MS) * HOUR_MS;
    const activity = Array.from({ length: 12 }, (_, index) => {
      const start = currentHour - (11 - index) * HOUR_MS;
      const end = start + HOUR_MS;
      const count = reportTimes.filter((time) => time != null && time >= start && time < end).length;
      return {
        hour: new Date(start).toLocaleTimeString([], { hour: 'numeric' }),
        count,
      };
    });

    return {
      submitted: reports.length,
      reportsLastDay,
      incidents: visibleIncidents.length,
      statusCounts,
      alarms,
      barangays,
      activity,
      maxActivity: Math.max(1, ...activity.map((item) => item.count)),
      maxAlarm: Math.max(1, ...alarms.map((alarm) => alarm.count)),
      maxBarangay: Math.max(1, ...barangays.map((barangay) => barangay.fires)),
    };
  }, [incidents, reports, incidentStatusMap]);

  return (
    <div className="panel analytics-panel">
      <header>
        <h2 className="sa-title">Analytics</h2>
        <p className="muted small">Live summary of submitted reports and current fire incidents.</p>
      </header>

      <section className="sa-kpis" aria-label="Incident summary">
        <div><b>{stats.incidents}</b><span>Current fires</span></div>
        <div><b>{stats.reportsLastDay}</b><span>Reports · last 24 hours</span></div>
        <div><b>{stats.submitted}</b><span>All submitted reports</span></div>
      </section>

      <section className="sa-card analytics-card">
        <h3>Incident status</h3>
        <div className="analytics-status">
          <span><i className="is-active" />Active <b>{stats.statusCounts.active}</b></span>
          <span><i className="is-controlled" />Under control <b>{stats.statusCounts.underControl}</b></span>
          <span><i className="is-out" />Fire out <b>{stats.statusCounts.fireOut}</b></span>
        </div>
      </section>

      <section className="sa-card analytics-card">
        <h3>Fires by alarm level</h3>
        {stats.alarms.map((alarm) => (
          <div className="sa-bar" key={alarm.key}>
            <span>{alarm.label}</span>
            <div className="analytics-bar-track">
              <i style={{ width: `${(alarm.count / stats.maxAlarm) * 100}%`, '--c': alarm.color }} />
            </div>
            <b>{alarm.count}</b>
          </div>
        ))}
      </section>

      <section className="sa-card analytics-card">
        <h3>Reports by hour · last 12 hours</h3>
        <div className="analytics-hours" role="img" aria-label={stats.activity.map((item) => `${item.hour}: ${item.count} reports`).join(', ')}>
          {stats.activity.map((item, index) => (
            <div className="analytics-hour" key={`${item.hour}-${index}`} title={`${item.hour}: ${item.count} reports`}>
              <i style={{ height: `${item.count ? Math.max(5, (item.count / stats.maxActivity) * 100) : 0}%` }} />
            </div>
          ))}
        </div>
        <div className="sa-hours-axis"><span>{stats.activity[0]?.hour}</span><span>Now</span></div>
      </section>

      <section className="sa-card analytics-card">
        <h3>Most affected barangays</h3>
        {stats.barangays.length ? stats.barangays.map((barangay) => (
          <div className="sa-bar" key={barangay.name}>
            <span title={barangay.name}>{barangay.name}</span>
            <div className="analytics-bar-track">
              <i style={{ width: `${(barangay.fires / stats.maxBarangay) * 100}%` }} />
            </div>
            <b>{barangay.fires}</b>
          </div>
        )) : <p className="muted small analytics-empty">No current fire incidents to summarize.</p>}
      </section>
      <p className="muted small analytics-footnote">Charts update as reports and incident statuses change.</p>
    </div>
  );
}

export default Analytics;
