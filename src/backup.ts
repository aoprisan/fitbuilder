/**
 * Full-device backup — everything this app stores lives in localStorage under
 * "gymlog.*", so one JSON bundle of those raw entries is a complete copy of the
 * user's data: routines, logged sessions, 1RMs, body weight, branding and
 * preferences. Restoring writes the bundled entries back verbatim (each store's
 * own load-time validation still applies), overwriting matching keys and
 * leaving any other keys on the device untouched.
 */

const PREFIX = "gymlog.";

export const BACKUP_SCHEMA_ID = "gymlog.backup" as const;
export const BACKUP_SCHEMA_VERSION = 1 as const;

export interface BackupBundle {
  schema: typeof BACKUP_SCHEMA_ID;
  version: typeof BACKUP_SCHEMA_VERSION;
  /** ISO timestamp of when the backup was exported. */
  exportedAt: string;
  /** Raw localStorage entries, keyed by their full "gymlog.*" key. */
  entries: Record<string, string>;
}

/** Snapshot every stored "gymlog.*" entry into a backup bundle. */
export function buildBackup(): BackupBundle {
  const entries: Record<string, string> = {};
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith(PREFIX)) continue;
    const value = localStorage.getItem(key);
    if (value !== null) entries[key] = value;
  }
  return {
    schema: BACKUP_SCHEMA_ID,
    version: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    entries,
  };
}

/** Dated download name, e.g. "gymlog-backup-2026-06-11.json". */
export function backupFilename(now: Date = new Date()): string {
  return `gymlog-backup-${now.toISOString().slice(0, 10)}.json`;
}

/**
 * Restore a backup file's contents into localStorage. Only string entries under
 * the "gymlog." prefix are written — anything else in the file is ignored, so a
 * tampered bundle can't plant foreign keys. Returns the number of entries
 * written; throws when the text isn't a backup bundle at all.
 */
export function restoreBackup(text: string): number {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("not JSON");
  }
  if (
    typeof raw !== "object" ||
    raw === null ||
    (raw as Record<string, unknown>)["schema"] !== BACKUP_SCHEMA_ID
  ) {
    throw new Error("missing backup marker");
  }
  const entries = (raw as Record<string, unknown>)["entries"];
  if (typeof entries !== "object" || entries === null) throw new Error("no entries");

  let written = 0;
  for (const [key, value] of Object.entries(entries)) {
    if (!key.startsWith(PREFIX) || typeof value !== "string") continue;
    localStorage.setItem(key, value);
    written += 1;
  }
  if (written === 0) throw new Error("empty backup");
  return written;
}
