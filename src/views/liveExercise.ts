import { exerciseBenchmark, nextSetTarget } from "../benchmark";
import { clear, h } from "../dom";
import { parseTargetReps } from "../prescription";
import { loadSessions } from "../logStorage";
import { findMovement } from "../movements";
import { loadIncrementKg, suggestOverload } from "../overload";
import { platesPerSide, BAR_KG } from "../plates";
import {
  ensureNotifyPermission,
  loadRestAlertSec,
  REST_ALERT_OPTIONS,
  saveRestAlertSec,
} from "../restAlert";
import { priorSetsFor } from "../records";
import { epley1RM } from "../stats";
import { renderSessionSummary } from "./sessionSummary";
import { state } from "../state";
import {
  EQUIPMENT_LABELS,
  isBodyweight,
  isCardio,
  MUSCLE_LABELS,
} from "../types";
import {
  formatCardioSet,
  formatClock,
  formatLoad,
  round2,
} from "../util";
import { warmupRamp } from "../warmup";
import { expectedReps } from "../expectation";
import { dialField, type DialHandle } from "./dial";
import { t } from "../i18n";
import {
  DIAL_C,
  DIAL_R,
  fmtHoldSet,
  fmtLoggedSet,
  lastPerformance,
  renderBenchmark,
  renderExpectation,
  renderLastPerformance,
  renderOverloadHint,
  renderPrFlash,
  repTally,
  RIR_OPTIONS,
  SET_TYPE_OPTIONS,
  sumReps,
  svgEl,
  usualReps,
} from "./livePanels";
import type { LiveCtx } from "./liveState";

/* =============================================================================
   The exercise screen: the set state machine (idle → running → logging →
   resting) with its stopwatch, rest clock and alert, the reps × load dials and
   one-tap presets, RIR / warm-up tags, the logged-set list with inline edit,
   and the plan benchmark / expectation / PR read-outs.
   Rendered by views/live.ts through the shared LiveCtx.
   ========================================================================== */

// ─────────────────────────── Exercise screen ────────────────────────────────

export function renderSetList(ctx: LiveCtx): HTMLElement {
  const { st } = ctx;
  const sets = st.currentEx?.sets ?? [];
  const hold = ctx.holdActive();
  const host = h("div", { class: "live-set-list" });
  if (sets.length === 0) {
    host.appendChild(h("p", { class: "empty", text: t("No sets yet — hit “Start set”.") }));
    return host;
  }
  sets.forEach((s, i) => {
    // Inline editor for a previously-logged set: hold time + load for an
    // isometric hold, reps + load otherwise. Cardio bouts (distance/speed/
    // incline) aren't editable here.
    if (!isCardio(st.equipment) && st.editingSetIndex === i) {
      host.appendChild(
        h("div", { class: "live-set live-set-edit" }, [
          h("span", { class: "set-no", text: t("Set {0}").replace("{0}", String(i + 1)) }),
          h("div", { class: "live-set-edit-dials" }, [
            hold
              ? dialField({
                  label: t("Hold (sec)"),
                  value: st.editHoldSec,
                  step: 5,
                  min: 0,
                  integer: true,
                  unit: "sec",
                  tone: "signal",
                  onCommit: (n) => {
                    st.editHoldSec = n;
                  },
                })
              : dialField({
                  label: t("Reps"),
                  value: st.editReps,
                  step: 1,
                  min: 0,
                  integer: true,
                  unit: t("reps"),
                  tone: "signal",
                  onCommit: (n) => {
                    st.editReps = n;
                  },
                }),
            dialField({
              label: isBodyweight(st.equipment) ? t("Added (kg)") : t("Weight (kg)"),
              value: st.editWeight,
              step: loadIncrementKg(st.equipment),
              min: 0,
              integer: false,
              unit: "kg",
              tone: "navy",
              onCommit: (n) => {
                st.editWeight = n;
              },
            }),
          ]),
          // RIR only applies to strength (non-hold) sets, matching the logging flow.
          ...(hold ? [] : [renderEditRirField(ctx)]),
          h("div", { class: "btn-row live-set-edit-actions" }, [
            h("button", {
              class: "btn btn-primary btn-small",
              type: "button",
              text: t("✓ Save"),
              on: { click: ctx.saveEditSet },
            }),
            h("button", {
              class: "btn btn-small",
              type: "button",
              text: t("Cancel"),
              on: { click: ctx.cancelEditSet },
            }),
          ]),
        ]),
      );
      return;
    }
    const bits = isCardio(st.equipment)
      ? [formatCardioSet(s)]
      : hold
        ? [fmtHoldSet(st.equipment, s)]
        : [t("{0} reps").replace("{0}", String(s.reps)), formatLoad(st.equipment, s.weightKg)];
    if (!isCardio(st.equipment) && s.setType !== undefined)
      bits.unshift(s.setType === "warmup" ? t("warm-up") : t("drop set"));
    if (!isCardio(st.equipment) && !hold && s.rir !== undefined)
      bits.push(s.rir === 0 ? t("to failure") : t("RIR {0}").replace("{0}", String(s.rir)));
    // A hold's duration is already its primary read-out (fmtHoldSet), so only
    // the strength path appends the stopwatch time as an extra detail.
    if (!isCardio(st.equipment) && !hold && s.durationSec !== undefined)
      bits.push(formatClock(s.durationSec));
    host.appendChild(
      h("div", { class: "live-set" }, [
        h("span", { class: "set-no", text: t("Set {0}").replace("{0}", String(i + 1)) }),
        h("span", { class: "live-set-meta", text: bits.join(" · ") }),
        ...(isCardio(st.equipment)
          ? []
          : [
              h("button", {
                class: "icon-btn live-set-edit-btn",
                type: "button",
                text: "✎",
                aria: { label: t("edit set {0}").replace("{0}", String(i + 1)) },
                on: { click: () => ctx.startEditSet(i) },
              }),
            ]),
        h("button", {
          class: "icon-btn danger live-set-del",
          type: "button",
          text: "✕",
          aria: { label: t("delete set {0}").replace("{0}", String(i + 1)) },
          on: { click: () => ctx.deleteSet(i) },
        }),
      ]),
    );
  });
  return host;
}

