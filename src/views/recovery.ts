import { h } from "../dom";
import { registerTranslations, t } from "../i18n";
import {
  canShareFiles,
  exportRecoveryPdf,
  exportRecoveryPng,
  shareRecovery,
} from "../exporters";
import { loadSessions } from "../logStorage";
import {
  muscleRecovery,
  overallRecovery,
  recoveryColor,
  overallStatus,
  systemicNote,
  systemicRecovery,
  type MuscleRecovery,
} from "../recovery";
import type { Cleanup, Nav } from "../router";
import { MUSCLE_LABELS, type TrainingSession } from "../types";
import { clamp, formatSessionDate } from "../util";

registerTranslations({
  Ready: "Recuperat",
  "{0}% · ~{1}h": "{0}% · ~{1}h",
  "Last trained {0}": "Ultima dată antrenat {0}",
  "Not trained yet": "Neantrenat încă",
  Readiness: "Disponibilitate",
  Recovery: "Recuperare",
  "How recovered each muscle is since you last trained it — red just-worked, green ready to train again.":
    "Cât de recuperat este fiecare mușchi de la ultimul antrenament — roșu abia lucrat, verde gata de antrenat din nou.",
  "No training logged yet — finish a live session and recovery fills in here.":
    "Niciun antrenament înregistrat încă — termină un antrenament Live și recuperarea se va completa aici.",
  "Start Live Session": "Pornește Antrenament Live",
  "Every muscle group is fully recovered — good to go.":
    "Fiecare grup muscular este complet recuperat — ești gata.",
  "{0} muscle group still recovering — train the green ones.":
    "{0} grup muscular încă se recuperează — antrenează-le pe cele verzi.",
  "{0} muscle groups still recovering — train the green ones.":
    "{0} grupuri musculare încă se recuperează — antrenează-le pe cele verzi.",
  Overall: "General",
  Muscles: "Mușchi",
  Systemic: "Sistemic",
  "By muscle": "Pe mușchi",
  "Muscle recovery": "Recuperare musculară",
  "Export · Share": "Export · Distribuie",
  "Share sends a PNG of your recovery board to the native share sheet — or save a PNG/PDF.":
    "Distribuie trimite un PNG al tabloului de recuperare către meniul de partajare — sau salvează un PNG/PDF.",
  "Save a PNG or PDF of this recovery board. (Direct share works on phones.)":
    "Salvează un PNG sau PDF al acestui tablou de recuperare. (Distribuirea directă funcționează pe telefoane.)",
  "Share ▸": "Distribuie ▸",
  "Opened the share sheet — pick WhatsApp.":
    "Meniul de partajare s-a deschis — alege WhatsApp.",
  "Sharing isn't available here, so the PNG was downloaded instead.":
    "Distribuirea nu este disponibilă aici, așa că PNG-ul a fost descărcat în schimb.",
  Share: "Distribuie",
  share: "distribuie",
  "Save PNG": "Salvează PNG",
  "save png": "salvează png",
  "Save PDF": "Salvează PDF",
  "save pdf": "salvează pdf",
  "{0}…": "{0}…",
  "{0} ready.": "{0} gata.",
  "Could not {0}. Try again.": "Nu s-a putut {0}. Încearcă din nou.",
});

const SVG_NS = "http://www.w3.org/2000/svg";
const RING_R = 49;
const RING_C = 2 * Math.PI * RING_R;

function svgEl(tag: string, attrs: Record<string, string>): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

/** A circular red→green recovery gauge with a percentage and status in the centre. */
export function recoveryRing(
  recovered: number,
  statusLabel: string,
  opts: { size?: "sm" | "dual" } = {},
): HTMLElement {
  const color = recoveryColor(recovered);
  const fill = svgEl("circle", {
    class: "recovery-ring-fill",
    cx: "60",
    cy: "60",
    r: String(RING_R),
    "stroke-dasharray": String(RING_C),
    "stroke-dashoffset": String(RING_C * (1 - clamp(recovered, 0, 1))),
  });
  fill.style.stroke = color;

  const svg = svgEl("svg", { class: "dial", viewBox: "0 0 120 120", "aria-hidden": "true" });
  svg.appendChild(svgEl("circle", { class: "dial-track", cx: "60", cy: "60", r: String(RING_R) }));
  svg.appendChild(fill);

  const pct = h("span", { class: "recovery-ring-pct", text: `${Math.round(recovered * 100)}%` });
  pct.style.color = color;

  const sizeClass =
    opts.size === "sm" ? " recovery-ring--sm" : opts.size === "dual" ? " recovery-ring--dual" : "";
  return h("div", { class: `dial-wrap recovery-ring${sizeClass}` }, [
    svg,
    h("div", { class: "dial-center recovery-ring-center" }, [
      pct,
      h("span", { class: "recovery-ring-status", text: statusLabel }),
    ]),
  ]);
}

export function ringCell(ring: HTMLElement, caption: string): HTMLElement {
  return h("div", { class: "recovery-ring-cell" }, [
    ring,
    h("span", { class: "recovery-ring-caption", text: caption }),
  ]);
}

