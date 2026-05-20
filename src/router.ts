import type { ExercisePlan } from "./types";

export type ViewName = "home" | "builder" | "saved" | "session";

export type Cleanup = () => void;

/** Navigation surface handed to every view. */
export interface Nav {
  /** Switch to a top-level view. */
  go(view: ViewName): void;
  /** Open the Builder on the given plan (a working copy). */
  edit(plan: ExercisePlan): void;
  /** Open the Session runner on the given plan. */
  start(plan: ExercisePlan): void;
}
