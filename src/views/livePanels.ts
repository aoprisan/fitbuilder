import type { ExerciseBenchmark, SetComparison } from "../benchmark";
import { h } from "../dom";
import { isIsometricHold } from "../movements";
import { suggestOverload } from "../overload";
import type { PrHit } from "../records";
import { type MuscleRecovery, recoveryColor } from "../recovery";
import { exerciseKey, type ExerciseKey } from "../stats";
import {
  FATIGUE_LABELS,
  isBodyweight,
  isCardio,
  MUSCLE_LABELS,
  type Equipment,
  type LoggedExercise,
  type MuscleGroup,
  type SetTarget,
  type SetType,
  type TrainingSession,
  type WorkSet,
} from "../types";
import {
  formatCardioSet,
  formatClock,
  formatLoad,
  formatSessionDate,
  round2,
} from "../util";
import {
  type Expectation,
  expectedLoad,
  expectedReps,
  expectedRepsCurve,
  plotLoadRange,
  fatigueCostPct,
  type FatigueSource,
} from "../expectation";
import { t } from "../i18n";

/* =============================================================================
   Live logger panels — the pure, self-contained render helpers the Train screen
   (views/live.ts) composes: plan benchmark rows, the recovery caution, last-time
   recall, the overload nudge, the fatigue-adjusted expectation chart and bar,
   and the PR flash. None of them touch the live flow's state; strings are
   registered with the rest of the Train screen's in views/live.ts.
   ========================================================================== */

export const SVG_NS = "http://www.w3.org/2000/svg";
// Pulled in from the rim so the thicker ring stroke clears the gauge ticks.
export const DIAL_R = 49;
export const DIAL_C = 2 * Math.PI * DIAL_R;

export function svgEl(tag: string, attrs: Record<string, string>): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

/** Total reps logged across an exercise's sets — used for the routine target tally. */
export function sumReps(sets: readonly WorkSet[]): number {
  return sets.reduce((a, s) => a + s.reps, 0);
}

/**
 * Reps tally (done / target) + progress bar — shared by the structured benchmark
 * and the free-text prescription fallback so both read identically.
 */
export function repTally(done: number, target: number): HTMLElement[] {
  const pct = target > 0 ? Math.round(Math.min(1, done / target) * 100) : 0;
  const fill = h("div", { class: "progress-fill" });
  fill.style.width = `${pct}%`;
  return [
    h("p", { class: "now-tally" }, [
      h("span", { class: "tally-done", text: String(done) }),
      h("span", { class: "tally-sep", text: "/" }),
      h("span", { class: "tally-target", text: String(target) }),
      h("span", { class: "tally-unit", text: t("reps") }),
    ]),
    h(
      "div",
      {
        class: "progress now-progress",
        role: "progressbar",
        aria: { valuemin: "0", valuemax: "100", valuenow: String(pct), label: t("Target progress") },
      },
      [fill],
    ),
  ];
}

/** A prescribed set as "10 @ 20 kg" (or "10 reps" when bodyweight / no load). */
export function fmtPlanSet(st: SetTarget): string {
  return st.loadKg !== undefined && st.loadKg > 0
    ? `${st.reps} @ ${round2(st.loadKg)} kg`
    : `${st.reps} ${t("reps")}`;
}

/** A logged set as "11 @ 22.5 kg" (load via formatLoad so bodyweight reads right). */
export function fmtLoggedSet(equipment: Equipment, s: WorkSet): string {
  if (isBodyweight(equipment) && s.weightKg === 0) return `${s.reps} ${t("reps")}`;
  return `${s.reps} @ ${formatLoad(equipment, s.weightKg)}`;
}

/** A logged isometric hold as "0:45" (plus added load when weighted). */
export function fmtHoldSet(equipment: Equipment, s: WorkSet): string {
  const time = formatClock(s.durationSec ?? 0);
  return s.weightKg > 0 ? `${time} · ${formatLoad(equipment, s.weightKg)}` : time;
}

