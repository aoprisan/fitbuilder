import type { TrainingSession } from "./types";

interface AppState {
  /** The training session currently open in the Live view, if any. */
  activeLog: TrainingSession | null;
}

export const state: AppState = {
  activeLog: null,
};

/** Open (or clear) the training session shown in the Live view. */
export function setActiveLog(session: TrainingSession | null): void {
  state.activeLog = session;
}
