import { h } from "../dom";
import { registerTranslations, t } from "../i18n";

registerTranslations({
  "{0}…": "{0}…",
  "{0} ready.": "{0} gata.",
  "Could not {0}. Try again.": "Nu s-a putut {0}. Încearcă din nou.",
});

export type StatusKind = "ok" | "err" | "info";

/** A polite live-region status line plus a busy-guarded runner for async exports. */
export interface ExportStatus {
  /** The status line to mount wherever the export buttons sit. */
  el: HTMLElement;
  /** Show a message in the given tone. */
  set(msg: string, kind: StatusKind): void;
  /**
   * Run an (async) render / encode / share, reporting "{label}…", then ready or
   * failed. Ignores taps while one is already running.
   */
  run(label: string, fn: () => Promise<void>): Promise<void>;
}

/** The export status line + double-tap guard shared by Body, Train and History. */
export function exportStatus(): ExportStatus {
  const el = h("p", { class: "status", role: "status", aria: { live: "polite" } });
  const set = (msg: string, kind: StatusKind): void => {
    el.textContent = msg;
    el.className = `status status-${kind}`;
  };
  let busy = false;
  const run = async (label: string, fn: () => Promise<void>): Promise<void> => {
    if (busy) return;
    busy = true;
    const tLabel = t(label);
    set(t("{0}…").replace("{0}", tLabel), "info");
    try {
      await fn();
      set(t("{0} ready.").replace("{0}", tLabel), "ok");
    } catch {
      set(t("Could not {0}. Try again.").replace("{0}", tLabel.toLowerCase()), "err");
    } finally {
      busy = false;
    }
  };
  return { el, set, run };
}