/**
 * One prescribed-vs-logged row of the per-set benchmark: the planned set, an
 * arrow, what was logged, and a signed reps/load delta tinted by whether the set
 * hit (or beat) the prescription. `data-state` distinguishes done / pending (not
 * logged yet) / extra (an off-plan set beyond the prescribed count).
 */
export function renderBenchRow(equipment: Equipment, c: SetComparison): HTMLElement {
  const planText = c.target ? fmtPlanSet(c.target) : t("off-plan");
  const doneText = c.logged ? fmtLoggedSet(equipment, c.logged) : t("not logged");

  let state: "done" | "pending" | "extra" = c.logged ? (c.target ? "done" : "extra") : "pending";
  let deltaEl: HTMLElement | null = null;
  let aria = "";

  if (c.target && c.logged) {
    const repsD = c.logged.reps - c.target.reps;
    const loadD =
      c.target.loadKg !== undefined ? round2(c.logged.weightKg - c.target.loadKg) : null;
    const ok = repsD >= 0 && (loadD === null || loadD >= 0);
    const parts: string[] = [repsD === 0 ? "±0" : repsD > 0 ? `+${repsD}` : String(repsD)];
    if (loadD !== null && loadD !== 0) parts.push(`${loadD > 0 ? "+" : ""}${loadD} kg`);
    const allOnPlan = repsD === 0 && (loadD === null || loadD === 0);
    deltaEl = h("span", {
      class: "bench-delta",
      dataset: { ok: String(ok) },
      text: allOnPlan ? t("On plan") : parts.join(" · "),
    });
    aria = t("set {0} — planned {1}, logged {2}")
      .replace("{0}", String(c.index + 1))
      .replace("{1}", planText)
      .replace("{2}", doneText);
  } else if (c.target) {
    aria = t("set {0} — planned {1}, not logged yet")
      .replace("{0}", String(c.index + 1))
      .replace("{1}", planText);
  } else {
    aria = t("set {0} — off-plan, logged {1}")
      .replace("{0}", String(c.index + 1))
      .replace("{1}", doneText);
  }

  return h("div", { class: "bench-set", dataset: { state }, aria: { label: aria } }, [
    h("span", { class: "set-no", text: String(c.index + 1) }),
    h("span", { class: "bench-plan", text: planText }),
    h("span", { class: "bench-arrow", text: "→", aria: { hidden: "true" } }),
    h("span", { class: "bench-done", text: doneText }),
    ...(deltaEl ? [deltaEl] : []),
  ]);
}

/**
 * The plan benchmark for the exercise being logged: the trainer's guideline
 * label, a reps tally + progress bar toward the prescribed total, and (for a
 * per-set scheme) the prescribed-vs-logged set list. Replaces the free-text
 * tally for routine-loaded exercises; freestyle rows have no benchmark.
 */
export function renderBenchmark(ex: LoggedExercise, bm: ExerciseBenchmark): HTMLElement {
  const children: HTMLElement[] = [
    h("p", { class: "now-eyebrow", text: t("Plan") }),
    h("p", { class: "now-target", text: bm.label }),
    ...repTally(bm.doneReps, bm.prescribedReps),
  ];
  if (bm.kind === "sets" && bm.sets.length > 0) {
    children.push(h("div", { class: "bench-sets" }, bm.sets.map((c) => renderBenchRow(ex.equipment, c))));
  }
  return h("section", { class: "card live-bench" }, children);
}

/** Reps-in-reserve chips shown when logging a set. "4+" stores 4 (fresh — minimal stimulus).
 *  Labels are English keys; render them through t() (this runs before the
 *  views register their translations). */
export const RIR_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 0, label: "Failure" },
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: "4+" },
];

/** Warm-up / drop-set chips shown when logging a set; untagged = working set. Labels go through t(). */
export const SET_TYPE_OPTIONS: ReadonlyArray<{ value: SetType; label: string }> = [
  { value: "warmup", label: "Warm-up" },
  { value: "dropset", label: "Drop set" },
];

