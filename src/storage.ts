import type { ExercisePlan } from "./types";
import { validate } from "./validate";

const KEY = "gymlog.plans";
/** Ids of bundled plans already seeded, so a deleted one isn't resurrected. */
const SEEDED_KEY = "gymlog.plans.seeded";

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

/** Load all saved plans. Invalid entries are skipped rather than failing the whole read. */
export function loadPlans(): ExercisePlan[] {
  const raw = readRaw();
  if (!Array.isArray(raw)) return [];
  const plans: ExercisePlan[] = [];
  for (const entry of raw) {
    try {
      plans.push(validate(entry));
    } catch {
      // Drop corrupt entries silently; the rest remain usable.
    }
  }
  return plans;
}

function writeAll(plans: ExercisePlan[]): void {
  localStorage.setItem(KEY, JSON.stringify(plans));
}

/** Insert or update a plan by id, stamping updatedAt. Returns the stored copy. */
export function savePlan(plan: ExercisePlan): ExercisePlan & { updatedAt: string } {
  const stored = { ...plan, updatedAt: new Date().toISOString() };
  const plans = loadPlans();
  const idx = plans.findIndex((p) => p.id === stored.id);
  if (idx >= 0) plans[idx] = stored;
  else plans.push(stored);
  writeAll(plans);
  return stored;
}

/** Remove a plan by id. */
export function deletePlan(id: string): void {
  writeAll(loadPlans().filter((p) => p.id !== id));
}

/** Look up a single plan by id. */
export function getPlan(id: string): ExercisePlan | undefined {
  return loadPlans().find((p) => p.id === id);
}

function seededIds(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(SEEDED_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Add a bundled plan exactly once. It's stored only if its id has never been
 * seeded before and isn't already present, then its id is recorded — so a user
 * who later deletes it won't see it return on the next load. Unlike savePlan,
 * the plan's own updatedAt is preserved so its position in the list is stable.
 */
export function seedPlanOnce(plan: ExercisePlan): void {
  const seeded = seededIds();
  if (seeded.includes(plan.id)) return;
  const plans = loadPlans();
  if (!plans.some((p) => p.id === plan.id)) {
    plans.push(plan);
    writeAll(plans);
  }
  try {
    localStorage.setItem(SEEDED_KEY, JSON.stringify([...seeded, plan.id]));
  } catch {
    // If we can't record the marker, worst case is it's re-added next load.
  }
}
