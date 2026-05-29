import { h } from "../dom";
import { registerTranslations, t } from "../i18n";
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

registerTranslations({
  "Not trained": "Neantrenat",
  "Below maintenance": "Sub întreținere",
  Maintenance: "Întreținere",
  Productive: "Productiv",
  "High volume": "Volum ridicat",
  set: "serie",
  sets: "serii",
  "{0} {1}": "{0} {1}",
  "{0} · ≈{1}% of attainable stimulus": "{0} · ≈{1}% din stimulul realizabil",
  "Not trained this week": "Neantrenat săptămâna aceasta",
  "Last 7 days": "Ultimele 7 zile",
  "Weekly volume": "Volum săptămânal",
  "Hard sets per muscle over the last 7 days — the dose that drives growth. Most muscle is built around 10–20 sets a week; returns diminish past ~20, and sets stopped well short of failure count as less.":
    "Serii grele pe mușchi în ultimele 7 zile — doza care stimulează creșterea. Cei mai mulți mușchi se construiesc în jur de 10–20 serii pe săptămână; randamentul scade peste ~20, iar seriile oprite cu mult înainte de epuizare contează mai puțin.",
  "No sessions logged yet — train a live session and your weekly volume fills in here.":
    "Niciun antrenament înregistrat încă — fă un antrenament Live și volumul tău săptămânal se va completa aici.",
  "Start Live Session": "Pornește Antrenament Live",
  "Nothing logged in the last 7 days — start a session to build this week's volume.":
    "Nimic înregistrat în ultimele 7 zile — pornește un antrenament pentru a construi volumul săptămânii.",
  "{0} muscle group trained this week.": "{0} grup muscular antrenat săptămâna aceasta.",
  "{0} muscle groups trained this week.": "{0} grupuri musculare antrenate săptămâna aceasta.",
  "By muscle": "Pe mușchi",
  "Sets this week": "Serii săptămâna aceasta",
  "Sets · muscle · week — under {0}: under-dosed · {1}–{2}: maintenance · {3}–{4}: productive · over {5}: diminishing returns. A set near failure counts as one; sets left well short count as a fraction.":
    "Serii · mușchi · săptămână — sub {0}: sub-dozat · {1}–{2}: întreținere · {3}–{4}: productiv · peste {5}: randament în scădere. O serie aproape de epuizare contează ca una; seriile oprite mult înainte contează ca o fracțiune.",
  "← Stats": "← Statistici",
  Recovery: "Recuperare",
});

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
    text: t("{0} {1}")
      .replace("{0}", String(v.sets))
      .replace("{1}", v.sets === 1 ? t("set") : t("sets")),
  });
  stat.style.color = color;

  const detail =
    v.sets > 0
      ? t("{0} · ≈{1}% of attainable stimulus")
          .replace("{0}", t(BAND_LABEL[v.band]))
          .replace("{1}", String(Math.round(v.stimulus * 100)))
      : t("Not trained this week");

  return h("div", { class: "muscle-effort" }, [
    h("div", { class: "muscle-row" }, [
      h("span", { class: "muscle-name", text: t(MUSCLE_LABELS[v.muscle]) }),
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
    h("p", { class: "eyebrow", text: t("Last 7 days") }),
    h("h2", { class: "section-title", text: t("Weekly volume") }),
    h("p", {
      class: "plan-meta",
      text: t("Hard sets per muscle over the last 7 days — the dose that drives growth. Most muscle is built around 10–20 sets a week; returns diminish past ~20, and sets stopped well short of failure count as less."),
    }),
  ]);

  if (sessions.length === 0) {
    root.appendChild(
      h("div", { class: "view view-weekly" }, [
        header,
        h("section", { class: "card" }, [
          h("p", {
            class: "empty",
            text: t("No sessions logged yet — train a live session and your weekly volume fills in here."),
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

  const note =
    trainedThisWeek === 0
      ? t("Nothing logged in the last 7 days — start a session to build this week's volume.")
      : (trainedThisWeek === 1
          ? t("{0} muscle group trained this week.")
          : t("{0} muscle groups trained this week.")
        ).replace("{0}", String(trainedThisWeek));

  const listCard = h("section", { class: "card" }, [
    h("p", { class: "eyebrow", text: t("By muscle") }),
    h("h2", { class: "section-title", text: t("Sets this week") }),
    h("p", { class: "plan-meta", text: note }),
    h("div", { class: "summary-muscles" }, volumes.map(volumeRow)),
  ]);

  const legend = h("section", { class: "card" }, [
    h("p", {
      class: "plan-meta",
      text: t("Sets · muscle · week — under {0}: under-dosed · {1}–{2}: maintenance · {3}–{4}: productive · over {5}: diminishing returns. A set near failure counts as one; sets left well short count as a fraction.")
        .replace("{0}", String(WEEKLY_MAINTENANCE_SETS))
        .replace("{1}", String(WEEKLY_MAINTENANCE_SETS))
        .replace("{2}", String(WEEKLY_PRODUCTIVE_MIN))
        .replace("{3}", String(WEEKLY_PRODUCTIVE_MIN))
        .replace("{4}", String(WEEKLY_PRODUCTIVE_MAX))
        .replace("{5}", String(WEEKLY_PRODUCTIVE_MAX)),
    }),
    h("div", { class: "btn-row" }, [
      h("button", { class: "btn", text: t("← Stats"), on: { click: () => nav.go("stats") } }),
      h("button", { class: "btn", text: t("Recovery"), on: { click: () => nav.go("recovery") } }),
    ]),
  ]);

  root.appendChild(h("div", { class: "view view-weekly" }, [header, listCard, legend]));
  return () => {};
}