/**
 * Optional reps-in-reserve selector for the set being logged; tapping the
 * active chip clears it. Repaints in place (not a full `render()`) so picking a
 * chip doesn't bounce the page back to the top mid-set.
 */
export function renderRirField(ctx: LiveCtx): HTMLElement {
  const { st } = ctx;
  const field = h("div", { class: "field rir-field" });
  const paint = (): void => {
    const hint =
      st.pendingRir === null
        ? t("Tap how many reps you had left — skip to leave intensity unweighted.")
        : st.pendingRir === 0
          ? t("To failure — counted as maximum intensity.")
          : (st.pendingRir === 1 ? t("{0} rep left in the tank.") : t("{0} reps left in the tank."))
              .replace("{0}", String(st.pendingRir));
    clear(field);
    field.append(
      h("span", { class: "field-label", text: t("Reps in reserve (optional)") }),
      h(
        "div",
        { class: "toggle rir-toggle", role: "group", aria: { label: t("Reps in reserve") } },
        RIR_OPTIONS.map((o) =>
          h("button", {
            class: st.pendingRir === o.value ? "toggle-btn active" : "toggle-btn",
            type: "button",
            text: o.label,
            aria: {
              pressed: String(st.pendingRir === o.value),
              label: o.value === 0 ? t("trained to failure") : t("{0} reps in reserve").replace("{0}", o.label),
            },
            on: {
              click: () => {
                st.pendingRir = st.pendingRir === o.value ? null : o.value;
                ctx.snapshot();
                paint();
              },
            },
          }),
        ),
      ),
      h("p", { class: "rir-hint", text: hint }),
    );
  };
  paint();
  return field;
}

/**
 * Reps-in-reserve selector for a previously-logged set, bound to `editRir`
 * (the in-flight edit value). Mirrors {@link renderRirField} but repaints the
 * whole editor via `render()` since it lives inside the inline edit card.
 */
export function renderEditRirField(ctx: LiveCtx): HTMLElement {
  const { st } = ctx;
  const field = h("div", { class: "field rir-field" });
  field.append(
    h("span", { class: "field-label", text: t("Reps in reserve (optional)") }),
    h(
      "div",
      { class: "toggle rir-toggle", role: "group", aria: { label: t("Reps in reserve") } },
      RIR_OPTIONS.map((o) =>
        h("button", {
          class: st.editRir === o.value ? "toggle-btn active" : "toggle-btn",
          type: "button",
          text: o.label,
          aria: {
            pressed: String(st.editRir === o.value),
            label: o.value === 0 ? t("trained to failure") : t("{0} reps in reserve").replace("{0}", o.label),
          },
          on: {
            click: () => {
              st.editRir = st.editRir === o.value ? null : o.value;
              ctx.render();
            },
          },
        }),
      ),
    ),
  );
  return field;
}

/**
 * One candidate reps × load pairing for the set being logged, labelled with
 * where the numbers come from (the plan, the set just done, last time, the
 * progression nudge).
 */
export interface SetPreset {
  label: string;
  reps: number;
  weightKg: number;
}

/**
 * The reps × load pairings worth a single tap once a set is done: every
 * reference {@link stopSet} seeds the dials from, laid out side by side so
 * "same as the last set", "what the plan asked for" and "the progression's
 * next step" are a tap rather than two spins of a knob. Deduped by value, so
 * a plan that happens to match last time shows once.
 */