// A target muscle below this readiness (0..1, from prior sessions) is flagged
// before you train it again; below the severe mark it's a strong warning.
export const RECOVERY_WARN_BELOW = 0.6;
export const RECOVERY_WARN_SEVERE = 0.35;

/** Movements offered on the ring picker's inner "Recent" ring — the innermost
 *  arc is the shortest, so a wedge past this starts eating its own label. */
export const QUICK_PICK_RING = 6;

/** Ceiling on a timed set's recorded duration — anything longer is a forgotten Stop. */
export const MAX_SET_MIN = 15;
export const MAX_CARDIO_SET_MIN = 180;

/**
 * Pre-training caution for the muscles a movement works that haven't recovered
 * from *earlier* sessions yet — the most direct guard against hammering a still-
 * fatigued muscle (injury / overtraining risk). The active session is excluded
 * from the readiness so doing a second exercise for the same muscle within one
 * workout doesn't false-alarm. Returns null when every target muscle is ready.
 */
export function renderRecoveryWarning(
  muscles: readonly MuscleGroup[],
  recByMuscle: ReadonlyMap<MuscleGroup, MuscleRecovery>,
): HTMLElement | null {
  const flagged = muscles
    .map((m) => recByMuscle.get(m))
    .filter((r): r is MuscleRecovery => r !== undefined && r.recovered < RECOVERY_WARN_BELOW)
    .sort((a, b) => a.recovered - b.recovered);
  if (flagged.length === 0) return null;

  const severe = flagged[0]!.recovered < RECOVERY_WARN_SEVERE;
  const rows = flagged.map((r) => {
    const span = h("span", {
      class: "recovery-warn-muscle",
      text: t("{0} · {1}% · ~{2}h to go")
        .replace("{0}", t(MUSCLE_LABELS[r.muscle]))
        .replace("{1}", String(Math.round(r.recovered * 100)))
        .replace("{2}", String(r.hoursRemaining)),
    });
    span.style.color = recoveryColor(r.recovered);
    return h("div", { class: "recovery-warn-row" }, [span]);
  });

  return h(
    "section",
    { class: "card live-recovery-warn", dataset: { severity: severe ? "high" : "med" } },
    [
      h("p", {
        class: "recovery-warn-head",
        text: severe
          ? t("⚠ Still fatigued — consider resting these")
          : t("Heads up — not fully recovered"),
      }),
      ...rows,
      h("p", {
        class: "recovery-warn-note",
        text: t(
          "Training a muscle hard before it recovers raises injury and overtraining risk — go lighter or pick another muscle.",
        ),
      }),
    ],
  );
}

/**
 * The most recent *prior* logged instance of an exercise key, with the date of
 * the session it came from — the data behind the "last time" recall on the
 * select screen. Sessions are scanned for the latest one carrying a logged set
 * for this exact movement; returns null when it's never been trained before.
 */
export function lastPerformance(
  sessions: readonly TrainingSession[],
  key: ExerciseKey,
): { date: string; exercise: LoggedExercise } | null {
  let best: { date: string; exercise: LoggedExercise } | null = null;
  for (const s of sessions) {
    for (const ex of s.exercises) {
      if (ex.sets.length === 0 || exerciseKey(ex) !== key) continue;
      if (!best || s.startedAt.localeCompare(best.date) > 0) {
        best = { date: s.startedAt, exercise: ex };
      }
    }
  }
  return best;
}

/**
 * "Last time" recall for the movement about to be picked: the most recent prior
 * session's logged sets (reps × load, or the cardio bout) so you walk up to the
 * rack already knowing what you did — and what to beat. The active session is
 * excluded by the caller, so this always reads as a true reference point rather
 * than what was just logged this workout.
 */
