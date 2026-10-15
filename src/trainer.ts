/* =============================================================================
   Trainer name — a single editable byline (e.g. the coach's name) that brands
   every routine alongside the logo. Like the logo it's a global setting stored
   in localStorage, read directly by the sheet renderer and the on-screen views.
   ========================================================================== */

const KEY = "gymlog.trainer";

/** Cap the length so the byline can't overflow the sheet header. */
const MAX_LEN = 50;

/** The stored trainer name, or "" when none is set. */
export function loadTrainer(): string {
  try {
    return (localStorage.getItem(KEY) ?? "").slice(0, MAX_LEN);
  } catch {
    return "";
  }
}
