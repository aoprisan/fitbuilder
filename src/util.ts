import {
  EQUIPMENT_LABELS,
  isBodyweight,
  MUSCLE_LABELS,
  SESSION_ARCHIVE_SCHEMA_ID,
  SESSION_ARCHIVE_SCHEMA_VERSION,
  SHEET_SCHEMA_ID,
  SHEET_SCHEMA_VERSION,
  type Equipment,
  type ExerciseTarget,
  type LoggedExercise,
  type RoutineExercise,
  type RoutineSheet,
  type SessionArchive,
  type SetTarget,
  type TrainingSession,
  type VolumeTarget,
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

/** Deep clone an exercise target (per-set scheme or rep volume). */
function cloneTarget(t: ExerciseTarget): ExerciseTarget {
  if (t.kind === "sets") {
    return {
      kind: "sets",
      sets: t.sets.map((s) => ({
        reps: s.reps,
        ...(s.loadKg !== undefined ? { loadKg: s.loadKg } : {}),
      })),
    };
  }
  return {
    kind: "volume",
    totalReps: t.totalReps,
    ...(t.loadKg !== undefined ? { loadKg: t.loadKg } : {}),
  };
}

/** Deep clone a routine exercise so editing never mutates stored data. */
export function cloneRoutineExercise(e: RoutineExercise): RoutineExercise {
  return {
    name: e.name,
    ...(e.target ? { target: cloneTarget(e.target) } : {}),
    ...(e.note !== undefined ? { note: e.note } : {}),
    ...(e.exerciseId !== undefined ? { exerciseId: e.exerciseId } : {}),
    ...(e.muscle !== undefined ? { muscle: e.muscle } : {}),
    ...(e.equipment !== undefined ? { equipment: e.equipment } : {}),
    ...(e.secondaryMuscles && e.secondaryMuscles.length > 0
      ? { secondaryMuscles: [...e.secondaryMuscles] }
      : {}),
  };
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
      exercises: r.exercises.map(cloneRoutineExercise),
    })),
    ...(sheet.updatedAt !== undefined ? { updatedAt: sheet.updatedAt } : {}),
  };
}

/**
 * Render structured per-set targets as a compact human string for authoring
 * previews and shared exports. Uniform schemes collapse to "3×10 @ 20kg";
 * varying reps/loads list out as "12, 10, 8 @ 60/70/80kg". Bodyweight sets
 * (no `loadKg`) omit the load. Returns "" for an empty list.
 */
export function formatSetTargets(targets: readonly SetTarget[]): string {
  if (targets.length === 0) return "";

  const reps = targets.map((t) => t.reps);
  const loads = targets.map((t) => t.loadKg);
  const uniformReps = reps.every((r) => r === reps[0]);
  const hasLoad = loads.some((l) => l !== undefined);
  const uniformLoad = loads.every((l) => l === loads[0]);

  const repPart = uniformReps ? `${targets.length}×${reps[0]}` : reps.join(", ");

  if (!hasLoad) return repPart;

  const loadStr = (l: number | undefined): string => (l !== undefined ? String(l) : "—");
  const loadPart = uniformLoad ? loadStr(loads[0]) : loads.map(loadStr).join("/");
  return `${repPart} @ ${loadPart}kg`;
}

/** Render a self-paced rep volume as "50 reps" (or "50 reps @ 20kg" when loaded). */
export function formatVolumeTarget(t: VolumeTarget): string {
  const reps = `${t.totalReps} reps`;
  return t.loadKg !== undefined && t.loadKg > 0 ? `${reps} @ ${round2(t.loadKg)}kg` : reps;
}

/**
 * A compact human label for an exercise's target — the per-set scheme, the rep
 * volume, or (for a note-only row) its note. Used by the builder preview, the
 * shared PNG/PDF exports, and as the target carried into a live/run session.
 */
export function formatTarget(ex: RoutineExercise): string {
  const t = ex.target;
  if (t?.kind === "sets") return formatSetTargets(t.sets);
  if (t?.kind === "volume") return formatVolumeTarget(t);
  return (ex.note ?? "").trim();
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
 * Build a per-set target from an exercise's logged sets (reps + any added/external
 * load). Placeholder sets with no reps (timed/manual rows) are dropped; returns
 * undefined when nothing countable was logged.
 */
function loggedSetsToTarget(ex: LoggedExercise): ExerciseTarget | undefined {
  const sets = ex.sets
    .filter((s) => s.reps > 0)
    .map((s) => ({ reps: s.reps, ...(s.weightKg > 0 ? { loadKg: round2(s.weightKg) } : {}) }));
  return sets.length > 0 ? { kind: "sets", sets } : undefined;
}

/**
 * Turn a logged training session into a one-routine sheet so it can be reused
 * and shared through the routine export/share pipeline (PNG/PDF/WhatsApp/JSON).
 * Each logged exercise becomes a per-set target reflecting what was actually done.
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
        exercises: session.exercises.map((ex) => {
          const target = loggedSetsToTarget(ex);
          return { name: ex.name, ...(target ? { target } : {}) };
        }),
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
