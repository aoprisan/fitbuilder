import { defaultPlan } from "./plan";
import { defaultSheet } from "./sheet";
import { loadSheets, saveSheet } from "./sheetStorage";
import { loadPlans, savePlan } from "./storage";
import type { ExercisePlan, RoutineSheet } from "./types";
import { clonePlan, cloneSheet } from "./util";

interface AppState {
  /** The working copy currently open in the Builder. */
  editing: ExercisePlan;
  /** The plan selected to run in the Session view, if any. */
  session: ExercisePlan | null;
  /** The working copy currently open in the Routine Sheet builder. */
  editingSheet: RoutineSheet;
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

function initialEditingSheet(): RoutineSheet {
  const sheets = loadSheets();
  if (sheets.length === 0) {
    // First run: seed and persist the default sheet.
    const seeded = defaultSheet();
    saveSheet(seeded);
    return seeded;
  }
  // Open the most recently updated sheet as a fresh working copy.
  const sorted = [...sheets].sort(
    (a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""),
  );
  return cloneSheet(sorted[0]!);
}

export const state: AppState = {
  editing: initialEditing(),
  session: null,
  editingSheet: initialEditingSheet(),
};

/** Replace the Builder working copy (e.g. after import or "Edit"). */
export function setEditing(plan: ExercisePlan): void {
  state.editing = plan;
}

/** Choose the plan that the Session view will run. */
export function setSession(plan: ExercisePlan | null): void {
  state.session = plan;
}

/** Replace the Routine Sheet builder working copy. */
export function setEditingSheet(sheet: RoutineSheet): void {
  state.editingSheet = sheet;
}
