import { ref, onValue, set, remove, get } from 'firebase/database';
import { db, firebaseEnabled } from './firebase.js';
import { seedReports } from '../data/surigao.js';
import { canAcceptReport, getReportSpamMessage } from './reportGuard.js';
import { readIncidentStatusMap, writeIncidentStatusMap } from './incidentStatusStore.js';

function withReviewDefaults(report) {
  return {
    ...report,
    status: report.status ?? 'approved',
    reviewedBy: report.reviewedBy ?? null,
    reviewedAt: report.reviewedAt ?? null,
  };
}

/**
 * Single seam between the app and storage. Everything above this file works
 * with a plain array of reports and doesn't know or care whether that array
 * came from Realtime Database or from memory.
 *
 * Data shape at `reports/{id}` is the same object the report form builds:
 * { id, location: [lat, lng], barangayId, source, modelConfidence, note,
 *   driveUrl, reportedAt }
 */

let memoryReports = [...seedReports].map(withReviewDefaults);
const memoryListeners = new Set();

function notifyMemoryListeners() {
  for (const listener of memoryListeners) listener([...memoryReports]);
}

/**
 * Subscribe to the live report list. Returns an unsubscribe function.
 * Fires immediately with the current list, then again on every change.
 */
export function subscribeToReports(callback) {
  if (firebaseEnabled) {
    const reportsRef = ref(db, 'reports');
    return onValue(reportsRef, (snapshot) => {
      const value = snapshot.val() ?? {};
      callback(Object.values(value));
    });
  }

  memoryListeners.add(callback);
  callback([...memoryReports]);
  return () => memoryListeners.delete(callback);
}

let memoryIncidentStatuses = readIncidentStatusMap();
const incidentStatusListeners = new Set();

/** Subscribe to lifecycle states shared by every connected Fire Watch client. */
export function subscribeToIncidentStatuses(callback, onError) {
  if (firebaseEnabled) {
    return onValue(
      ref(db, 'incidentStatuses'),
      (snapshot) => callback(snapshot.val() ?? {}),
      (error) => onError?.(error)
    );
  }

  incidentStatusListeners.add(callback);
  callback({ ...memoryIncidentStatuses });
  return () => incidentStatusListeners.delete(callback);
}

/** Persist an admin's UC/FO decision for all connected clients. */
export async function setIncidentStatus(incidentId, status) {
  if (!incidentId || !['active', 'under_control', 'fire_out'].includes(status)) {
    throw new Error('Invalid incident status update.');
  }

  if (firebaseEnabled) {
    await set(ref(db, `incidentStatuses/${incidentId}`), status);
    return;
  }

  memoryIncidentStatuses = { ...memoryIncidentStatuses, [incidentId]: status };
  writeIncidentStatusMap(undefined, memoryIncidentStatuses);
  for (const listener of incidentStatusListeners) listener({ ...memoryIncidentStatuses });
}

/** Write a new report. Resolves once it is committed (or added in-memory). */
export async function addReport(report) {
  const next = withReviewDefaults({
    ...report,
    status: report.status ?? 'pending',
    reviewedBy: report.reviewedBy ?? null,
    reviewedAt: report.reviewedAt ?? null,
  });

  const reason = getReportSpamMessage(next, memoryReports);
  if (reason) {
    throw new Error(reason);
  }

  if (firebaseEnabled) {
    await set(ref(db, `reports/${next.id}`), next);
    return;
  }

  memoryReports = [...memoryReports, next];
  notifyMemoryListeners();
}

export async function updateReport(reportId, updates) {
  const base = memoryReports.find((item) => item.id === reportId) ?? {
    id: reportId,
    reportedAt: new Date().toISOString(),
    status: 'pending',
  };
  const nextReport = { ...base, ...updates };

  if (firebaseEnabled) {
    await set(ref(db, `reports/${reportId}`), {
      ...nextReport,
      status: updates.status ?? nextReport.status ?? 'approved',
    });
    return;
  }

  memoryReports = memoryReports.map((item) => (item.id === reportId ? withReviewDefaults({ ...item, ...updates }) : item));
  notifyMemoryListeners();
}

