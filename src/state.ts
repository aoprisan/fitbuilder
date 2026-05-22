import { defaultPullSheet, defaultSheet } from "./sheet";
import { loadSheets, saveSheet, seedSheetOnce } from "./sheetStorage";
import type { RoutineSheet, TrainingSession } from "./types";
import { cloneSheet } from "./util";

interface AppState {
  /** The working copy currently open in the Routine Sheet builder. */
  editingSheet: RoutineSheet;
  /** The sheet selected to run in the Execute view, if any. */
  executing: RoutineSheet | null;
  /** The training session currently open in the Live view, if any. */
  activeLog: TrainingSession | null;
}

function initialEditingSheet(): RoutineSheet {
  if (loadSheets().length === 0) {
    // First run: seed and persist the default push-day sheet.
    saveSheet(defaultSheet());
  }
  // Ensure the bundled "RUTINA TRAS" pull-day chart is present (added once).
  seedSheetOnce(defaultPullSheet());
  // Open the most recently updated sheet as a fresh working copy.
  const sorted = [...loadSheets()].sort(
    (a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""),
  );
  return cloneSheet(sorted[0] ?? defaultPullSheet());
}

export const state: AppState = {
  editingSheet: initialEditingSheet(),
  executing: null,
  activeLog: null,
};

/** Replace the Routine Sheet builder working copy. */
export function setEditingSheet(sheet: RoutineSheet): void {
  state.editingSheet = sheet;
}

/** Choose the sheet that the Execute view will run. */
export function setExecuting(sheet: RoutineSheet | null): void {
  state.executing = sheet;
}

/** Open (or clear) the training session shown in the Live view. */
export function setActiveLog(session: TrainingSession | null): void {
  state.activeLog = session;
}

/** A one-shot status message for the Routine Sheet view to show on its next mount. */
export interface SheetFlash {
  msg: string;
  kind: "ok" | "err" | "info";
}

let pendingSheetFlash: SheetFlash | null = null;

/** Queue a status message to display the next time the sheet view mounts. */
export function setSheetFlash(msg: string, kind: SheetFlash["kind"]): void {
  pendingSheetFlash = { msg, kind };
}

/** Read and clear the queued sheet-view status message, if any. */
export function takeSheetFlash(): SheetFlash | null {
  const flash = pendingSheetFlash;
  pendingSheetFlash = null;
  return flash;
}
