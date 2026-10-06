import { distanceMeters } from './geo.js';

export const REPORT_SPAM_LIMIT = 4;
export const REPORT_SPAM_WINDOW_MS = 8 * 60 * 60 * 1000;
export const REPORT_SPAM_RADIUS_M = 200;

function uniqueRecentLocations(reports, now = Date.now()) {
  const unique = [];

  for (const report of reports) {
    const reportedAt = new Date(report.reportedAt).getTime();
    if (!Number.isFinite(reportedAt)) continue;
    if (now - reportedAt > REPORT_SPAM_WINDOW_MS) continue;
    if (!Array.isArray(report.location) || report.location.length < 2) continue;

    const nearExisting = unique.some((location) => distanceMeters(location, report.location) <= REPORT_SPAM_RADIUS_M);
    if (!nearExisting) unique.push(report.location);
  }

  return unique;
}

export function canAcceptReport(report, existingReports = [], now = Date.now()) {
  if (!report || !Array.isArray(report.location) || report.location.length < 2) {
    return true;
  }

  const recentLocations = uniqueRecentLocations(existingReports, now);
  const alreadyNearExisting = recentLocations.some((location) => distanceMeters(location, report.location) <= REPORT_SPAM_RADIUS_M);
  if (alreadyNearExisting) return true;

  return recentLocations.length < REPORT_SPAM_LIMIT;
}

export function getReportSpamMessage(report, existingReports = [], now = Date.now()) {
  if (!report || !Array.isArray(report.location) || report.location.length < 2) {
    return null;
  }

  const recentLocations = uniqueRecentLocations(existingReports, now);
  const alreadyNearExisting = recentLocations.some((location) => distanceMeters(location, report.location) <= REPORT_SPAM_RADIUS_M);
  if (alreadyNearExisting) return null;

  if (recentLocations.length >= REPORT_SPAM_LIMIT) {
    return `New fire reports are paused for 8 hours after 4 distinct locations in the same window. Please review the existing reports before submitting another one.`;
  }

  return null;
}
