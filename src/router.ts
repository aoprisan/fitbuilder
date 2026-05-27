import type { RoutineSheet } from "./types";

export type ViewName =
  | "home"
  | "sheet"
  | "execute"
  | "live"
  | "stats"
  | "weekly"
  | "recovery"
  | "claudeStart";

export type Cleanup = () => void;

/** Navigation surface handed to every view. */
export interface Nav {
  /** Switch to a top-level view. */
  go(view: ViewName): void;
  /** Open the Routine Sheet builder on the given sheet (a working copy). */
  editSheet(sheet: RoutineSheet): void;
  /** Open the Execute runner on the given sheet (a working copy / snapshot). */
  runSheet(sheet: RoutineSheet): void;
  /** Start a Live session pre-loaded from a routine sheet (additive to Execute). */
  startLive(sheet: RoutineSheet): void;
}