export function renderLastPerformance(date: string, ex: LoggedExercise): HTMLElement {
  const cardio = isCardio(ex.equipment);
  const hold = isIsometricHold(ex.exerciseId);
  const setText = ex.sets
    .map((s) =>
      cardio ? formatCardioSet(s) : hold ? fmtHoldSet(ex.equipment, s) : fmtLoggedSet(ex.equipment, s),
    )
    .join("   ");
  return h("section", { class: "card live-last" }, [
    h("p", {
      class: "now-eyebrow",
      text: t("Last time · {0}").replace("{0}", formatSessionDate(date)),
    }),
    h("p", { class: "typical-last-sets", text: setText }),
  ]);
}

/**
 * Progressive-overload nudge for the movement about to be trained: double
 * progression over its logged history (add a rep at the same load; add the
 * smallest plate once the rep window tops out). Shown beside the last-time
 * recall when the call is to move something up — a "hold" (consolidate) read
 * stays quiet, and routine-prescribed exercises defer to the trainer's plan.
 */
export function renderOverloadHint(
  sessions: readonly TrainingSession[],
  key: ExerciseKey,
  equipment: Equipment,
): HTMLElement | null {
  const sug = suggestOverload(sessions, key, equipment);
  if (!sug || sug.kind === "hold") return null;
  const target =
    isBodyweight(equipment) && sug.weightKg === 0
      ? `${sug.reps} ${t("reps")}`
      : `${sug.reps} @ ${formatLoad(equipment, sug.weightKg)}`;
  const note =
    sug.kind === "load"
      ? t("+{0} kg — you owned this load last time, move it up.").replace("{0}", String(sug.deltaKg))
      : t("+{0} rep — same load, beat last time by one.").replace("{0}", String(sug.deltaReps));
  return h("section", { class: "card live-overload" }, [
    h("p", { class: "now-eyebrow", text: t("Next step") }),
    h("p", { class: "now-target", text: t("Try {0}").replace("{0}", target) }),
    h("p", { class: "plan-meta", text: note }),
  ]);
}

// Below this fatigue cost the "fresh you" comparison is noise and stays hidden.
export const EXPECT_SHOW_FRESH_PCT = 3;

/** One human line for a contributor to the pre-fatigue on a movement. */
export function fatigueSourceLine(src: FatigueSource): string {
  switch (src.kind) {
    case "exercise":
      return t("{0} · {1} sets earlier").replace("{0}", src.label).replace("{1}", String(src.sets ?? 0));
    case "residual":
      return t("{0} · {1}% unrecovered")
        .replace("{0}", t(MUSCLE_LABELS[src.label as MuscleGroup]))
        .replace("{1}", String(Math.round((src.unrecovered ?? 0) * 100)));
    case "systemic":
      return t("Session load · {0} sets").replace("{0}", String(src.sets ?? 0));
    case "start":
      return t("Started the session: {0}").replace(
        "{0}",
        t(FATIGUE_LABELS[Number(src.label) as keyof typeof FATIGUE_LABELS]),
      );
  }
}

// One colour per fatigue source in the strength bar and its legend, biggest first.
export const EXPECT_SOURCE_COLORS = ["var(--signal)", "var(--mustard)", "var(--rust)", "var(--plum)"];
export const EXPECT_MAX_SOURCES = EXPECT_SOURCE_COLORS.length;

/**
 * Strength bar — fresh capacity as a full-width tank: what's still available now
 * fills it from the left, and the part fatigue has eaten is split into one
 * coloured segment per source, sized by its share of the pre-fatigue. So "6
 * sets of bench took most of it" reads at a glance.
 */
