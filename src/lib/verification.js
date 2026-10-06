import { distanceMeters } from './geo.js';

/** A second report this close, this soon, is treated as the same incident. */
export const CLUSTER_RADIUS_M = 200;
// Nearby reports continue to count toward the same fire for 24 hours, so
// repeated confirmations do not reset the reporter total after ten minutes.
export const CLUSTER_WINDOW_MIN = 24 * 60;

export const REPORT_SOURCES = {
  aerial: { label: 'Aerial / drone sweep', weight: 1.0 },
  crowd: { label: 'Resident photo report', weight: 0.8 },
  station: { label: 'Fire station observation', weight: 1.0 },
};

/** Reports that plausibly describe the same fire as `report`. */
export function corroboratingReports(report, allReports) {
  return allReports.filter((other) => {
    if (other.id === report.id) return false;
    const gapMin = Math.abs(new Date(other.reportedAt) - new Date(report.reportedAt)) / 60000;
    if (gapMin > CLUSTER_WINDOW_MIN) return false;
    return distanceMeters(report.location, other.location) <= CLUSTER_RADIUS_M;
  });
}

/**
 * Fully automatic triage. No approval queue, no one has to be at a screen.
 *
 * confirmed    high model confidence plus at least one independent report
 * unverified   high confidence but standing alone — still published, labelled
 * monitoring   low confidence — logged silently, re-evaluated when more arrives
 */
export function triage(report, allReports, airQualityActive = false, thermalActive = false) {
  const support = corroboratingReports(report, allReports);
  const corroboration = support.length + 1;
  const weight = REPORT_SOURCES[report.source]?.weight ?? 0.8;
  const score = report.modelConfidence * weight;

  if (score >= 0.7 && corroboration >= 2) {
    return { status: 'confirmed', autoPost: true, corroboration, score,
      statusLabel: 'Fire confirmed', postPrefix: 'FIRE REPORTED' };
  }
  if (score >= 0.7) {
    return { status: 'unverified', autoPost: true, corroboration, score,
      statusLabel: 'Unverified report', postPrefix: 'UNVERIFIED FIRE REPORT' };
  }
  if ((airQualityActive || thermalActive) && score >= 0.5 && score < 0.7) {
    return { status: 'unverified', autoPost: true, corroboration, score,
      statusLabel: thermalActive
        ? 'Unverified report — satellite hotspot nearby'
        : 'Unverified report — elevated PM2.5 nearby',
      postPrefix: 'UNVERIFIED FIRE REPORT' };
  }
  return { status: 'monitoring', autoPost: false, corroboration, score,
    statusLabel: 'Held for corroboration', postPrefix: null };
}

/**
 * Text the Cloud Function would hand to the Facebook Graph API.
 * Kept here so the wording can be reviewed without deploying anything.
 */
export function composePost(incident, alarm) {
  const [lat, lng] = incident.location;
  const maps = `https://www.google.com/maps?q=${lat.toFixed(5)},${lng.toFixed(5)}`;
  const time = new Date(incident.reportedAt).toLocaleTimeString('en-PH', {
    hour: '2-digit', minute: '2-digit',
  });
  const evidence = incident.reports.find((r) => r.driveUrl)?.driveUrl;

  return [
    `${incident.triage.postPrefix} — ${incident.barangayName}, Surigao City`,
    `${alarm.label} · reported ${time}`,
    `Wind is pushing the fire ${incident.headDirection}. Households in that direction should move now, not wait.`,
    `Location: ${maps}`,
    evidence ? `Photo/video from a reporter: ${evidence}` : null,
    `Reported through SentraLERT. Call the Bureau of Fire Protection for response.`,
  ]
    .filter(Boolean)
    .join('\n\n');
}