import { h } from "../dom";
import { registerTranslations, t } from "../i18n";

registerTranslations({
  Undo: "Anulează",
});

/**
 * Undo snackbar — the friendlier replacement for confirm() on destructive
 * actions. The delete happens immediately (no blocking dialog mid-workout);
 * this strip then offers a short window to take it back. One singleton element
 * lives on document.body; a new message replaces the previous one, and
 * navigation dismisses it (see main.ts), so a stale Undo can never act on a
 * view that's gone.
 */

const UNDO_WINDOW_MS = 6000;

let host: HTMLElement | null = null;
let msgEl: HTMLElement | null = null;
let undoBtn: HTMLButtonElement | null = null;
let hideTimer = 0;
let pendingUndo: (() => void) | null = null;

function ensureHost(): void {
  if (host) return;
  msgEl = h("span", { class: "snackbar-msg" });
  undoBtn = h("button", { class: "snackbar-undo", type: "button", text: t("Undo") });
  undoBtn.addEventListener("click", () => {
    const undo = pendingUndo;
    dismissSnackbar();
    undo?.();
  });
  host = h("div", { class: "snackbar", role: "status", aria: { live: "polite" } }, [
    msgEl,
    undoBtn,
  ]);
  document.body.appendChild(host);
}

/** Show `message` with an Undo button for a few seconds. */
export function showUndo(message: string, onUndo: () => void): void {
  ensureHost();
  if (hideTimer) clearTimeout(hideTimer);
  pendingUndo = onUndo;
  msgEl!.textContent = message;
  undoBtn!.textContent = t("Undo");
  host!.classList.add("is-open");
  hideTimer = window.setTimeout(() => dismissSnackbar(), UNDO_WINDOW_MS);
}

/** Hide the snackbar and drop any pending undo (the deletion stands). */
export function dismissSnackbar(): void {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = 0;
  }
  pendingUndo = null;
  host?.classList.remove("is-open");
}
