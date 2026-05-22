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

function writeAll(sessions: TrainingSession[]): void {
  localStorage.setItem(KEY, JSON.stringify(sessions));
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

/** Look up a single session by id. */
export function getSession(id: string): TrainingSession | undefined {
  return loadSessions().find((s) => s.id === id);
}
