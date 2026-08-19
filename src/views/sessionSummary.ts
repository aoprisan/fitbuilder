import { type SessionAdherence, sessionAdherence } from "../benchmark";
import { latestBodyweight } from "../bodyweightStore";
import { h } from "../dom";
import {
  estimateCalories,
  estimateProteinG,
  muscleBreakdown,
  readEffort,
  readHydration,
} from "../effort";
import { registerTranslations, t } from "../i18n";
import { MUSCLE_LABELS, type TrainingSession } from "../types";
import { formatClock, sessionSetCount } from "../util";

registerTranslations({
  "{0}% of your usual session": "{0}% din sesiunea ta obișnuită",
  "Building your baseline — fills toward a full session":
    "Se construiește baza — se umple spre o sesiune completă",
  glass: "pahar",
  glasses: "pahare",
  Bodyweight: "Greutate corporală",
  "Session effort": "Efort sesiune",
  "Muscles worked": "Mușchi lucrați",
  Hydration: "Hidratare",
  "Protein to recover": "Proteine pentru recuperare",
  "Energy burned": "Energie consumată",
  "Adherence to plan": "Aderență la plan",
  "{0}% to plan": "{0}% din plan",
  reps: "repetări",
});

/**
 * Group consecutive items by their (optional) `section`, preserving order — the
 * one place the "emit a phase header when the section changes" logic lives, so
 * the logged list and the adherence panel stay in sync.
 */
export function bySectionRuns<T extends { section?: string }>(
  items: readonly T[],
): { section: string; items: T[] }[] {
  const runs: { section: string; items: T[] }[] = [];
  for (const it of items) {
    const section = it.section ?? "";
    const last = runs[runs.length - 1];
    if (last && last.section === section) last.items.push(it);
    else runs.push({ section, items: [it] });
  }
  return runs;
}

/** Session "adherence to plan" panel — overall % bar + per-exercise prescribed-vs-done. */
function renderAdherence(a: SessionAdherence): HTMLElement {
  const pct = Math.min(100, a.pct);
  const fill = h("div", { class: "effort-bar-fill" });
  fill.style.width = `${pct}%`;
  // Per-exercise rows, with a phase sub-header inserted whenever the section
  // changes — so a followed structured session reads Warm-up / Main / … in order.
  const rows: HTMLElement[] = [];
  bySectionRuns(a.rows).forEach((run) => {
    if (run.section !== "") {
      rows.push(h("p", { class: "live-section-label", text: run.section }));
    }
    run.items.forEach((r) => {
      const bm = r.benchmark;
      const stat =
        bm.targetLoadKg !== null
          ? `${bm.doneReps}/${bm.prescribedReps} ${t("reps")} · ${bm.loggedLoadKg ?? 0}/${bm.targetLoadKg} kg`
          : `${bm.doneReps}/${bm.prescribedReps} ${t("reps")}`;
      rows.push(
        h("div", { class: "muscle-row" }, [
          h("span", { class: "muscle-name", text: r.name }),
          h("span", { class: "muscle-stat", text: stat }),
        ]),
      );
    });
  });
  return h("div", { class: "summary-adherence" }, [
    h("div", { class: "adherence-head" }, [
      h("span", { class: "summary-label", text: t("Adherence to plan") }),
      h("span", { class: "adherence-pct", text: t("{0}% to plan").replace("{0}", String(a.pct)) }),
    ]),
    h(
      "div",
      {
        class: "effort-bar",
        role: "progressbar",
        aria: { valuemin: "0", valuemax: "100", valuenow: String(pct), label: t("Adherence to plan") },
      },
      [fill],
    ),
    ...rows,
  ]);
}

/**
 * Effort gauge, hydration cue, per-muscle work (volume + time) and a recovery
 * protein estimate for a session — running or completed. The effort gauge is
 * calibrated against the user's other sessions in `allSessions`. Returns null
 * until the session has at least one logged set.
 */
export function renderSessionSummary(
  session: TrainingSession,
  allSessions: TrainingSession[],
): HTMLElement | null {
  if (sessionSetCount(session) === 0) return null;

  const effort = readEffort(session, allSessions);
  const hydration = readHydration(effort);
  const muscles = muscleBreakdown(session);
  const adherence = sessionAdherence(session);
  const bodyweight = latestBodyweight()?.kg;
  const protein = estimateProteinG(effort, muscles.length, bodyweight);
  const calories = estimateCalories(effort, bodyweight);
  const pct = Math.round(Math.min(1, effort.ratio) * 100);

  const fill = h("div", { class: "effort-bar-fill" });
  fill.style.width = `${Math.min(1, effort.ratio) * 100}%`;

  const meta =
    effort.vsTypicalPct !== null
      ? t("{0}% of your usual session").replace("{0}", String(effort.vsTypicalPct))
      : t("Building your baseline — fills toward a full session");

  const glasses = `${hydration.glasses} ${hydration.glasses === 1 ? t("glass") : t("glasses")}`;

  const muscleRows = muscles.map((m) =>
    h("div", { class: "muscle-row" }, [
      h("span", { class: "muscle-name", text: t(MUSCLE_LABELS[m.muscle]) }),
      h("span", {
        class: "muscle-stat",
        text:
          m.muscle === "cardio"
            ? formatClock(m.timeSec)
            : `${m.volume > 0 ? `${m.volume} kg` : t("Bodyweight")} · ${formatClock(m.timeSec)}`,
      }),
    ]),
  );

  return h("section", { class: "card live-effort", dataset: { tier: effort.tier } }, [
    h("div", { class: "effort-head" }, [
      h("span", { class: "effort-eyebrow", text: t("Session effort") }),
      h("span", { class: "effort-tier", text: effort.label }),
    ]),
    h(
      "div",
      {
        class: "effort-bar",
        role: "progressbar",
        aria: { valuemin: "0", valuemax: "100", valuenow: String(pct), label: t("Session effort") },
      },
      [fill],
    ),
    h("p", { class: "effort-meta", text: meta }),
    ...(adherence ? [renderAdherence(adherence)] : []),
    h("div", { class: "summary-muscles" }, [
      h("span", { class: "summary-label", text: t("Muscles worked") }),
      ...muscleRows,
    ]),
    h("div", { class: "hydration-row" }, [
      h("span", { class: "hydration-label", text: t("Hydration") }),
      h("span", {
        class: "hydration-figure",
        text: `≈ ${hydration.liters.toFixed(1)} L · ${glasses}`,
      }),
    ]),
    h("p", { class: "hydration-note", text: hydration.note }),
    h("div", { class: "protein-row" }, [
      h("span", { class: "protein-label", text: t("Protein to recover") }),
      h("span", { class: "protein-figure", text: `≈ ${protein} g` }),
    ]),
    h("div", { class: "calories-row" }, [
      h("span", { class: "calories-label", text: t("Energy burned") }),
      h("span", { class: "calories-figure", text: `≈ ${calories} kcal` }),
    ]),
  ]);
}
