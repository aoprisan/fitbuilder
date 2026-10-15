/**
 * Full-device backup — everything this app stores lives in localStorage under
 * "gymlog.*", so one JSON bundle of those raw entries is a complete copy of the
 * user's data: logged sessions, 1RMs, body weight and preferences. Restoring
 * writes the bundled entries back (each store's own load-time validation still
 * applies), merging the session log and overwriting other matching keys, and
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

const SESSIONS_KEY = "gymlog.sessions";
/** Device-local, moment-in-time state — restoring a stale copy would resume a long-gone set. */
const SKIP_ON_RESTORE = new Set(["gymlog.liveProgress"]);

/** Thrown when the device ran out of storage mid-restore (everything was rolled back). */
export class RestoreQuotaError extends Error {}

function sessionId(entry: unknown): string | null {
  if (typeof entry !== "object" || entry === null) return null;
  const id = (entry as Record<string, unknown>)["id"];
  return typeof id === "string" && id !== "" ? id : null;
}

function stamp(entry: unknown): string {
  const rec = entry as Record<string, unknown>;
  const at = rec["updatedAt"] ?? rec["startedAt"];
  return typeof at === "string" ? at : "";
}

/**
 * Union the device's session log with the backup's, by session id: sessions
 * logged on this device since the backup survive, and where both copies exist
 * the more recently updated one wins. Falls back to the backup's text when
 * either side isn't a JSON array.
 */
function mergeSessions(current: string | null, incoming: string): string {
  let mine: unknown;
  let theirs: unknown;
  try {
    mine = current === null ? [] : JSON.parse(current);
    theirs = JSON.parse(incoming);
  } catch {
    return incoming;
  }
  if (!Array.isArray(mine) || !Array.isArray(theirs)) return incoming;
  const byId = new Map<string, unknown>();
  const unkeyed: unknown[] = [];
  for (const entry of [...mine, ...theirs]) {
    const id = sessionId(entry);
    if (id === null) {
      unkeyed.push(entry);
      continue;
    }
    const prev = byId.get(id);
    if (prev === undefined || stamp(entry) >= stamp(prev)) byId.set(id, entry);
  }
  return JSON.stringify([...byId.values(), ...unkeyed]);
}

/**
 * Restore a backup file's contents into localStorage. Only string entries under
 * the "gymlog." prefix are written — anything else in the file is ignored, so a
 * tampered bundle can't plant foreign keys. The session log is merged rather
 * than replaced, and the write is all-or-nothing: if storage fills up part way,
 * every touched key is put back as it was and {@link RestoreQuotaError} is
 * thrown. Returns the number of entries written; throws a plain Error when the
 * text isn't a backup bundle at all.
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

  const writes: [string, string][] = [];
  for (const [key, value] of Object.entries(entries)) {
    if (!key.startsWith(PREFIX) || SKIP_ON_RESTORE.has(key) || typeof value !== "string") continue;
    writes.push([
      key,
      key === SESSIONS_KEY ? mergeSessions(localStorage.getItem(key), value) : value,
    ]);
  }
  if (writes.length === 0) throw new Error("empty backup");

  const previous = new Map(writes.map(([key]) => [key, localStorage.getItem(key)]));
  try {
    for (const [key, value] of writes) localStorage.setItem(key, value);
  } catch {
    for (const [key, value] of previous) {
      try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      } catch {
        // Rolling back only ever shrinks or restores a value; nothing more to do.
      }
    }
    throw new RestoreQuotaError("storage full");
  }
  return writes.length;
}
