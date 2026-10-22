import { dateLocale } from "./i18n";
import {
  EQUIPMENT_LABELS,
  FATIGUE_LABELS,
  isBodyweight,
  isCardio,
  MUSCLE_LABELS,
  SESSION_ARCHIVE_SCHEMA_ID,
  SESSION_ARCHIVE_SCHEMA_VERSION,
  type Equipment,
  type ExerciseTarget,
  type Routine,
  type RoutineExercise,
  type RoutineKind,
  type RoutineSection,
  type SessionArchive,
  type SetTarget,
  type TrainingSession,
  type VolumeTarget,
  type WorkSet,
} from "./types";
import { isIsometricHold } from "./movements";

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
export function cloneTarget(t: ExerciseTarget): ExerciseTarget {
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
    ...(e.supersetWithPrevious === true ? { supersetWithPrevious: true } : {}),
  };
}

/** A routine's effective kind, defaulting to "movements" for back-compat. */
export function routineKind(r: Routine): RoutineKind {
  return r.kind === "session" ? "session" : "movements";
}

/**
 * Every exercise in a routine, in order, regardless of kind — a session's
 * sections flattened, or a movement list's flat array. The single read path so
 * run / export / render code never has to branch on kind.
 */
export function routineExercises(r: Routine): RoutineExercise[] {
  if (routineKind(r) === "session" && r.sections) return r.sections.flatMap((s) => s.exercises);
  return r.exercises;
}

/**
 * A section view of a routine for section-aware UIs: a structured session's own
 * sections, or a single untitled section wrapping a movement list's exercises.
 */
