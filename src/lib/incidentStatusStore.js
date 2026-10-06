const STORAGE_KEY = 'fire-watch-surigao:incident-status-map';
const VALID_INCIDENT_STATUSES = new Set(['active', 'under_control', 'fire_out']);

export function readIncidentStatusMap(storage = globalThis.localStorage) {
  if (!storage) return {};

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(([, status]) => VALID_INCIDENT_STATUSES.has(status))
    );
  } catch (error) {
    console.warn('Unable to read incident status map from storage:', error);
    return {};
  }
}

export function writeIncidentStatusMap(storage = globalThis.localStorage, map = {}) {
  if (!storage) return;

  try {
    const next = Object.fromEntries(
      Object.entries(map).filter(([, status]) => VALID_INCIDENT_STATUSES.has(status))
    );

    storage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    console.warn('Unable to save incident status map to storage:', error);
  }
}
