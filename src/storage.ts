import type { ExercisePlan } from "./types";
import { validate } from "./validate";

const KEY = "gymlog.plans";

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
