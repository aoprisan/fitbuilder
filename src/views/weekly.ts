import { h } from "../dom";
import { loadSessions } from "../logStorage";
import { recoveryColor } from "../recovery";
import type { Cleanup, Nav } from "../router";
import {
  type MuscleWeeklyVolume,
  type VolumeBand,
  WEEKLY_MAINTENANCE_SETS,
  WEEKLY_PRODUCTIVE_MAX,
  WEEKLY_PRODUCTIVE_MIN,
  weeklyMuscleVolume,
} from "../stats";
import { MUSCLE_LABELS } from "../types";
import { clamp } from "../util";

const BAND_LABEL: Record<VolumeBand, string> = {
  none: "Not trained",
  under: "Below maintenance",
  maintenance: "Maintenance",
  productive: "Productive",
  high: "High volume",
};

// Each band's position on the recovery red→green ramp. "high" reads amber, not
// red: more-than-productive volume isn't harmful, just lower-yield per set.
const BAND_TONE: Record<VolumeBand, number> = {
  none: 0,
  under: 0.18,
  maintenance: 0.5,
  productive: 1,
  high: 0.6,
};

/** One muscle's weekly volume as a coloured bar, mirroring the recovery rows. */
function volumeRow(v: MuscleWeeklyVolume): HTMLElement {
  const color = recoveryColor(BAND_TONE[v.band]);

  const fill = h("div", { class: "muscle-bar-fill" });
  fill.style.width = `${clamp(v.sets / WEEKLY_PRODUCTIVE_MAX, 0, 1) * 100}%`;
  fill.style.background = color;

  const stat = h("span", {
    class: "muscle-stat",
    text: `${v.sets} ${v.sets === 1 ? "set" : "sets"}`,
  });
  stat.style.color = color;

  const detail =
    v.sets > 0
      ? `${BAND_LABEL[v.band]} · ≈${Math.round(v.stimulus * 100)}% of attainable stimulus`
      : "Not trained this week";

  return h("div", { class: "muscle-effort" }, [
    h("div", { class: "muscle-row" }, [
      h("span", { class: "muscle-name", text: MUSCLE_LABELS[v.muscle] }),
      stat,
    ]),
    h("div", { class: "muscle-bar" }, [fill]),
    h("span", { class: "muscle-detail", text: detail }),
  ]);
}

/**
 * Weekly Volume board: effective hard sets per muscle over the trailing 7 days,
 * read against the hypertrophy dose-response (productive ~10–20 sets/week, with
 * diminishing returns past ~20). The per-muscle "attainable stimulus" figure is
 * the concave marginal-value of that volume — the first sets are worth the most.
 */
export function mountWeekly(root: HTMLElement, nav: Nav): Cleanup {
  const sessions = loadSessions();
  const volumes = weeklyMuscleVolume(sessions);
  const trainedThisWeek = volumes.filter((v) => v.sets > 0).length;

  const header = h("section", { class: "card" }, [
    h("p", { class: "eyebrow", text: "Last 7 days" }),
    h("h2", { class: "section-title", text: "Weekly volume" }),
    h("p", {
      class: "plan-meta",
      text: "Hard sets per muscle over the last 7 days — the dose that drives growth. Most muscle is built around 10–20 sets a week; returns diminish past ~20, and sets stopped well short of failure count as less.",
    }),
  ]);

  if (sessions.length === 0) {
    root.appendChild(
      h("div", { class: "view view-weekly" }, [
        header,
        h("section", { class: "card" }, [
          h("p", {
            class: "empty",
            text: "No sessions logged yet — train a live session and your weekly volume fills in here.",
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

  const note =
    trainedThisWeek === 0
      ? "Nothing logged in the last 7 days — start a session to build this week's volume."
      : `${trainedThisWeek} muscle ${trainedThisWeek === 1 ? "group" : "groups"} trained this week.`;

  const listCard = h("section", { class: "card" }, [
    h("p", { class: "eyebrow", text: "By muscle" }),
    h("h2", { class: "section-title", text: "Sets this week" }),
    h("p", { class: "plan-meta", text: note }),
    h("div", { class: "summary-muscles" }, volumes.map(volumeRow)),
  ]);

  const legend = h("section", { class: "card" }, [
    h("p", {
      class: "plan-meta",
      text: `Sets · muscle · week — under ${WEEKLY_MAINTENANCE_SETS}: under-dosed · ${WEEKLY_MAINTENANCE_SETS}–${WEEKLY_PRODUCTIVE_MIN}: maintenance · ${WEEKLY_PRODUCTIVE_MIN}–${WEEKLY_PRODUCTIVE_MAX}: productive · over ${WEEKLY_PRODUCTIVE_MAX}: diminishing returns. A set near failure counts as one; sets left well short count as a fraction.`,
    }),
    h("div", { class: "btn-row" }, [
      h("button", { class: "btn", text: "← Stats", on: { click: () => nav.go("stats") } }),
      h("button", { class: "btn", text: "Recovery", on: { click: () => nav.go("recovery") } }),
    ]),
  ]);

  root.appendChild(h("div", { class: "view view-weekly" }, [header, listCard, legend]));
  return () => {};
}
