import type { ExercisePlan } from "./types";

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

/** Deep clone a plan so editing never mutates stored data. */
export function clonePlan(plan: ExercisePlan): ExercisePlan {
  return {
    schema: plan.schema,
    version: plan.version,
    id: plan.id,
    name: plan.name,
    restSec: plan.restSec,
    exercises: plan.exercises.map((ex) => ({
      name: ex.name,
      equipment: ex.equipment,
      sets: ex.sets.map((s) => ({ reps: s.reps, weightKg: s.weightKg })),
    })),
    ...(plan.updatedAt !== undefined ? { updatedAt: plan.updatedAt } : {}),
  };
}

/** Clamp a number into [min, max]. */
export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Total number of sets across all exercises in a plan. */
export function totalSets(plan: ExercisePlan): number {
  return plan.exercises.reduce((sum, ex) => sum + ex.sets.length, 0);
}

/** Format seconds as M:SS. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/** Pretty-print a plan as interop JSON. */
export function planToJson(plan: ExercisePlan): string {
  return JSON.stringify(plan, null, 2);
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
