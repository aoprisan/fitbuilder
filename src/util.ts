import {
  EQUIPMENT_LABELS,
  isBodyweight,
  MUSCLE_LABELS,
  SESSION_ARCHIVE_SCHEMA_ID,
  SESSION_ARCHIVE_SCHEMA_VERSION,
  SHEET_SCHEMA_ID,
  SHEET_SCHEMA_VERSION,
  type Equipment,
  type LoggedExercise,
  type RoutineSheet,
  type SessionArchive,
  type TrainingSession,
} from "./types";

/** Generate a RFC4122 v4 uuid, falling back when crypto.randomUUID is absent. */
export function uuid(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }
  // Fallback: derive from getRandomValues, else Math.random.
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex: string[] = [];
  for (const b of bytes) hex.push(b.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
    .slice(6, 8)
    .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

/** Deep clone a routine sheet so editing never mutates stored data. */
export function cloneSheet(sheet: RoutineSheet): RoutineSheet {
  return {
    schema: sheet.schema,
    version: sheet.version,
    id: sheet.id,
    name: sheet.name,
    routines: sheet.routines.map((r) => ({
      title: r.title,
      tags: [...r.tags],
      exercises: r.exercises.map((e) => ({ name: e.name, prescription: e.prescription })),
    })),
    ...(sheet.updatedAt !== undefined ? { updatedAt: sheet.updatedAt } : {}),
  };
}

/** Pretty-print a routine sheet as interop JSON. */
export function sheetToJson(sheet: RoutineSheet): string {
  return JSON.stringify(sheet, null, 2);
}

/** Clamp a number into [min, max]. */
export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Format seconds as M:SS. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Summarise an exercise's logged sets as a free-text prescription, e.g.
 * "3 × 10 @ 20 kg", "12, 10, 8 reps @ 20 kg", or "4 × 12" for bodyweight.
 */
function summarizeSets(ex: LoggedExercise): string {
  const sets = ex.sets;
  if (sets.length === 0) return "—";
  const reps = sets.map((s) => s.reps);
  const weights = sets.map((s) => s.weightKg);
  const sameReps = reps.every((r) => r === reps[0]);
  const sameWeight = weights.every((w) => w === weights[0]);
  const bw = isBodyweight(ex.equipment);
  const load = (w: number): string => (bw ? (w > 0 ? ` + ${round2(w)} kg` : "") : w > 0 ? ` @ ${round2(w)} kg` : "");
  if (sameReps && sameWeight) return `${sets.length} × ${reps[0]}${load(weights[0]!)}`;
  const repsStr = reps.join(", ");
  return sameWeight ? `${repsStr} reps${load(weights[0]!)}` : `${repsStr} reps`;
}

/**
 * Turn a logged training session into a one-routine sheet so it can be reused
 * and shared through the routine export/share pipeline (PNG/PDF/WhatsApp/JSON).
 */
export function sessionToSheet(session: TrainingSession): RoutineSheet {
  return {
    schema: SHEET_SCHEMA_ID,
    version: SHEET_SCHEMA_VERSION,
    id: uuid(),
    name: session.name || "Session",
    routines: [
      {
        title: session.name || "Session",
        tags: [formatSessionDate(session.startedAt)],
        exercises: session.exercises.map((ex) => ({
          name: ex.name,
          prescription: summarizeSets(ex),
        })),
      },
    ],
    updatedAt: new Date().toISOString(),
  };
}

/** Filesystem-friendly slug derived from a plan name. */
export function slug(name: string): string {
  const s = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s === "" ? "plan" : s;
}

/** Round to at most 2 decimals, avoiding float drift from repeated steps. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Total number of sets logged across all exercises in a session. */
export function sessionSetCount(session: TrainingSession): number {
  return session.exercises.reduce((sum, ex) => sum + ex.sets.length, 0);
}

/** Total volume (Σ reps × weight, in kg) logged across a session. */
export function sessionVolume(session: TrainingSession): number {
  let total = 0;
  for (const ex of session.exercises) {
    for (const s of ex.sets) total += s.reps * s.weightKg;
  }
  return Math.round(total);
}

/** Bundle every logged session into a self-describing interop archive. */
export function sessionsArchive(sessions: TrainingSession[]): SessionArchive {
  return {
    schema: SESSION_ARCHIVE_SCHEMA_ID,
    version: SESSION_ARCHIVE_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    count: sessions.length,
    sessions,
  };
}

/** Pretty-print every logged session as an interop JSON archive. */
export function sessionsToJson(sessions: TrainingSession[]): string {
  return JSON.stringify(sessionsArchive(sessions), null, 2);
}

/** Escape a value for safe inclusion in XML text or a double-quoted attribute. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Serialise every logged session as a well-formed XML archive. */
export function sessionsToXml(sessions: TrainingSession[]): string {
  const attr = (name: string, value: string | number | undefined): string =>
    value === undefined ? "" : ` ${name}="${escapeXml(String(value))}"`;

  const lines: string[] = ['<?xml version="1.0" encoding="UTF-8"?>'];
  lines.push(
    `<sessions schema="${SESSION_ARCHIVE_SCHEMA_ID}" version="${SESSION_ARCHIVE_SCHEMA_VERSION}"` +
      `${attr("exportedAt", new Date().toISOString())} count="${sessions.length}">`,
  );
  for (const s of sessions) {
    lines.push(
      `  <session${attr("id", s.id)}${attr("name", s.name)}${attr("startedAt", s.startedAt)}${attr("updatedAt", s.updatedAt)}>`,
    );
    for (const ex of s.exercises) {
      lines.push(
        `    <exercise${attr("name", ex.name)}${attr("muscle", ex.muscle)}${attr("equipment", ex.equipment)}${attr("oneRmKg", ex.oneRmKg)}${attr("prescription", ex.prescription)}>`,
      );
      for (const set of ex.sets) {
        lines.push(
          `      <set${attr("reps", set.reps)}${attr("weightKg", set.weightKg)}${attr("durationSec", set.durationSec)}${attr("rir", set.rir)} />`,
        );
      }
      lines.push("    </exercise>");
    }
    lines.push("  </session>");
  }
  lines.push("</sessions>");
  return lines.join("\n") + "\n";
}

/** Format an ISO timestamp as a short, human date like "Thu 22 May · 14:30". */
export function formatSessionDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Format a set's load for display. Bodyweight equipment reads as "Bodyweight"
 * (optionally "Bodyweight +5 kg" when extra load is added); everything else as "12.5 kg".
 */
export function formatLoad(equipment: Equipment, weightKg: number): string {
  if (isBodyweight(equipment)) {
    return weightKg > 0 ? `Bodyweight +${round2(weightKg)} kg` : "Bodyweight";
  }
  return `${round2(weightKg)} kg`;
}

/** Coaching instruction prepended to the Markdown log so an agent knows what to do with it. */
export const SESSION_ANALYSIS_PROMPT =
  "You are an expert strength & conditioning coach. Analyse my training log below " +
  "and give me: progression trends per exercise, muscle-group balance, " +
  "effort/recovery observations, and 2-3 concrete recommendations for my next " +
  "sessions. The log follows.";

/** Markdown block for one logged session (no analysis prompt). */
function sessionToMarkdown(session: TrainingSession): string {
  const lines: string[] = [];
  lines.push(`## ${session.name || "Session"} — ${formatSessionDate(session.startedAt)}`);
  const vol = sessionVolume(session);
  const summary = `${session.exercises.length} exercises · ${sessionSetCount(session)} sets`;
  lines.push(vol > 0 ? `${summary} · ${vol} kg total volume` : summary);

  session.exercises.forEach((ex, i) => {
    lines.push("");
    lines.push(`### ${i + 1}. ${ex.name} — ${MUSCLE_LABELS[ex.muscle]} · ${EQUIPMENT_LABELS[ex.equipment]}`);
    if (ex.prescription) lines.push(`Target: ${ex.prescription}`);
    if (ex.oneRmKg !== undefined) lines.push(`Logged 1RM: ${round2(ex.oneRmKg)} kg`);
    if (ex.sets.length === 0) {
      lines.push("_No sets logged._");
      return;
    }
    lines.push("");
    lines.push("| Set | Reps | Load | RIR | Time |");
    lines.push("|----:|-----:|------|----:|-----:|");
    ex.sets.forEach((set, j) => {
      const time = set.durationSec !== undefined ? formatClock(set.durationSec) : "—";
      const rir = set.rir === undefined ? "—" : set.rir === 0 ? "0 (failure)" : String(set.rir);
      lines.push(
        `| ${j + 1} | ${set.reps} | ${formatLoad(ex.equipment, set.weightKg)} | ${rir} | ${time} |`,
      );
    });
  });
  return lines.join("\n");
}

/**
 * Render logged sessions as an analysis-ready Markdown report: a coaching prompt,
 * an archive header, then one block per session. Used for both a single session
 * (pass `[session]`) and the whole archive.
 */
export function sessionsToMarkdown(sessions: TrainingSession[]): string {
  const header = `# Training log (${sessions.length} ${
    sessions.length === 1 ? "session" : "sessions"
  }, exported ${new Date().toISOString().slice(0, 10)})`;
  return [
    SESSION_ANALYSIS_PROMPT,
    "",
    header,
    "",
    sessions.map(sessionToMarkdown).join("\n\n---\n\n"),
  ].join("\n");
}