export async function setReportStatus(reportId, status, reviewedBy = 'admin') {
  const timestamp = new Date().toISOString();
  const updates = {
    status,
    reviewedBy,
    reviewedAt: timestamp,
  };

  if (firebaseEnabled) {
    const refValue = ref(db, `reports/${reportId}`);
    const current = await get(refValue);
    const currentValue = current.val() ?? {};
    await set(refValue, { ...currentValue, ...updates });
    return;
  }

  memoryReports = memoryReports.map((item) => (
    item.id === reportId ? withReviewDefaults({ ...item, ...updates }) : item
  ));
  notifyMemoryListeners();
}

export async function deleteReport(reportId) {
  if (firebaseEnabled) {
    await remove(ref(db, `reports/${reportId}`));
    return;
  }

  memoryReports = memoryReports.filter((item) => item.id !== reportId);
  notifyMemoryListeners();
}

export const usingFirebase = firebaseEnabled;

/**
 * PM2.5 signals are citywide corroboration only. They stay separate from
 * reports because a single reading cannot identify which fire caused it.
 */
export function subscribeToAirQualitySignals(callback) {
  if (firebaseEnabled) {
    return onValue(ref(db, 'airQualitySignals'), (snapshot) => {
      callback(Object.values(snapshot.val() ?? {}));
    });
  }
  callback([]);
  return () => {};
}

/**
 * Approval gate for Facebook publishing.
 *
 * triage.autoPost only means an incident is *eligible* to post — it says
 * nothing about whether it should actually go out to the public right now.
 * The posting script (Cloud Function or GitHub Action) must only publish
 * incidents that have a record here; it must never post off triage.autoPost
 * alone.
 *
 * Two ways a record gets created here, both written to the same place so
 * the posting script doesn't need to care which happened:
 *  - 'auto-corroborated': 2+ independent reports already agree (the
 *    'confirmed' triage tier) — that corroboration IS the safety check, so
 *    this fires without waiting on anyone. See App.jsx's auto-approval effect.
 *  - 'admin': a single report cleared the confidence bar alone (the
 *    'unverified' tier) — one photo shouldn't be able to alarm a
 *    neighborhood by itself, so this only happens when a person clicks
 *    Approve in IncidentPanel.
 */
let memoryApprovals = {};
const approvalListeners = new Set();

function notifyApprovalListeners() {
  for (const listener of approvalListeners) listener({ ...memoryApprovals });
}

/** Subscribe to the map of { [incidentId]: { approvedAt, by } }. */
export function subscribeToPostApprovals(callback) {
  if (firebaseEnabled) {
    return onValue(ref(db, 'postApprovals'), (snapshot) => {
      callback(snapshot.val() ?? {});
    });
  }
  approvalListeners.add(callback);
  callback({ ...memoryApprovals });
  return () => approvalListeners.delete(callback);
}

/**
 * Record an approval for public posting.
 * @param {string} by - 'admin' for a person clicking Approve, or
 *   'auto-corroborated' for the automatic pass on 2+-source incidents.
 */
export async function approveForPost(incidentId, by = 'admin') {
  const record = { approvedAt: new Date().toISOString(), by };
  if (firebaseEnabled) {
    await set(ref(db, `postApprovals/${incidentId}`), record);
    return;
  }
  memoryApprovals = { ...memoryApprovals, [incidentId]: record };
  notifyApprovalListeners();
}

/** Undo an approval (e.g. someone clicked it by mistake). */
export async function revokePostApproval(incidentId) {
  if (firebaseEnabled) {
    await remove(ref(db, `postApprovals/${incidentId}`));
    return;
  }
  const next = { ...memoryApprovals };
  delete next[incidentId];
  memoryApprovals = next;
  notifyApprovalListeners();
}