function recoveryRow(r: MuscleRecovery): HTMLElement {
  const pct = Math.round(r.recovered * 100);
  const color = recoveryColor(r.recovered);

  const fill = h("div", { class: "muscle-bar-fill" });
  fill.style.width = `${pct}%`;
  fill.style.background = color;

  const stat = h("span", {
    class: "muscle-stat",
    text: r.recovered >= 1
      ? t("Ready")
      : t("{0}% · ~{1}h")
          .replace("{0}", String(pct))
          .replace("{1}", String(r.hoursRemaining)),
  });
  stat.style.color = color;

  const detail = r.lastTrainedAt
    ? t("Last trained {0}").replace("{0}", formatSessionDate(r.lastTrainedAt))
    : t("Not trained yet");

  return h("div", { class: "muscle-effort" }, [
    h("div", { class: "muscle-row" }, [
      h("span", { class: "muscle-name", text: t(MUSCLE_LABELS[r.muscle]) }),
      stat,
    ]),
    h("div", { class: "muscle-bar" }, [fill]),
    h("span", { class: "muscle-detail", text: detail }),
  ]);
}

export function mountRecovery(root: HTMLElement, nav: Nav): Cleanup {
  const sessions = loadSessions();
  const recoveries = muscleRecovery(sessions);
  const hasHistory = recoveries.some((r) => r.lastTrainedAt !== null);

  const header = h("section", { class: "card" }, [
    h("p", { class: "eyebrow", text: t("Readiness") }),
    h("h2", { class: "section-title", text: t("Recovery") }),
    h("p", {
      class: "plan-meta",
      text: t("How recovered each muscle is since you last trained it — red just-worked, green ready to train again."),
    }),
  ]);

  if (!hasHistory) {
    root.appendChild(
      h("div", { class: "view view-recovery" }, [
        header,
        h("section", { class: "card" }, [
          h("p", {
            class: "empty",
            text: t("No training logged yet — finish a live session and recovery fills in here."),
          }),
          h("div", { class: "btn-row" }, [
            h("button", {
              class: "btn btn-primary",
              text: t("Start Live Session"),
              on: { click: () => nav.go("live") },
            }),
          ]),
        ]),
      ]),
    );
    return () => {};
  }

  const overall = overallRecovery(recoveries);
  const systemic = systemicRecovery(sessions);
  const recovering = recoveries.filter((r) => r.recovered < 1).length;
  const muscleNote =
    recovering === 0
      ? t("Every muscle group is fully recovered — good to go.")
      : (recovering === 1
          ? t("{0} muscle group still recovering — train the green ones.")
          : t("{0} muscle groups still recovering — train the green ones.")
        ).replace("{0}", String(recovering));

  const totalCard = h("section", { class: "card recovery-total" }, [
    h("p", { class: "eyebrow", text: t("Overall") }),
    h("div", { class: "recovery-rings" }, [
      ringCell(recoveryRing(overall, overallStatus(overall), { size: "dual" }), t("Muscles")),
      ringCell(
        recoveryRing(systemic.readiness, overallStatus(systemic.readiness), { size: "dual" }),
        t("Systemic"),
      ),
    ]),
    h("p", { class: "plan-meta recovery-total-note", text: muscleNote }),
    h("p", {
      class: "plan-meta recovery-total-note",
      text: systemicNote(systemic.readiness, systemic.hoursRemaining),
    }),
  ]);

  const musclesCard = h("section", { class: "card" }, [
    h("p", { class: "eyebrow", text: t("By muscle") }),
    h("h2", { class: "section-title", text: t("Muscle recovery") }),
    h("div", { class: "summary-muscles" }, recoveries.map(recoveryRow)),
  ]);

  root.appendChild(
    h("div", { class: "view view-recovery" }, [
      header,
      totalCard,
      musclesCard,
      renderExportPanel(sessions),
    ]),
  );
  return () => {};
}

/**
 * "Export · Share" card — renders the recovery board as a PNG/PDF or hands it to
 * the native share sheet. Mirrors the stats view's export panel.
 */
function renderExportPanel(sessions: TrainingSession[]): HTMLElement {
  const statusEl = h("p", { class: "status", role: "status", aria: { live: "polite" } });
  const setStatus = (msg: string, kind: "ok" | "err" | "info"): void => {
    statusEl.textContent = msg;
    statusEl.className = `status status-${kind}`;
  };
  let busy = false;
  async function runExport(label: string, fn: () => Promise<void>): Promise<void> {
    if (busy) return;
    busy = true;
    setStatus(t("{0}…").replace("{0}", t(label)), "info");
    try {
      await fn();
      setStatus(t("{0} ready.").replace("{0}", t(label)), "ok");
    } catch {
      setStatus(t("Could not {0}. Try again.").replace("{0}", t(label.toLowerCase())), "err");
    } finally {
      busy = false;
    }
  }

  return h("section", { class: "card live-export" }, [
    h("h2", { class: "section-title", text: t("Export · Share") }),
    h("p", {
      class: "plan-meta",
      text: canShareFiles()
        ? t("Share sends a PNG of your recovery board to the native share sheet — or save a PNG/PDF.")
        : t("Save a PNG or PDF of this recovery board. (Direct share works on phones.)"),
    }),
    h("div", { class: "btn-row" }, [
      h("button", {
        class: "btn btn-small btn-accent",
        type: "button",
        text: t("Share ▸"),
        on: {
          click: () =>
            runExport("Share", async () => {
              const result = await shareRecovery(sessions);
              setStatus(
                result === "shared"
                  ? t("Opened the share sheet — pick WhatsApp.")
                  : t("Sharing isn't available here, so the PNG was downloaded instead."),
                "ok",
              );
            }),
        },
      }),
      h("button", {
        class: "btn btn-small",
        type: "button",
        text: "PNG",
        on: { click: () => runExport("Save PNG", () => exportRecoveryPng(sessions)) },
      }),
      h("button", {
        class: "btn btn-small",
        type: "button",
        text: "PDF",
        on: { click: () => runExport("Save PDF", () => exportRecoveryPdf(sessions)) },
      }),
    ]),
    statusEl,
  ]);
}