export function setPresets(ctx: LiveCtx): SetPreset[] {
  const { st } = ctx;
  const sets = st.currentEx?.sets ?? [];
  const last = sets.length ? sets[sets.length - 1]! : null;
  const out: SetPreset[] = [];
  const add = (label: string, reps: number, weightKg: number): void => {
    if (reps <= 0) return;
    const kg = round2(Math.max(0, weightKg));
    if (out.some((p) => p.reps === reps && p.weightKg === kg)) return;
    out.push({ label, reps, weightKg: kg });
  };
  const planned = st.currentEx ? nextSetTarget(st.currentEx) : null;
  if (planned) add(t("Plan"), planned.reps, planned.loadKg ?? last?.weightKg ?? st.setWeight);
  if (last) add(t("Last set"), last.reps, last.weightKg);
  const ghost = ctx.historyGhost(sets.length);
  if (ghost) add(t("Last time"), ghost.reps, ghost.weightKg);
  // The progression nudge only speaks for freestyle work — a plan-carrying
  // exercise defers to the prescription (same rule as the overload hint).
  const planDriven = st.currentEx?.target !== undefined || st.currentEx?.prescription !== undefined;
  if (!planDriven) {
    const sug = suggestOverload(
      loadSessions().filter((o) => o.id !== state.activeLog?.id),
      ctx.currentKey(),
      st.equipment,
    );
    if (sug) add(t("Next step"), sug.reps, sug.weightKg);
  }
  return out;
}

/**
 * Quick-pick row above the dials: one chip per {@link setPresets} entry, each
 * loading *both* dials in a single tap. The chip matching what the dials read
 * is marked active, so the numbers on screen always say where they came from.
 * `paint` re-marks them as the dials turn; a pick never re-renders the screen
 * (that would re-anchor the scroll out from under the thumb).
 */
export function renderSetPresets(ctx: LiveCtx, 
  onPick: (p: SetPreset) => void,
): { el: HTMLElement; paint: () => void } | null {
  const { st } = ctx;
  const presets = setPresets(ctx);
  if (presets.length === 0) return null;
  const isActive = (p: SetPreset): boolean =>
    p.reps === st.setReps && p.weightKg === round2(st.setWeight);
  const chips = presets.map((p) =>
    h(
      "button",
      {
        class: "toggle-btn preset-btn",
        type: "button",
        aria: {
          pressed: String(isActive(p)),
          label: `${p.label} — ${fmtLoggedSet(st.equipment, { reps: p.reps, weightKg: p.weightKg })}`,
        },
        on: { click: () => onPick(p) },
      },
      [
        h("span", { class: "preset-src", text: p.label }),
        h("span", {
          class: "preset-val",
          text: fmtLoggedSet(st.equipment, { reps: p.reps, weightKg: p.weightKg }),
        }),
      ],
    ),
  );
  const paint = (): void => {
    presets.forEach((p, i) => {
      const chip = chips[i];
      if (!chip) return;
      const on = isActive(p);
      chip.classList.toggle("active", on);
      chip.setAttribute("aria-pressed", String(on));
    });
  };
  paint();
  return {
    el: h("section", { class: "card live-presets" }, [
      h("p", { class: "now-eyebrow", text: t("Log this set as") }),
      h(
        "div",
        {
          class: "toggle preset-toggle",
          role: "group",
          aria: { label: t("Quick reps and weight picks") },
        },
        chips,
      ),
    ]),
    paint,
  };
}

/**
 * Live read-out under the reps/weight dials: what the set currently dialled in
 * is worth (volume, estimated 1RM against the best on record) and how it
 * stacks up against the reference the dials were seeded from. Repainted as
 * the dials turn, so the number picked is a judgement against history rather
 * than memory — and a load on PR pace is visible *before* committing.
 */
