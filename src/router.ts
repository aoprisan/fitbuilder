import type { ExercisePlan, RoutineSheet } from "./types";

export type ViewName = "home" | "builder" | "saved" | "session" | "sheet" | "execute" | "live";

export type Cleanup = () => void;

/** Navigation surface handed to every view. */
export interface Nav {
  /** Switch to a top-level view. */
  go(view: ViewName): void;
  /** Open the Builder on the given plan (a working copy). */
  edit(plan: ExercisePlan): void;
  /** Open the Session runner on the given plan. */
  start(plan: ExercisePlan): void;
  /** Open the Routine Sheet builder on the given sheet (a working copy). */
  editSheet(sheet: RoutineSheet): void;
  /** Open the Execute runner on the given sheet (a working copy / snapshot). */
  runSheet(sheet: RoutineSheet): void;
}