export function routineSections(r: Routine): RoutineSection[] {
  if (routineKind(r) === "session" && r.sections) return r.sections;
  return [{ title: "", exercises: r.exercises }];
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
      `  <session${attr("id", s.id)}${attr("name", s.name)}${attr("startedAt", s.startedAt)}${attr("endedAt", s.endedAt)}${attr("startFatigue", s.startFatigue)}${attr("updatedAt", s.updatedAt)}>`,
    );
    for (const ex of s.exercises) {
      lines.push(
        `    <exercise${attr("name", ex.name)}${attr("muscle", ex.muscle)}${attr("equipment", ex.equipment)}${attr("oneRmKg", ex.oneRmKg)}${attr("prescription", ex.prescription)}>`,
      );
      for (const set of ex.sets) {
        lines.push(
          `      <set${attr("reps", set.reps)}${attr("weightKg", set.weightKg)}${attr("durationSec", set.durationSec)}${attr("rir", set.rir)}${attr("setType", set.setType)}` +
            `${attr("distanceKm", set.distanceKm)}${attr("speedKmh", set.speedKmh)}${attr("inclinePct", set.inclinePct)} />`,
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
  return date.toLocaleString(dateLocale(), {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Format an ISO timestamp as just the clock time, like "14:30". */
export function formatSessionTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString(dateLocale(), { hour: "2-digit", minute: "2-digit" });
}

/**
 * Wall-clock duration of a session in seconds — from {@link TrainingSession.startedAt}
 * to {@link TrainingSession.endedAt}. Returns null when the session hasn't been
 * ended yet or either timestamp is unparseable / out of order.
 */
export function sessionDurationSec(session: TrainingSession): number | null {
  if (session.endedAt === undefined) return null;
  const start = new Date(session.startedAt).getTime();
  const end = new Date(session.endedAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  return Math.round((end - start) / 1000);
}

/** Format a duration in seconds compactly: "1h 05m", "42 min", or "38 sec". */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins.toString().padStart(2, "0")}m`;
  if (mins > 0) return `${mins} min`;
  return `${s} sec`;
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

/**
 * Format a cardio (treadmill) bout for display — distance, speed, incline and
 * time, omitting any field that wasn't recorded. Reads e.g. "5 km · 8 km/h · 2%
 * · 30:00". Returns "—" when a bout carries nothing measurable.
 */
export function formatCardioSet(set: WorkSet): string {
  const bits: string[] = [];
  if (set.distanceKm !== undefined && set.distanceKm > 0) bits.push(`${round2(set.distanceKm)} km`);
  if (set.speedKmh !== undefined && set.speedKmh > 0) bits.push(`${round2(set.speedKmh)} km/h`);
  if (set.inclinePct !== undefined && set.inclinePct > 0) bits.push(`${round2(set.inclinePct)}%`);
  if (set.durationSec !== undefined) bits.push(formatClock(set.durationSec));
  return bits.length > 0 ? bits.join(" · ") : "—";
}

/** Coaching instruction prepended to the Markdown log so an agent knows what to do with it. */
export const SESSION_ANALYSIS_PROMPT =
  "You are an expert strength & conditioning coach. Analyse my training log below " +
  "and give me: progression trends per exercise, muscle-group balance, " +
  "effort/recovery observations, and 2-3 concrete recommendations for my next " +
  "sessions. Each session notes my fatigue level coming in plus its start/end time " +
  "and total duration — factor these into your read, since high pre-session fatigue " +
  "and unusually long or rushed sessions affect performance. The log follows.";

/** Markdown block for one logged session (no analysis prompt). */
function sessionToMarkdown(session: TrainingSession): string {
  const lines: string[] = [];
  lines.push(`## ${session.name || "Session"} — ${formatSessionDate(session.startedAt)}`);
  const vol = sessionVolume(session);
  const summary = `${session.exercises.length} exercises · ${sessionSetCount(session)} sets`;
  lines.push(vol > 0 ? `${summary} · ${vol} kg total volume` : summary);

  // Timing (start → end · duration) and pre-session fatigue — context the raw sets
  // can't show, so the coach can weigh performance against readiness and pace.
  const timing: string[] = [`Started ${formatSessionDate(session.startedAt)}`];
  if (session.endedAt !== undefined) timing.push(`ended ${formatSessionTime(session.endedAt)}`);
  const durSec = sessionDurationSec(session);
  if (durSec !== null) timing.push(`duration ${formatDuration(durSec)}`);
  lines.push(timing.join(" · "));
  if (session.startFatigue !== undefined) {
    lines.push(
      `Fatigue at start: ${FATIGUE_LABELS[session.startFatigue]} (${session.startFatigue}/5)`,
    );
  }

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
    if (isCardio(ex.equipment)) {
      // Cardio bouts read in distance / speed / incline / time, not reps × load.
      lines.push("| Bout | Distance | Speed | Incline | Time |");
      lines.push("|----:|---------:|------:|--------:|-----:|");
      ex.sets.forEach((set, j) => {
        const dist = set.distanceKm !== undefined ? `${round2(set.distanceKm)} km` : "—";
        const speed = set.speedKmh !== undefined ? `${round2(set.speedKmh)} km/h` : "—";
        const incline = set.inclinePct !== undefined ? `${round2(set.inclinePct)}%` : "—";
        const time = set.durationSec !== undefined ? formatClock(set.durationSec) : "—";
        lines.push(`| ${j + 1} | ${dist} | ${speed} | ${incline} | ${time} |`);
      });
      return;
    }
    if (isIsometricHold(ex.exerciseId)) {
      // Isometric holds (plank, dead hang) read by time held, not reps × load.
      lines.push("| Hold | Time | Added load |");
      lines.push("|----:|-----:|-----------:|");
      ex.sets.forEach((set, j) => {
        const time = set.durationSec !== undefined ? formatClock(set.durationSec) : "—";
        const load = set.weightKg > 0 ? formatLoad(ex.equipment, set.weightKg) : "—";
        lines.push(`| ${j + 1} | ${time} | ${load} |`);
      });
      return;
    }
    lines.push("| Set | Type | Reps | Load | RIR | Time |");
    lines.push("|----:|------|-----:|------|----:|-----:|");
    ex.sets.forEach((set, j) => {
      const time = set.durationSec !== undefined ? formatClock(set.durationSec) : "—";
      const rir = set.rir === undefined ? "—" : set.rir === 0 ? "0 (failure)" : String(set.rir);
      const type = set.setType === "warmup" ? "warm-up" : set.setType === "dropset" ? "drop set" : "work";
      lines.push(
        `| ${j + 1} | ${type} | ${set.reps} | ${formatLoad(ex.equipment, set.weightKg)} | ${rir} | ${time} |`,
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