export function renderStrengthBar(exp: Expectation, sources: readonly FatigueSource[]): HTMLElement {
  const nowPct = exp.fatigue.factor * 100;
  const lost = 100 - nowPct;
  const total = exp.fatigue.load || 1;
  const segs: HTMLElement[] = [h("span", { class: "expect-bar-now" })];
  segs[0]!.style.width = `${nowPct}%`;
  let shown = 0;
  sources.forEach((src, i) => {
    const w = (lost * src.load) / total;
    shown += w;
    const seg = h("span", { class: "expect-bar-seg" });
    seg.style.width = `${w}%`;
    seg.style.background = EXPECT_SOURCE_COLORS[i] ?? "var(--ink-faint)";
    segs.push(seg);
  });
  // Minor sources not listed in the legend share one neutral sliver.
  if (lost - shown > 0.2) {
    const rest = h("span", { class: "expect-bar-seg" });
    rest.style.width = `${lost - shown}%`;
    rest.style.background = "var(--ink-faint)";
    segs.push(rest);
  }
  const pct = Math.round(nowPct);
  return h("div", { class: "expect-bar-wrap" }, [
    h(
      "div",
      {
        class: "expect-bar",
        role: "img",
        aria: { label: t("Strength available now: {0}% of fresh").replace("{0}", String(pct)) },
      },
      segs,
    ),
    h("p", { class: "expect-bar-label", text: t("Now {0}%").replace("{0}", String(pct)) }),
  ]);
}

// Reps-vs-load chart geometry (viewBox units; CSS scales it to the card).
export const EC_W = 320;
export const EC_H = 130;
export const EC_PAD_L = 26;
export const EC_PAD_R = 10;
export const EC_PAD_T = 10;
export const EC_PAD_B = 20;
export const EC_STEPS = 32;

/**
 * Reps-you-can-expect across loads: the fresh curve (dashed) above the curve
 * for right now (solid), with the gap between them shaded — that band *is* the
 * fatigue. A marker rides the load being considered (the dial on the exercise
 * screen), with a dot on each curve. Returns null when there's no sensible load
 * range to plot.
 */
