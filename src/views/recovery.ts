import { h } from "../dom";
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
    text: r.recovered >= 1 ? "Ready" : `${pct}% · ~${r.hoursRemaining}h`,
  });
  stat.style.color = color;

  const detail = r.lastTrainedAt
    ? `Last trained ${formatSessionDate(r.lastTrainedAt)}`
    : "Not trained yet";

  return h("div", { class: "muscle-effort" }, [
    h("div", { class: "muscle-row" }, [
      h("span", { class: "muscle-name", text: MUSCLE_LABELS[r.muscle] }),
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
    h("p", { class: "eyebrow", text: "Readiness" }),
    h("h2", { class: "section-title", text: "Recovery" }),
    h("p", {
      class: "plan-meta",
      text: "How recovered each muscle is since you last trained it — red just-worked, green ready to train again.",
    }),
  ]);

  if (!hasHistory) {
    root.appendChild(
      h("div", { class: "view view-recovery" }, [
        header,
        h("section", { class: "card" }, [
          h("p", {
            class: "empty",
            text: "No training logged yet — finish a live session and recovery fills in here.",
          }),
          h("div", { class: "btn-row" }, [
            h("button", {
              class: "btn btn-primary",
              text: "Start Live Session",
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
      ? "Every muscle group is fully recovered — good to go."
      : `${recovering} muscle ${recovering === 1 ? "group" : "groups"} still recovering — train the green ones.`;

  const totalCard = h("section", { class: "card recovery-total" }, [
    h("p", { class: "eyebrow", text: "Overall" }),
    h("div", { class: "recovery-rings" }, [
      ringCell(recoveryRing(overall, overallStatus(overall), { size: "dual" }), "Muscles"),
      ringCell(
        recoveryRing(systemic.readiness, overallStatus(systemic.readiness), { size: "dual" }),
        "Systemic",
      ),
    ]),
    h("p", { class: "plan-meta recovery-total-note", text: muscleNote }),
    h("p", {
      class: "plan-meta recovery-total-note",
      text: systemicNote(systemic.readiness, systemic.hoursRemaining),
    }),
  ]);

  const musclesCard = h("section", { class: "card" }, [
    h("p", { class: "eyebrow", text: "By muscle" }),
    h("h2", { class: "section-title", text: "Muscle recovery" }),
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
    setStatus(`${label}…`, "info");
    try {
      await fn();
      setStatus(`${label} ready.`, "ok");
    } catch {
      setStatus(`Could not ${label.toLowerCase()}. Try again.`, "err");
    } finally {
      busy = false;
    }
  }

  return h("section", { class: "card live-export" }, [
    h("h2", { class: "section-title", text: "Export · Share" }),
    h("p", {
      class: "plan-meta",
      text: canShareFiles()
        ? "Share sends a PNG of your recovery board to the native share sheet — or save a PNG/PDF."
        : "Save a PNG or PDF of this recovery board. (Direct share works on phones.)",
    }),
    h("div", { class: "btn-row" }, [
      h("button", {
        class: "btn btn-small btn-accent",
        type: "button",
        text: "Share ▸",
        on: {
          click: () =>
            runExport("Share", async () => {
              const result = await shareRecovery(sessions);
              setStatus(
                result === "shared"
                  ? "Opened the share sheet — pick WhatsApp."
                  : "Sharing isn't available here, so the PNG was downloaded instead.",
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
