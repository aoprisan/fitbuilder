import { defaultPlan } from "./plan";
import { loadPlans, savePlan } from "./storage";
import type { ExercisePlan } from "./types";
import { clonePlan } from "./util";

interface AppState {
  /** The working copy currently open in the Builder. */
  editing: ExercisePlan;
  /** The plan selected to run in the Session view, if any. */
  session: ExercisePlan | null;
}

function initialEditing(): ExercisePlan {
  const plans = loadPlans();
  if (plans.length === 0) {
    // First run: seed and persist the default plan.
    const seeded = defaultPlan();
    savePlan(seeded);
    return seeded;
  }
  // Open the most recently updated plan as a fresh working copy.
  const sorted = [...plans].sort(
    (a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""),
  );
  return clonePlan(sorted[0]!);
}

export const state: AppState = {
  editing: initialEditing(),
  session: null,
};

/** Replace the Builder working copy (e.g. after import or "Edit"). */
export function setEditing(plan: ExercisePlan): void {
  state.editing = plan;
}

/** Choose the plan that the Session view will run. */
export function setSession(plan: ExercisePlan | null): void {
  state.session = plan;
}