export function renderExpectChart(
  exp: Expectation,
): { el: HTMLElement; mark: (weightKg: number) => void } | null {
  const range = plotLoadRange(exp);
  if (!range) return null;
  const { lo, hi } = range;
  const yMax = Math.max(5, Math.ceil(expectedRepsCurve(exp, lo).fresh / 5) * 5);
  const plotW = EC_W - EC_PAD_L - EC_PAD_R;
  const plotH = EC_H - EC_PAD_T - EC_PAD_B;
  const xAt = (kg: number): number => EC_PAD_L + ((kg - lo) / (hi - lo)) * plotW;
  const yAt = (reps: number): number => EC_PAD_T + (1 - Math.min(reps, yMax) / yMax) * plotH;

  const fresh: string[] = [];
  const now: string[] = [];
  for (let i = 0; i <= EC_STEPS; i++) {
    const kg = lo + ((hi - lo) * i) / EC_STEPS;
    const r = expectedRepsCurve(exp, kg);
    fresh.push(`${xAt(kg).toFixed(1)},${yAt(r.fresh).toFixed(1)}`);
    now.push(`${xAt(kg).toFixed(1)},${yAt(r.now).toFixed(1)}`);
  }

  const svg = svgEl("svg", {
    class: "expect-chart-svg",
    viewBox: `0 0 ${EC_W} ${EC_H}`,
    role: "img",
    "aria-label": t("Expected reps by load, fresh vs now"),
  });
  const base = EC_PAD_T + plotH;
  svg.append(
    // Axes: baseline + left rule, with rep ticks at 0 / half / top.
    svgEl("line", { x1: String(EC_PAD_L), y1: String(base), x2: String(EC_W - EC_PAD_R), y2: String(base), class: "expect-axis" }),
    svgEl("line", { x1: String(EC_PAD_L), y1: String(EC_PAD_T), x2: String(EC_PAD_L), y2: String(base), class: "expect-axis" }),
    // The fatigue band between the two curves.
    svgEl("polygon", { points: [...fresh, ...[...now].reverse()].join(" "), class: "expect-gap" }),
    svgEl("polyline", { points: fresh.join(" "), class: "expect-fresh" }),
    svgEl("polyline", { points: now.join(" "), class: "expect-now" }),
  );
  for (const v of [0, yMax / 2, yMax]) {
    const tick = svgEl("text", { x: String(EC_PAD_L - 4), y: String(yAt(v) + 3), class: "expect-tick", "text-anchor": "end" });
    tick.textContent = String(Math.round(v));
    svg.append(tick);
  }
  const loadLabel = (kg: number, x: number, anchor: string): void => {
    const el = svgEl("text", { x: String(x), y: String(EC_H - 5), class: "expect-tick", "text-anchor": anchor });
    el.textContent = formatLoad(exp.equipment, Math.round(kg));
    svg.append(el);
  };
  loadLabel(lo, EC_PAD_L, "start");
  loadLabel(hi, EC_W - EC_PAD_R, "end");

  // The marker: a vertical rule at the load in question, a dot on each curve and
  // the expected-reps-now readout beside it.
  const markLine = svgEl("line", { y1: String(EC_PAD_T), y2: String(base), class: "expect-mark" });
  const freshDot = svgEl("circle", { r: "3", class: "expect-dot-fresh" });
  const nowDot = svgEl("circle", { r: "4", class: "expect-dot-now" });
  const markText = svgEl("text", { class: "expect-mark-text" });
  const marker = svgEl("g", {});
  marker.append(markLine, freshDot, nowDot, markText);
  svg.append(marker);

  const mark = (weightKg: number): void => {
    const inRange = weightKg >= lo && weightKg <= hi;
    marker.setAttribute("visibility", inRange ? "visible" : "hidden");
    if (!inRange) return;
    const x = xAt(weightKg);
    const r = expectedRepsCurve(exp, weightKg);
    const rounded = expectedReps(exp, weightKg);
    for (const el of [markLine]) {
      el.setAttribute("x1", x.toFixed(1));
      el.setAttribute("x2", x.toFixed(1));
    }
    freshDot.setAttribute("cx", x.toFixed(1));
    freshDot.setAttribute("cy", yAt(r.fresh).toFixed(1));
    nowDot.setAttribute("cx", x.toFixed(1));
    nowDot.setAttribute("cy", yAt(r.now).toFixed(1));
    // Readout sits on the side with more room.
    const right = x < EC_PAD_L + plotW * 0.6;
    markText.setAttribute("x", (x + (right ? 7 : -7)).toFixed(1));
    markText.setAttribute("y", (yAt(r.now) - 6).toFixed(1));
    markText.setAttribute("text-anchor", right ? "start" : "end");
    markText.textContent = `${t("~{0} reps").replace("{0}", String(rounded.now))} · ${formatLoad(exp.equipment, weightKg)}`;
  };

  const legend = h("p", { class: "expect-legend" }, [
    h("span", { class: "expect-key expect-key-fresh", text: t("Fresh") }),
    h("span", { class: "expect-key expect-key-now", text: t("Now") }),
  ]);
  return { el: h("div", { class: "expect-chart" }, [svg as unknown as HTMLElement, legend]), mark };
}

/** Rep target the expectation card speaks to — last time's top working set, else 10. */
export function usualReps(last: LoggedExercise | null): number {
  let top: WorkSet | null = null;
  for (const s of last?.sets ?? []) {
    if (s.setType === "warmup" || s.reps <= 0) continue;
    if (!top || s.weightKg > top.weightKg || (s.weightKg === top.weightKg && s.reps > top.reps)) top = s;
  }
  return top?.reps ?? 10;
}

/**
 * Fatigue-adjusted expectation for the movement about to be (or being) trained:
 * what your history says you can do *right now*, after the work already done
 * this session and whatever earlier days left unrecovered — chest flies after
 * six sets of bench read very differently from flies as the opener. Headline is
 * the load expected for your usual rep count (or reps, on bare bodyweight), with
 * the fresh number beside it and the fatigue sources listed underneath.
 */