export function renderSetPreview(ctx: LiveCtx): { el: HTMLElement; paint: () => void } {
  const { st } = ctx;
  const sets = st.currentEx?.sets ?? [];
  const last = sets.length ? sets[sets.length - 1]! : null;
  const ref = last ?? ctx.historyGhost(sets.length);
  const refLabel = last ? t("last set") : t("last time");
  // Best estimated 1RM on record for this movement: earlier sessions plus what
  // this exercise has already banked. Warm-ups don't set the bar.
  const bestE1rm = priorSetsFor(
    loadSessions().filter((o) => o.id !== state.activeLog?.id),
    ctx.currentKey(),
  )
    .concat(sets)
    .reduce((best, s) => (s.setType === "warmup" ? best : Math.max(best, epley1RM(s))), 0);
  const mainEl = h("p", { class: "set-preview-main" });
  const deltaEl = h("p", { class: "set-preview-delta" });
  // Fatigue-adjusted reps at whatever load is dialled in, repainted with it.
  const exp = ctx.expectationFor(st.muscle, st.equipment, st.movementId);
  const expectEl = h("p", { class: "set-preview-expect" });
  const signed = (n: number): string => (n > 0 ? `+${round2(n)}` : String(round2(n)));
  const paint = (): void => {
    const parts: string[] = [];
    if (st.setWeight > 0) {
      parts.push(t("{0} kg volume").replace("{0}", String(round2(st.setReps * st.setWeight))));
    }
    const e1rm = epley1RM({
      reps: st.setReps,
      weightKg: st.setWeight,
      ...(st.pendingRir !== null ? { rir: st.pendingRir } : {}),
    });
    if (e1rm > 0) parts.push(t("e1RM {0} kg").replace("{0}", String(Math.round(e1rm))));
    if (st.pendingSetType !== "warmup" && bestE1rm > 0 && e1rm > bestE1rm) {
      parts.push(`🏆 ${t("PR pace")}`);
    }
    mainEl.textContent = parts.join(" · ");
    mainEl.hidden = parts.length === 0;
    let delta = "";
    let tone = "";
    if (ref) {
      const dReps = st.setReps - ref.reps;
      const dKg = round2(st.setWeight - ref.weightKg);
      if (dReps === 0 && dKg === 0) {
        delta = t("Same as {0}").replace("{0}", refLabel);
      } else {
        const bits: string[] = [];
        if (dReps !== 0) {
          bits.push(
            (Math.abs(dReps) === 1 ? t("{0} rep") : t("{0} reps")).replace("{0}", signed(dReps)),
          );
        }
        if (dKg !== 0) bits.push(`${signed(dKg)} kg`);
        delta = t("{0} vs {1}").replace("{0}", bits.join(" · ")).replace("{1}", refLabel);
        tone = dKg > 0 || (dKg === 0 && dReps > 0) ? " is-up" : " is-down";
      }
    }
    deltaEl.textContent = delta;
    deltaEl.hidden = delta === "";
    deltaEl.className = `set-preview-delta${tone}`;
    let expect = "";
    if (exp && st.pendingSetType !== "warmup") {
      const r = expectedReps(exp, st.setWeight);
      expect =
        r.now === 0
          ? t("Too heavy for now — expect 0 reps")
          : r.fresh - r.now >= 1
            ? t("Expect ~{0} reps here (fresh {1})").replace("{0}", String(r.now)).replace("{1}", String(r.fresh))
            : t("Expect ~{0} reps here").replace("{0}", String(r.now));
      expectEl.classList.toggle("is-short", r.now > 0 && st.setReps > r.now);
    }
    expectEl.textContent = expect;
    expectEl.hidden = expect === "";
    st.markExpectLoad?.(st.setWeight);
  };
  paint();
  return { el: h("div", { class: "set-preview" }, [mainEl, expectEl, deltaEl]), paint };
}

/**
 * Warm-up ramp card — shown while an exercise has no working set logged yet
 * (so it survives the ramp itself). Steps derive from the day's working
 * weight: the trainer's prescribed load when the exercise carries one, else
 * the overload suggestion from history, else the seeded dial weight. Tapping
 * a step loads the dials and pre-tags the set as a warm-up.
 */
export function renderWarmupRamp(ctx: LiveCtx): HTMLElement | null {
  const { st } = ctx;
  if (isCardio(st.equipment) || ctx.holdActive()) return null;
  const sets = st.currentEx?.sets ?? [];
  if (sets.some((s) => s.setType !== "warmup")) return null;
  const planned = st.currentEx ? nextSetTarget(st.currentEx) : null;
  const others = loadSessions().filter((o) => o.id !== state.activeLog?.id);
  const baseKg =
    planned?.loadKg ?? suggestOverload(others, ctx.currentKey(), st.equipment)?.weightKg ?? st.setWeight;
  const ramp = warmupRamp(baseKg, st.equipment);
  if (ramp.length === 0) return null;
  return h("section", { class: "card live-warmup" }, [
    h("p", {
      class: "now-eyebrow",
      text: t("Warm-up ramp · working {0}").replace("{0}", formatLoad(st.equipment, baseKg)),
    }),
    ...ramp.map((step, i) =>
      h("div", { class: "live-warmup-row" }, [
        h("span", {
          class: "live-warmup-step",
          text: `${Math.round(step.pct * 100)}% · ${t("{0} reps").replace("{0}", String(step.reps))} · ${formatLoad(st.equipment, step.weightKg)}`,
        }),
        h("button", {
          class: "btn btn-small",
          type: "button",
          text: t("Use"),
          aria: { label: t("use warm-up step {0}").replace("{0}", String(i + 1)) },
          on: {
            click: () => {
              st.setReps = step.reps;
              st.setWeight = step.weightKg;
              st.pendingSetType = "warmup";
              ctx.snapshot();
              ctx.render();
            },
          },
        }),
      ]),
    ),
  ]);
}

/**
 * Optional warm-up / drop-set tag for the set being logged; tapping the active
 * chip clears it back to a working set. Repaints in place like the RIR field.
 */
