import { coerceSession } from "./logValidate";
import type { TrainingSession } from "./types";

const KEY = "gymlog.sessions";

function readRaw(): unknown {
  let text: string | null = null;
  try {
    text = localStorage.getItem(KEY);
  } catch {
    return [];
  }
  if (text === null) return [];
  try {
    return JSON.parse(text);
  } catch {
    return [];
  }
}

/** Load all logged sessions. Corrupt entries are repaired or skipped. */
export function loadSessions(): TrainingSession[] {
  const raw = readRaw();
  if (!Array.isArray(raw)) return [];
  const sessions: TrainingSession[] = [];
  for (const entry of raw) {
    const session = coerceSession(entry);
    if (session) sessions.push(session);
  }
  return sessions;
}

/** Event fired on `window` when a write to the session log fails (quota / privacy mode). */
export const PERSIST_ERROR_EVENT = "gymlog:persist-error";

/**
 * Raw stored entries that fail validation. They're hidden from the app but
 * written back untouched on every save, so a schema bug or a partially
 * corrupted log never permanently destroys what the user recorded.
 */
function unreadableEntries(): unknown[] {
  const raw = readRaw();
  return Array.isArray(raw) ? raw.filter((entry) => coerceSession(entry) === null) : [];
}

function writeAll(sessions: TrainingSession[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...sessions, ...unreadableEntries()]));
  } catch (err) {
    // Quota or privacy-mode failure: don't crash mid-workout — the session
    // stays usable in memory, but tell the UI so the user knows it won't
    // survive a reload.
    console.warn("[gymlog] could not persist sessions", err);
    window.dispatchEvent(new Event(PERSIST_ERROR_EVENT));
  }
}

/** Insert or update a session by id, stamping updatedAt. Returns the stored copy. */
export function saveSession(session: TrainingSession): TrainingSession & { updatedAt: string } {
  const stored = { ...session, updatedAt: new Date().toISOString() };
  const sessions = loadSessions();
  const idx = sessions.findIndex((s) => s.id === stored.id);
  if (idx >= 0) sessions[idx] = stored;
  else sessions.push(stored);
  writeAll(sessions);
  return stored;
}

/** Remove a session by id. */
export function deleteSession(id: string): void {
  writeAll(loadSessions().filter((s) => s.id !== id));
}

/**
 * Drop sessions that have no logged sets — the residue of a session that was
 * started (and persisted immediately) but abandoned via navigation instead of
 * ended. `keepId` spares a still-resumable session so an in-flight workout is
 * never deleted out from under the user.
 */
export function deleteEmptySessions(keepId?: string): void {
  const sessions = loadSessions();
  const kept = sessions.filter(
    (s) => s.id === keepId || s.exercises.some((ex) => ex.sets.length > 0),
  );
  if (kept.length !== sessions.length) writeAll(kept);
}

/** Look up a single session by id. */
export function getSession(id: string): TrainingSession | undefined {
  return loadSessions().find((s) => s.id === id);
}