export function renderExpectation(
  exp: Expectation,
  reps: number,
  step: number,
): { el: HTMLElement; mark: (weightKg: number) => void } {
  const cost = fatigueCostPct(exp);
  const bodyweightOnly = isBodyweight(exp.equipment) && (expectedLoad(exp, reps, step) ?? 0) <= 0;
  const headline = (now: boolean): string => {
    if (bodyweightOnly) {
      const r = expectedReps(exp, 0);
      return t("~{0} reps").replace("{0}", String(now ? r.now : r.fresh));
    }
    const freshExp = { ...exp, nowE1rm: exp.freshE1rm };
    const kg = expectedLoad(now ? exp : freshExp, reps, step);
    if (kg === null) {
      return t("~{0} reps").replace("{0}", String(expectedReps(exp, 0)[now ? "now" : "fresh"]));
    }
    // The load is rounded down to a real plate step, which can leave a rep or
    // so in hand — quote the reps expected at *that* load, so the headline and
    // the chart's marker always agree.
    const at = expectedReps(exp, kg);
    return t("~{0} reps @ {1}")
      .replace("{0}", String(now ? at.now : at.fresh))
      .replace("{1}", formatLoad(exp.equipment, kg));
  };
  const basis = exp.basis === 0
    ? t("From today's sets")
    : (exp.usesToday ? t("From {0} past sessions + today's sets") : t("From {0} past sessions")).replace(
        "{0}",
        String(exp.basis),
      );
  const sources = exp.fatigue.sources.filter((src) => src.load >= 0.25).slice(0, EXPECT_MAX_SOURCES);
  const chart = renderExpectChart(exp);
  // Until a dial says otherwise, the marker sits on the headline's load.
  if (chart) chart.mark(bodyweightOnly ? 0 : (expectedLoad(exp, reps, step) ?? 0));
  const el = h(
    "section",
    { class: "card live-expect", dataset: { fatigue: cost >= 15 ? "high" : cost >= 6 ? "med" : "low" } },
    [
      h("p", {
        class: "now-eyebrow",
        text: cost > 0 ? t("Expected now · −{0}% fatigue").replace("{0}", String(cost)) : t("Expected now · fresh"),
      }),
      h("p", { class: "now-target", text: headline(true) }),
      ...(cost >= EXPECT_SHOW_FRESH_PCT
        ? [h("p", { class: "plan-meta", text: t("Fresh you: {0}").replace("{0}", headline(false)) })]
        : []),
      ...(cost > 0 ? [renderStrengthBar(exp, sources)] : []),
      ...(sources.length > 0
        ? [
            h(
              "ul",
              { class: "live-expect-sources" },
              sources.map((src, i) => {
                const sw = h("span", { class: "expect-swatch" });
                sw.style.background = EXPECT_SOURCE_COLORS[i] ?? "var(--ink-faint)";
                return h("li", {}, [sw, h("span", { text: fatigueSourceLine(src) })]);
              }),
            ),
          ]
        : []),
      ...(chart ? [chart.el] : []),
      h("p", { class: "live-expect-basis", text: basis }),
    ],
  );
  return { el, mark: chart?.mark ?? (() => {}) };
}

/** Celebration card for the records the just-logged set broke. */
export function renderPrFlash(hits: readonly PrHit[]): HTMLElement | null {
  if (hits.length === 0) return null;
  const line = (p: PrHit): string => {
    switch (p.kind) {
      case "weight":
        return t("Heaviest load yet — {0} kg (was {1})")
          .replace("{0}", String(p.value))
          .replace("{1}", String(p.previous));
      case "reps":
        return t("Most reps at this load — {0} (was {1})")
          .replace("{0}", String(p.value))
          .replace("{1}", String(p.previous));
      case "e1rm":
        return t("Best estimated 1RM — {0} kg (was {1})")
          .replace("{0}", String(p.value))
          .replace("{1}", String(p.previous));
    }
  };
  return h("section", { class: "card live-pr" }, [
    h("p", { class: "pr-head", text: `🏆 ${t("Personal record!")}` }),
    ...hits.map((p) => h("p", { class: "pr-line", text: line(p) })),
  ]);
}
