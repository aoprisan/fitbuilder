import type { RoutineSheet } from "./types";

/** One checkable line in an execute run — a single exercise within a routine. */
export interface RunItem {
  /** Index of the parent routine within the sheet. */
  routineIndex: number;
  /** The parent routine's title, denormalized for display. */
  routineTitle: string;
  /** 0-based position of this exercise within its routine. */
  exerciseIndex: number;
  name: string;
  /** Free-text prescription, e.g. "30-50 repetari". */
  prescription: string;
}

/**
 * Flatten a sheet into an ordered list of checkable items. Completely blank
 * rows (no name and no prescription) are dropped so empty builder rows don't
 * inflate the run.
 */
export function flattenSheet(sheet: RoutineSheet): RunItem[] {
  const items: RunItem[] = [];
  sheet.routines.forEach((routine, routineIndex) => {
    routine.exercises.forEach((ex, exerciseIndex) => {
      if (ex.name.trim() === "" && ex.prescription.trim() === "") return;
      items.push({
        routineIndex,
        routineTitle: routine.title,
        exerciseIndex,
        name: ex.name,
        prescription: ex.prescription,
      });
    });
  });
  return items;
}

/**
 * Execute state for a routine sheet: a flat checklist the user works through by
 * marking each item done. Unlike {@link SessionController} there is no clock,
 * no rest, and no auto-advance — completion is entirely user-driven, and items
 * may be checked or unchecked in any order.
 */
export class ExecuteController {
  readonly items: RunItem[];
  private readonly done = new Set<number>();

  constructor(sheet: RoutineSheet) {
    this.items = flattenSheet(sheet);
  }

  get total(): number {
    return this.items.length;
  }

  completedCount(): number {
    return this.done.size;
  }

  isDone(index: number): boolean {
    return this.done.has(index);
  }

  allDone(): boolean {
    return this.total > 0 && this.done.size === this.total;
  }

  /** First not-done item — the one the focused card highlights. -1 when none. */
  currentIndex(): number {
    for (let i = 0; i < this.items.length; i++) {
      if (!this.done.has(i)) return i;
    }
    return -1;
  }

  /** Flip an item's done state (lets the user undo or work out of order). */
  toggle(index: number): void {
    if (index < 0 || index >= this.total) return;
    if (this.done.has(index)) this.done.delete(index);
    else this.done.add(index);
  }

  /** Mark an item done without un-toggling — used by the primary button. */
  markDone(index: number): void {
    if (index < 0 || index >= this.total) return;
    this.done.add(index);
  }

  reset(): void {
    this.done.clear();
  }
}