export function renderSetTypeField(ctx: LiveCtx, onChange?: () => void): HTMLElement {
  const { st } = ctx;
  const field = h("div", { class: "field rir-field" });
  const paint = (): void => {
    const hint =
      st.pendingSetType === null
        ? t("Working set — counts toward records and weekly volume.")
        : st.pendingSetType === "warmup"
          ? t("Warm-up — won't count toward records or weekly volume.")
          : t("Drop set — a back-off set right after a working set.");
    clear(field);
    field.append(
      h("span", { class: "field-label", text: t("Set type (optional)") }),
      h(
        "div",
        { class: "toggle rir-toggle", role: "group", aria: { label: t("Set type") } },
        SET_TYPE_OPTIONS.map((o) =>
          h("button", {
            class: st.pendingSetType === o.value ? "toggle-btn active" : "toggle-btn",
            type: "button",
            text: o.label,
            aria: { pressed: String(st.pendingSetType === o.value) },
            on: {
              click: () => {
                st.pendingSetType = st.pendingSetType === o.value ? null : o.value;
                ctx.snapshot();
                paint();
                onChange?.();
              },
            },
          }),
        ),
      ),
      h("p", { class: "rir-hint", text: hint }),
    );
  };
  paint();
  return field;
}

export function renderExercise(ctx: LiveCtx): void {
  const { st } = ctx;
  const mv = findMovement(st.movementId);
  const exName = st.currentEx?.name ?? mv?.name ?? t(MUSCLE_LABELS[st.muscle]);
  const secondaries = st.currentEx?.secondaryMuscles ?? mv?.secondaryMuscles ?? [];
  const worked = [st.muscle, ...secondaries].map((m) => t(MUSCLE_LABELS[m])).join(" · ");
  const head = h("section", { class: "card live-ex-head" }, [
    ...(st.currentEx?.section
      ? [h("p", { class: "live-section-eyebrow", text: st.currentEx.section })]
      : []),
    h("span", { class: `badge badge-${st.equipment}`, text: t(EQUIPMENT_LABELS[st.equipment]) }),
    h("h2", { class: "now-name", text: exName }),
    h("p", {
      class: "now-eyebrow",
      text: `${worked} · ${t(EQUIPMENT_LABELS[st.equipment])}`,
    }),
  ]);

  // Same "last time" recall as the select screen, kept on screen while the
  // exercise is in progress — so the load to beat is in view as you dial in
  // reps and weight. Active session excluded, so it's last week's reference.
  const priorSessions = loadSessions().filter((s) => s.id !== state.activeLog?.id);
  const lastPerf = lastPerformance(priorSessions, ctx.currentKey());
  // Progression nudge for freestyle work; plan-carrying exercises defer to the
  // trainer's prescribed scheme (the benchmark below reads against it instead).
  const planDriven = st.currentEx?.target !== undefined || st.currentEx?.prescription !== undefined;
  const overloadHint = planDriven ? null : renderOverloadHint(priorSessions, ctx.currentKey(), st.equipment);

  ctx.container.append(
    h("h1", { class: "view-title", text: t("Live Session") }),
    head,
    ...(lastPerf ? [renderLastPerformance(lastPerf.date, lastPerf.exercise)] : []),
    ...(overloadHint ? [overloadHint] : []),
  );
  // What to expect on the next set given everything already done today.
  const nextPlan = st.currentEx ? nextSetTarget(st.currentEx) : null;
  const exp = ctx.expectationFor(st.muscle, st.equipment, st.movementId);
  st.markExpectLoad = null;
  if (exp) {
    const card = renderExpectation(
      exp,
      nextPlan?.reps ?? usualReps(lastPerf?.exercise ?? null),
      loadIncrementKg(st.equipment),
    );
    ctx.container.append(card.el);
    // While the dials are up, the chart's marker follows the dialled load.
    if (st.sub === "logging") {
      st.markExpectLoad = card.mark;
      card.mark(st.setWeight);
    }
  }

  // Performed sets + plan benchmark — the logged read-out for this exercise.
  // Collected into one block so the resting sub-stage can slot it below the
  // timer (start → timer → performed sets → effort), while every other sub
  // keeps it directly under the last-time recall.
  const loggedBlocks: HTMLElement[] = [renderSetList(ctx)];

  // Plan benchmark: when this exercise carries the trainer's structured
  // guideline (started from a routine), show the prescribed-vs-logged read —
  // a per-set comparison for set schemes, a rep tally for volume targets.
  const bm = st.currentEx ? exerciseBenchmark(st.currentEx) : null;
  if (st.currentEx && bm) {
    loggedBlocks.push(renderBenchmark(st.currentEx, bm));
  } else {
    // Legacy / free-text fallback: parse the prescription to a rep total and
    // show how far the logged reps have filled it (reuses Execute's UI).
    const pres = st.currentEx?.prescription;
    const target = pres !== undefined ? parseTargetReps(pres) : null;
    if (st.currentEx && pres !== undefined && target !== null && target > 0) {
      loggedBlocks.push(
        h("p", { class: "now-target", text: pres }),
        ...repTally(sumReps(st.currentEx.sets), target),
      );
    }
  }

  // Every sub-stage keeps the action button (and dials, when logging) at the
  // top of the screen, with the performed-sets read-out dropping below it.

  if (st.sub === "idle") {
    ctx.container.append(
      h("div", { class: "btn-row live-actions" }, [
        h("button", {
          class: "btn btn-primary btn-jumbo",
          type: "button",
          text: t("▶ Start set"),
          on: { click: ctx.startSet },
        }),
      ]),
      h("div", { class: "btn-row" }, [
        h("button", {
          class: "btn",
          type: "button",
          text: t("✓ Done — finish exercise"),
          on: { click: ctx.finishExercise },
        }),
      ]),
      ...loggedBlocks,
    );
    return;
  }

  if (st.sub === "running") {
    const fill = svgEl("circle", {
      class: "dial-fill",
      cx: "60",
      cy: "60",
      r: String(DIAL_R),
      "stroke-dasharray": String(DIAL_C),
      "stroke-dashoffset": "0",
    });
    const svg = svgEl("svg", { class: "dial", viewBox: "0 0 120 120", "aria-hidden": "true" });
    svg.appendChild(svgEl("circle", { class: "dial-track", cx: "60", cy: "60", r: String(DIAL_R) }));
    svg.appendChild(fill);

    const num = h("span", { class: "dial-num", text: "0:00" });
    const dialWrap = h("div", { class: "dial-wrap" }, [
      svg,
      h("div", { class: "dial-center" }, [num, h("span", { class: "dial-label", text: t("SET") })]),
    ]);

    // In-set layout (top → bottom): Stop, then the running timer, then the
    // performed sets — matching the between-sets ordering.
    const actionRow = h("div", { class: "btn-row live-actions live-scroll-anchor" }, [
      h("button", {
        class: "btn btn-accent btn-jumbo",
        type: "button",
        text: t("■ Stop"),
        on: { click: ctx.stopSet },
      }),
    ]);
    ctx.container.append(actionRow, dialWrap, ...loggedBlocks);
    // Scroll so the Stop button + running timer are in view, past the header.
    ctx.view.scrollTargetEl = actionRow;
    ctx.view.focusAnchorEl = actionRow;

    ctx.timers.loop(() => {
      st.setElapsedMs = Date.now() - st.setStartEpoch;
      const secs = st.setElapsedMs / 1000;
      num.textContent = formatClock(secs);
      fill.setAttribute("stroke-dashoffset", String(DIAL_C * (1 - ((secs % 60) / 60))));
    });
    return;
  }

  if (st.sub === "resting") {
    const fill = svgEl("circle", {
      class: "dial-fill dial-fill-rest",
      cx: "60",
      cy: "60",
      r: String(DIAL_R),
      "stroke-dasharray": String(DIAL_C),
      "stroke-dashoffset": "0",
    });
    const svg = svgEl("svg", { class: "dial", viewBox: "0 0 120 120", "aria-hidden": "true" });
    svg.appendChild(svgEl("circle", { class: "dial-track", cx: "60", cy: "60", r: String(DIAL_R) }));
    svg.appendChild(fill);

    const num = h("span", { class: "dial-num", text: "0:00" });
    const dialWrap = h("div", { class: "dial-wrap" }, [
      svg,
      h("div", { class: "dial-center" }, [num, h("span", { class: "dial-label", text: t("REST") })]),
    ]);

    // Rest alert — optional target for the rest clock. Crossing it flips the
    // dial hot and fires the audio/vibration/notification cue. The cue rides a
    // wall-clock timeout (not the rAF loop, which pauses in background tabs).
    // In the native app the OS also gets a scheduled notification for the
    // same instant — that is what fires with the phone locked, and when it
    // was accepted it owns the sound, so the in-page cue stays quiet.
    let alertSec = loadRestAlertSec();
    const armAlert = (): void => {
      const dueEpoch = alertSec > 0 ? st.restStartEpoch + alertSec * 1000 : null;
      dialWrap.classList.toggle("rest-over", dueEpoch !== null && dueEpoch <= Date.now());
      ctx.timers.armRestAlert(
        dueEpoch,
        // Short and specific: the notification may be read off a watch face.
        {
          title: t("Rest over"),
          body: `${exName} · ${t("Set {0}").replace("{0}", String((st.currentEx?.sets.length ?? 0) + 1))}`,
        },
        () => dialWrap.classList.add("rest-over"),
      );
    };
    const alertField = h("div", { class: "field rest-alert-field" });
    const paintAlert = (): void => {
      clear(alertField);
      alertField.append(
        h("span", { class: "field-label", text: t("Rest alert") }),
        h(
          "div",
          { class: "toggle rir-toggle", role: "group", aria: { label: t("Rest alert") } },
          REST_ALERT_OPTIONS.map((sec) =>
            h("button", {
              class: alertSec === sec ? "toggle-btn active" : "toggle-btn",
              type: "button",
              text: sec === 0 ? t("Off") : formatClock(sec),
              aria: { pressed: String(alertSec === sec) },
              on: {
                click: () => {
                  alertSec = sec;
                  saveRestAlertSec(sec);
                  armAlert();
                  // Re-arm once the permission prompt is answered, so a
                  // just-granted native notification takes over the cue.
                  if (sec > 0) void ensureNotifyPermission().then(() => {
                    if (alertSec === sec && dialWrap.isConnected) armAlert();
                  });
                  paintAlert();
                },
              },
            }),
          ),
        ),
      );
    };
    paintAlert();
    armAlert();

    const summary = state.activeLog
      ? renderSessionSummary(state.activeLog, loadSessions())
      : null;

    // Between-sets layout (top → bottom): Start set, then the rest timer, then
    // the performed sets, then the effort box, and finally finish-exercise.
    const actionRow = h("div", { class: "btn-row live-actions live-scroll-anchor" }, [
      h("button", {
        class: "btn btn-primary btn-jumbo",
        type: "button",
        text: t("▶ Start set"),
        on: { click: ctx.startSet },
      }),
    ]);
    // Superset partner: between sets of a linked exercise, offer the one-tap
    // jump to the paired movement so the alternation is the path of least
    // resistance (rest keeps running either way).
    const partnerCard = (() => {
      const g = st.currentEx?.supersetGroup;
      const s = state.activeLog;
      if (g === undefined || !s || !st.currentEx) return null;
      const group = s.exercises.filter((e) => e.supersetGroup === g);
      const idx = group.indexOf(st.currentEx);
      if (idx < 0 || group.length < 2) return null;
      const partner = group[(idx + 1) % group.length]!;
      return h("section", { class: "card live-superset" }, [
        h("p", { class: "now-eyebrow", text: t("Superset — up next") }),
        h("p", { class: "now-target", text: partner.name }),
        h("div", { class: "btn-row" }, [
          h("button", {
            class: "btn btn-small btn-accent",
            type: "button",
            text: t("Go to {0} →").replace("{0}", partner.name),
            aria: { label: t("switch to superset partner {0}").replace("{0}", partner.name) },
            on: { click: () => ctx.resumeExercise(partner) },
          }),
        ]),
      ]);
    })();
    const pr = renderPrFlash(st.prFlash);
    ctx.container.append(
      actionRow,
      ...(partnerCard ? [partnerCard] : []),
      ...(pr ? [pr] : []),
      h("p", { class: "set-time", text: t("Resting — recover, then start your next set") }),
      dialWrap,
      alertField,
      ...loggedBlocks,
    );
    // Scroll so the Start-set button + rest timer are in view, past the header.
    ctx.view.scrollTargetEl = actionRow;
    ctx.view.focusAnchorEl = actionRow;
    if (summary) ctx.container.append(summary);
    ctx.container.append(
      h("div", { class: "btn-row" }, [
        h("button", {
          class: "btn",
          type: "button",
          text: t("✓ Done — finish exercise"),
          on: { click: ctx.finishExercise },
        }),
      ]),
    );

    ctx.timers.loop(() => {
      const secs = (Date.now() - st.restStartEpoch) / 1000;
      num.textContent = formatClock(secs);
      fill.setAttribute("stroke-dashoffset", String(DIAL_C * (1 - ((secs % 60) / 60))));
    });
    return;
  }

  // sub === "logging" — the ✓ Done button sits above the dials so you don't
  // have to swipe down across the weight knob (which would rotate it) to reach
  // it; the performed-sets read-out drops below the dials so logging reps and
  // weight stays at the top of the screen.
  // Quick-pick chips for reps × load ride above the dials card; the strength
  // branch below owns both dials, so it fills this in. (Cast keeps the
  // assignment-narrowed type readable at the append below.)
  let presetsCard = null as HTMLElement | null;
  const dials = isCardio(st.equipment)
    ? [
        dialField({
          label: t("Distance (km)"),
          value: st.setDistanceKm,
          step: 0.1,
          min: 0,
          integer: false,
          unit: "km",
          tone: "signal",
          onCommit: (n) => {
            st.setDistanceKm = n;
            ctx.snapshot();
          },
        }),
        dialField({
          label: t("Speed (km/h)"),
          value: st.setSpeedKmh,
          step: 0.5,
          min: 0,
          integer: false,
          unit: "km/h",
          tone: "navy",
          onCommit: (n) => {
            st.setSpeedKmh = n;
            ctx.snapshot();
          },
        }),
        dialField({
          label: t("Incline (%)"),
          value: st.setInclinePct,
          step: 0.5,
          min: 0,
          integer: false,
          unit: "%",
          tone: "navy",
          onCommit: (n) => {
            st.setInclinePct = n;
            ctx.snapshot();
          },
        }),
      ]
    : ctx.holdActive()
      ? [
          // Isometric hold: log the time held (seeded from the stopwatch) plus
          // any added load — no reps dial, plate calculator, or RIR.
          dialField({
            label: t("Hold (sec)"),
            value: st.setHoldSec,
            step: 5,
            min: 0,
            integer: true,
            unit: "sec",
            tone: "signal",
            onCommit: (n) => {
              st.setHoldSec = n;
              ctx.snapshot();
            },
          }),
          dialField({
            label: isBodyweight(st.equipment) ? t("Added (kg)") : t("Weight (kg)"),
            value: st.setWeight,
            step: loadIncrementKg(st.equipment),
            min: 0,
            integer: false,
            unit: "kg",
            tone: "navy",
            onCommit: (n) => {
              st.setWeight = n;
              ctx.snapshot();
            },
          }),
        ]
      : (() => {
        // Plate calculator: for a barbell load, what to put on each side of a
        // standard 20 kg bar. Repainted in place as the weight dial turns.
        const plateHint = st.equipment === "barbell" ? h("p", { class: "plate-hint" }) : null;
        const paintPlates = (): void => {
          if (!plateHint) return;
          const load = platesPerSide(st.setWeight);
          if (!load) {
            plateHint.textContent = t("Below the empty bar ({0} kg)").replace("{0}", String(BAR_KG));
          } else if (load.perSide.length === 0 && load.remainderKg === 0) {
            plateHint.textContent = t("Empty bar — {0} kg").replace("{0}", String(BAR_KG));
          } else {
            plateHint.textContent = t("Bar {0} kg · per side: {1}")
              .replace("{0}", String(BAR_KG))
              .replace("{1}", load.perSide.join(" + "));
            if (load.remainderKg > 0) {
              plateHint.textContent += ` · ${t("+{0} kg short — use micro-plates or round").replace("{0}", String(load.remainderKg))}`;
            }
          }
        };
        paintPlates();
        // The reps × load pair is the whole point of this screen, so the two
        // dials are flanked by the shortcuts into them: quick-pick chips above
        // (one tap loads both) and a live read-out below (volume, e1RM, the
        // delta against the reference). Both repaint in place off the dials'
        // commits — a full render would re-anchor the scroll mid-adjustment.
        const preview = renderSetPreview(ctx);
        let repsDial = null as DialHandle | null;
        let weightDial = null as DialHandle | null;
        let paintPresets = (): void => {};
        const presets = renderSetPresets(ctx, (p) => {
          st.setReps = p.reps;
          st.setWeight = p.weightKg;
          repsDial?.set(p.reps);
          weightDial?.set(p.weightKg);
          ctx.snapshot();
          paintPlates();
          preview.paint();
          paintPresets();
        });
        if (presets) {
          presetsCard = presets.el;
          paintPresets = presets.paint;
        }
        return [
          dialField({
            label: t("Reps"),
            value: st.setReps,
            step: 1,
            min: 0,
            integer: true,
            unit: t("reps"),
            tone: "signal",
            bind: (d) => {
              repsDial = d;
            },
            onCommit: (n) => {
              st.setReps = n;
              ctx.snapshot();
              preview.paint();
              paintPresets();
            },
          }),
          dialField({
            // One tap of the stepper is the gear's smallest real jump (2 kg on
            // dumbbells, 2.5 elsewhere) — the same increment the progression
            // engine suggests, so the dial can actually land on its numbers.
            label: isBodyweight(st.equipment) ? t("Added (kg)") : t("Weight (kg)"),
            value: st.setWeight,
            step: loadIncrementKg(st.equipment),
            min: 0,
            integer: false,
            unit: "kg",
            tone: "navy",
            bind: (d) => {
              weightDial = d;
            },
            onCommit: (n) => {
              st.setWeight = n;
              ctx.snapshot();
              paintPlates();
              preview.paint();
              paintPresets();
            },
          }),
          preview.el,
          ...(plateHint ? [plateHint] : []),
          renderSetTypeField(ctx, () => preview.paint()),
          renderRirField(ctx),
        ];
      })();
  const setTimeEl = h("p", {
    class: "set-time live-scroll-anchor",
    text: t("Set time {0}").replace("{0}", formatClock(st.setElapsedMs / 1000)),
  });
  const warmupCard = renderWarmupRamp(ctx);
  ctx.container.append(
    setTimeEl,
    h("div", { class: "btn-row live-actions" }, [
      h("button", {
        class: "btn btn-primary btn-jumbo",
        type: "button",
        text: t("✓ Done"),
        on: { click: ctx.commitSet },
      }),
    ]),
    ...(presetsCard ? [presetsCard] : []),
    h("div", { class: "card live-dials" }, dials),
    ...(warmupCard ? [warmupCard] : []),
    ...loggedBlocks,
  );
  // The timer reading + ✓ Done + quick picks + dials cluster is what this
  // stage is for, so scroll it to the top of the viewport — the exercise head
  // and last-time recall above it would otherwise push the reps and weight
  // controls under the fold on a phone, right when they're the whole task.
  // The floating button anchors to the same row, so a scroll down through the
  // logged sets can snap straight back to the dials.
  ctx.view.scrollTargetEl = setTimeEl;
  ctx.view.focusAnchorEl = setTimeEl;
}
