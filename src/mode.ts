/* =============================================================================
   App mode — which of the two audiences the app is set up for right now. A hard
   gate: Trainer mode shows only routine authoring + sharing; Student mode shows
   only the training surfaces (Train, Stats, Recovery). Stored in localStorage
   like the other global settings (trainer name, logo) and read by the nav.
   ========================================================================== */

export type AppMode = "trainer" | "student";

const KEY = "gymlog.mode";

/** The stored mode; defaults to "student" (the owner's own training). */
export function loadMode(): AppMode {
  try {
    return localStorage.getItem(KEY) === "trainer" ? "trainer" : "student";
  } catch {
    return "student";
  }
}

/** Persist the chosen mode. */
export function saveMode(mode: AppMode): void {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // Best effort — falling back to the default mode is harmless.
  }
}
