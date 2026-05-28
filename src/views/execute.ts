import { clear, h } from "../dom";
import { estimateCalories, readEffort } from "../effort";
import { ExecuteController } from "../execute";
import { executeRunToSession } from "../log";
import { loadLogo } from "../logo";
import { loadSessions, saveSession } from "../logStorage";
import { findMovement, movementsForMuscle } from "../movements";
import type { Cleanup, Nav } from "../router";
import { state } from "../state";
import { loadTrainer } from "../trainer";
import { isBodyweight, MUSCLE_GROUPS, MUSCLE_LABELS, type MuscleGroup, type RoutineSheet } from "../types";

/** Reps-in-reserve chips for the optional intensity input; "4+" stores 4 (fresh). */
const RIR_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 0, label: "Failure" },
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: "4+" },
];

/** Brand-logo banner for the top of the Execute screen, or null when unset. */
function logoBanner(): HTMLElement | null {
  const url = loadLogo();
  if (!url) return null;
  const img = h("img", { class: "screen-logo-img" });
  img.src = url;
  img.alt = "Brand logo";
  return h("div", { class: "screen-logo" }, [img]);
}

function setText(el: HTMLElement, value: string): void {
  if (el.textContent !== value) el.textContent = value;
}

/** A labelled segmented toggle (muscle group / exercise), in the shared toggle style. */
function toggleRow(
  label: string,
  options: readonly string[],
  labelFor: (value: string) => string,
  current: string,
  onPick: (value: string) => void,
): HTMLElement {
  return h("div", { class: "field" }, [
    h("span", { class: "field-label", text: label }),
    h(
      "div",
      { class: "toggle", role: "group", aria: { label } },
      options.map((opt) =>
        h("button", {
          class: current === opt ? "toggle-btn active" : "toggle-btn",
          type: "button",
          text: labelFor(opt),
          aria: { pressed: String(current === opt) },
          on: { click: () => onPick(opt) },
        }),
      ),
    ),
  ]);
}

export function mountExecute(root: HTMLElement, nav: Nav): Cleanup {
  // Snapshot chosen by nav.runSheet; fall back to the working sheet so the
  // Execute tab always has something to run.
  const sheet: RoutineSheet = state.executing ?? state.editingSheet;
  const ctl = new ExecuteController(sheet);
  const empty = ctl.total === 0;

  // Optional per-set intensity, applied to the next logged set then cleared.
  let pendingRir: number | null = null;
  // Whether the optional weight/RIR (or hold/RIR) inputs are expanded.
  let showOptional = false;
  // Whether the "counts as" identity picker is expanded (always open when unmapped).
  let showIdentity = false;
  // Step size for the aux stepper (kg vs. seconds), set per row in update().
  let auxStep = 2.5;
  // Last focused row — switching rows resets the per-set optional inputs.
  let lastSelected = -1;
  // For structured rows: "row:setsLogged" of the last prefill, so each new set
  // re-seeds the rep/weight inputs from its target (without clobbering edits
  // mid-set). Empty until the first structured row is focused.
  let lastPrefillKey = "";
  // Id of the session this run was saved into, so re-saving updates it in place.
  let savedSessionId: string | null = null;
  // Start time captured on the first save, so an "Update log" keeps the run's
  // original timestamp instead of drifting it forward each time.
  let savedStartedAt: string | null = null;

  // ---- Focused "now" card ---------------------------------------------------
  const eyebrow = h("p", { class: "now-eyebrow" });
  const nameEl = h("h2", { class: "now-name" });
  const stepEl = h("p", { class: "now-set" });
  const presEl = h("p", { class: "now-target" });

  // Per-row "counts as" identity (muscle + catalog movement), so a saved run
  // credits the right muscle and load type instead of a placeholder.
  const identityHost = h("div", { class: "exec-identity" });

  // Big per-exercise rep tally + its own progress bar.
  const tallyDone = h("span", { class: "tally-done" });
  const tallySep = h("span", { class: "tally-sep", text: "/" });
  const tallyTarget = h("span", { class: "tally-target" });
  const tallyUnit = h("span", { class: "tally-unit", text: "reps" });
  const tally = h("p", { class: "now-tally" }, [tallyDone, tallySep, tallyTarget, tallyUnit]);

  const nowFill = h("div", { class: "progress-fill" });
  const nowBar = h("div", { class: "progress now-progress", role: "progressbar" }, [nowFill]);

  const setsEl = h("p", { class: "now-sets" });

  // Rep logger: type the set you just did, then Log. Minus/plus nudge by one;
  // chips log a common set instantly; Undo pops the last set.
  const minusBtn = h("button", { class: "step-btn", type: "button", text: "−", aria: { label: "one fewer rep" } });
  const repInput = h("input", {
    class: "rep-input",
    type: "number",
    inputmode: "numeric",
    min: "0",
    value: "10",
    aria: { label: "reps in this set" },
  });
  const plusBtn = h("button", { class: "step-btn", type: "button", text: "+", aria: { label: "one more rep" } });
  const stepper = h("div", { class: "rep-stepper" }, [minusBtn, repInput, plusBtn]);

  const logBtn = h("button", { class: "btn btn-primary rep-log", type: "button", text: "Log set" });
  const undoBtn = h("button", { class: "btn rep-undo", type: "button", text: "Undo" });

  const chipRow = h(
    "div",
    { class: "rep-chips" },
    [5, 10, 15, 20].map((n) =>
      h("button", {
        class: "rep-chip",
        type: "button",
        text: `+${n}`,
        on: { click: () => logReps(n) },
      }),
    ),
  );

  // Manual done toggle for timed / hold rows that carry no rep target.
  const manualBtn = h("button", { class: "btn btn-primary rep-manual", type: "button", text: "Mark done" });

  const repControls = h("div", { class: "rep-logger" }, [
    h("p", { class: "rep-logger-label", text: "Reps this set" }),
    stepper,
    h("div", { class: "btn-row rep-actions" }, [logBtn, undoBtn]),
    chipRow,
  ]);

  // ---- Optional weight / RIR (or hold / RIR) inputs, collapsed by default ----
  const optToggle = h("button", { class: "btn btn-small exec-opt-toggle", type: "button", text: "+ Add weight / RIR" });
  const auxLabelEl = h("p", { class: "rep-logger-label" });
  const auxMinus = h("button", { class: "step-btn", type: "button", text: "−", aria: { label: "decrease" } });
  const auxInput = h("input", {
    class: "rep-input",
    type: "number",
    inputmode: "decimal",
    min: "0",
    value: "0",
    aria: { label: "added weight or hold time" },
  });
  const auxPlus = h("button", { class: "step-btn", type: "button", text: "+", aria: { label: "increase" } });
  const auxStepper = h("div", { class: "rep-stepper" }, [auxMinus, auxInput, auxPlus]);
  const rirHost = h("div", { class: "field rir-field" });
  const optBody = h("div", { class: "exec-optional", hidden: true }, [auxLabelEl, auxStepper, rirHost]);

  const nowCard = h("section", { class: "card session-now exec-now", aria: { live: "polite" } }, [
    eyebrow,
    nameEl,
    stepEl,
    presEl,
    identityHost,
    tally,
    nowBar,
    setsEl,
    repControls,
    manualBtn,
    optToggle,
    optBody,
  ]);

  // ---- Completion banner ----------------------------------------------------
  const doneSub = h("p", { class: "done-sub" });
  const doneCard = h("section", { class: "card session-done", hidden: true }, [
    h("p", { class: "done-title", text: "Routine complete" }),
    doneSub,
  ]);

  // ---- Save run to log ------------------------------------------------------
  const savePreview = h("p", { class: "exec-save-preview" });
  const saveBtn = h("button", { class: "btn btn-primary", type: "button", text: "Save to log" });
  const saveStatus = h("p", { class: "status", role: "status", aria: { live: "polite" } });
  const saveCard = h("section", { class: "card exec-save", hidden: true }, [
    h("p", { class: "exec-save-title", text: "Save this run to your log" }),
    h("p", {
      class: "plan-meta",
      text: "Logs what you did here as a session — it counts toward effort, recovery and stats in Live & Stats.",
    }),
    savePreview,
    saveBtn,
    saveStatus,
  ]);

  // ---- Overall progress + meta ----------------------------------------------
  const progressFill = h("div", { class: "progress-fill" });
  const progress = h("div", {
    class: "progress",
    role: "progressbar",
    aria: { valuemin: "0", valuemax: "100" },
  }, [progressFill]);

  const exValue = h("span", { class: "meta-value" });
  const repValue = h("span", { class: "meta-value" });
  const leftValue = h("span", { class: "meta-value" });
  const meta = h("section", { class: "session-meta exec-meta" }, [
    h("div", { class: "meta-item" }, [h("span", { class: "meta-label", text: "Exercises" }), exValue]),
    h("div", { class: "meta-item" }, [h("span", { class: "meta-label", text: "Reps" }), repValue]),
    h("div", { class: "meta-item" }, [h("span", { class: "meta-label", text: "Reps left" }), leftValue]),
  ]);

  // ---- Checklist ------------------------------------------------------------
  const checklist = h("div", { class: "exec-checklist" });

  function renderChecklist(): void {
    clear(checklist);
    const selected = ctl.selectedIndex();
    let lastRoutine = -1;
    ctl.items.forEach((item, i) => {
      if (item.routineIndex !== lastRoutine) {
        lastRoutine = item.routineIndex;
        const routine = sheet.routines[item.routineIndex];
        checklist.appendChild(
          h("div", { class: "exec-routine-head" }, [
            h("span", { class: "routine-no", text: `R${item.routineIndex + 1}` }),
            h("span", { class: "exec-routine-title", text: item.routineTitle || "Routine" }),
            ...(routine && routine.tags.length > 0
              ? [
                  h(
                    "span",
                    { class: "exec-tags" },
                    routine.tags.map((t) => h("span", { class: "exec-tag", text: t })),
                  ),
                ]
              : []),
          ]),
        );
      }

      const done = ctl.isDone(i);
      const target = ctl.targetReps(i);
      const setCount = ctl.targetSetCount(i);
      const status =
        setCount > 0
          ? `${ctl.workSets(i).length}/${setCount}`
          : target == null
            ? done
              ? "done"
              : "—"
            : `${ctl.loggedReps(i)}/${target}`;

      const miniFill = h("div", { class: "exec-mini-fill" });
      miniFill.style.width = `${Math.round(ctl.fraction(i) * 100)}%`;

      const row = h("button", {
        class: `exec-item${done ? " done" : ""}${!done && i === selected ? " current" : ""}`,
        type: "button",
        aria: { pressed: done ? "true" : "false" },
      }, [
        h("span", { class: "exec-check", aria: { hidden: "true" } }),
        h("span", { class: "exec-body" }, [
          h("span", { class: "exec-name", text: item.name || "Untitled exercise" }),
          item.prescription
            ? h("span", { class: "exec-pres", text: item.prescription })
            : null,
          h("span", { class: "exec-mini" }, [miniFill]),
        ]),
        h("span", { class: "exec-count", text: status }),
      ]);
      row.addEventListener("click", () => {
        ctl.select(i);
        update();
      });
      checklist.appendChild(row);
    });
  }

  // Replay a one-shot CSS animation by clearing the class, forcing a reflow,
  // then re-adding it — so logging set after set re-thumps the tally.
  function pulseStamp(el: HTMLElement): void {
    el.classList.remove("stamp");
    void el.offsetWidth;
    el.classList.add("stamp");
  }

  // ---- Optional inputs ------------------------------------------------------
  function round1(n: number): number {
    return Math.round(n * 10) / 10;
  }

  function nudgeAux(delta: number): void {
    const next = Math.max(0, round1((parseFloat(auxInput.value) || 0) + delta));
    auxInput.value = String(next);
  }

  /** Re-render the RIR chips so the active selection reflects `pendingRir`. */
  function renderRir(): void {
    clear(rirHost);
    rirHost.append(
      h("span", { class: "field-label", text: "Reps in reserve (optional)" }),
      h(
        "div",
        { class: "toggle rir-toggle", role: "group", aria: { label: "Reps in reserve" } },
        RIR_OPTIONS.map((o) =>
          h("button", {
            class: pendingRir === o.value ? "toggle-btn active" : "toggle-btn",
            type: "button",
            text: o.label,
            aria: {
              pressed: String(pendingRir === o.value),
              label: o.value === 0 ? "trained to failure" : `${o.label} reps in reserve`,
            },
            on: {
              click: () => {
                pendingRir = pendingRir === o.value ? null : o.value;
                renderRir();
              },
            },
          }),
        ),
      ),
    );
  }

  /** Re-render the "counts as" muscle/exercise picker for the focused row. */
  function renderIdentity(): void {
    clear(identityHost);
    const i = ctl.selectedIndex();
    const m = ctl.exercise(i);
    if (!m) return;
    const mvName = m.exerciseId ? findMovement(m.exerciseId)?.name : undefined;
    const summary = h("div", { class: "exec-id-summary" }, [
      h("span", {
        class: "exec-id-label",
        text: `Counts as ${MUSCLE_LABELS[m.muscle]}${mvName ? ` · ${mvName}` : ""}`,
      }),
      ...(m.mapped
        ? [
            h("button", {
              class: "btn btn-small exec-id-change",
              type: "button",
              text: showIdentity ? "Done" : "Change",
              on: {
                click: () => {
                  showIdentity = !showIdentity;
                  renderIdentity();
                },
              },
            }),
          ]
        : []),
    ]);
    identityHost.append(summary);

    if (showIdentity || !m.mapped) {
      if (!m.mapped) {
        identityHost.append(
          h("p", {
            class: "rir-hint",
            text: "Pick what this counts as so it credits the right muscle and load.",
          }),
        );
      }
      identityHost.append(
        toggleRow(
          "Muscle group",
          MUSCLE_GROUPS,
          (mg) => MUSCLE_LABELS[mg as MuscleGroup],
          m.muscle,
          (mg) => {
            ctl.setMuscle(i, mg as MuscleGroup);
            renderIdentity();
          },
        ),
        toggleRow(
          "Exercise",
          movementsForMuscle(m.muscle).map((mv) => mv.id),
          (id) => findMovement(id)?.name ?? id,
          m.exerciseId ?? "",
          (id) => {
            ctl.setMovement(i, id);
            renderIdentity();
          },
        ),
      );
    }
  }

  // ---- Logger actions -------------------------------------------------------
  function logReps(n: number): void {
    const i = ctl.selectedIndex();
    const weight = parseFloat(auxInput.value);
    ctl.logSet(i, n, {
      ...(Number.isFinite(weight) && weight > 0 ? { weightKg: weight } : {}),
      ...(pendingRir !== null ? { rir: pendingRir } : {}),
    });
    pendingRir = null;
    update();
    pulseStamp(tallyDone);
  }

  minusBtn.addEventListener("click", () => {
    repInput.value = String(Math.max(0, (parseInt(repInput.value, 10) || 0) - 1));
  });
  plusBtn.addEventListener("click", () => {
    repInput.value = String(Math.max(0, (parseInt(repInput.value, 10) || 0) + 1));
  });
  logBtn.addEventListener("click", () => logReps(parseInt(repInput.value, 10) || 0));
  undoBtn.addEventListener("click", () => {
    ctl.undoSet(ctl.selectedIndex());
    update();
  });
  manualBtn.addEventListener("click", () => {
    const i = ctl.selectedIndex();
    const hold = parseFloat(auxInput.value);
    ctl.toggleManual(i, {
      ...(Number.isFinite(hold) && hold > 0 ? { durationSec: hold } : {}),
      ...(pendingRir !== null ? { rir: pendingRir } : {}),
    });
    pendingRir = null;
    update();
  });

  auxMinus.addEventListener("click", () => nudgeAux(-auxStep));
  auxPlus.addEventListener("click", () => nudgeAux(auxStep));
  optToggle.addEventListener("click", () => {
    showOptional = !showOptional;
    update();
  });
  saveBtn.addEventListener("click", saveRun);

  function saveRun(): void {
    const session = executeRunToSession(ctl, sheet.name, { fromSheetId: sheet.id });
    if (session.exercises.length === 0) return;
    if (savedSessionId) {
      // Update the same logged session, keeping its original start time.
      session.id = savedSessionId;
      if (savedStartedAt) session.startedAt = savedStartedAt;
    }
    const stored = saveSession(session);
    savedSessionId = stored.id;
    savedStartedAt = stored.startedAt;
    update();
  }

  // ---- Controls -------------------------------------------------------------
  const resetBtn = h("button", {
    class: "btn",
    type: "button",
    text: "Reset",
    on: {
      click: () => {
        ctl.reset();
        savedSessionId = null;
        savedStartedAt = null;
        pendingRir = null;
        showOptional = false;
        auxInput.value = "0";
        lastSelected = -1;
        lastPrefillKey = "";
        update();
      },
    },
  });

  const backBtn = h("button", {
    class: "btn",
    type: "button",
    text: "Back to Routines",
    on: { click: () => nav.go("sheet") },
  });

  const controls = h("div", { class: "btn-row session-controls" }, [resetBtn, backBtn]);

  // ---- Render ---------------------------------------------------------------
  function update(): void {
    const exDone = ctl.completedCount();
    const exTotal = ctl.total;
    const repsTarget = ctl.totalTargetReps();
    const repsDone = ctl.doneReps();
    const allDone = ctl.allDone();

    setText(exValue, `${exDone} / ${exTotal}`);
    setText(repValue, `${repsDone} / ${repsTarget}`);
    setText(leftValue, String(Math.max(0, repsTarget - repsDone)));

    // Overall bar tracks rep volume; falls back to exercise count when no row
    // carries a rep target (e.g. an all-timed routine).
    const pct = repsTarget > 0
      ? (repsDone / repsTarget) * 100
      : exTotal > 0
        ? (exDone / exTotal) * 100
        : 0;
    progressFill.style.width = `${pct}%`;
    progress.setAttribute("aria-valuenow", String(Math.round(pct)));

    nowCard.hidden = allDone || empty;
    doneCard.hidden = !allDone;
    setText(
      doneSub,
      repsTarget > 0
        ? `${exTotal} exercises · ${repsDone} reps logged. Nice work.`
        : `${exTotal} exercises checked off. Nice work.`,
    );

    const i = ctl.selectedIndex();
    const item = exTotal > 0 ? ctl.items[i] : undefined;
    if (item && !allDone) {
      const setCount = ctl.targetSetCount(i);
      const structured = setCount > 0;
      const loggedSets = ctl.workSets(i).length;

      if (structured) {
        // Re-seed reps/weight from each set's target as it comes up — but only
        // when the row or the set index changes, so mid-set edits are kept.
        const key = `${i}:${loggedSets}`;
        if (key !== lastPrefillKey) {
          lastPrefillKey = key;
          const cur = ctl.currentSetTarget(i);
          if (cur) {
            repInput.value = String(cur.reps);
            auxInput.value = cur.loadKg !== undefined ? String(cur.loadKg) : "0";
            if (cur.loadKg !== undefined) showOptional = true; // surface the weight field
          }
          pendingRir = null;
        }
        lastSelected = i;
      } else if (i !== lastSelected) {
        // Switching rows clears the per-set optional inputs (weight/hold + RIR).
        lastSelected = i;
        auxInput.value = "0";
        pendingRir = null;
      }

      const target = item.targetReps;
      setText(eyebrow, item.routineTitle || "Current exercise");
      setText(nameEl, item.name || "Untitled exercise");
      renderIdentity();

      // Step + target lines: structured rows show the current set's target.
      if (structured) {
        const cur = ctl.currentSetTarget(i);
        setText(stepEl, `EXERCISE ${i + 1} OF ${exTotal} · SET ${Math.min(loggedSets + 1, setCount)}/${setCount}`);
        setText(
          presEl,
          cur
            ? cur.loadKg !== undefined
              ? `Target · ${cur.reps} reps @ ${cur.loadKg} kg`
              : `Target · ${cur.reps} reps`
            : "All sets logged",
        );
      } else {
        setText(stepEl, `EXERCISE ${i + 1} OF ${exTotal}`);
        setText(presEl, item.prescription || "—");
      }

      const repItem = target != null && target > 0;
      // Rep logger vs. manual done toggle, depending on the prescription.
      repControls.hidden = !repItem;
      tally.hidden = !repItem;
      nowBar.hidden = !repItem;
      setsEl.hidden = !repItem;
      manualBtn.hidden = repItem;

      if (repItem) {
        const logged = ctl.loggedReps(i);
        setText(tallyDone, String(logged));
        setText(tallyTarget, String(target));
        nowFill.style.width = `${Math.round(ctl.fraction(i) * 100)}%`;
        const sets = ctl.setReps(i);
        if (structured) {
          const remainingSets = Math.max(0, setCount - sets.length);
          setText(
            setsEl,
            sets.length === 0
              ? "No sets yet — log your first set."
              : `${sets.length}/${setCount} sets: ${sets.join(" · ")}` +
                  (remainingSets > 0 ? ` — ${remainingSets} to go` : " — done"),
          );
        } else {
          const remaining = ctl.remainingReps(i);
          setText(
            setsEl,
            sets.length === 0
              ? "No sets yet — log your first set."
              : `${sets.length} ${sets.length === 1 ? "set" : "sets"}: ${sets.join(" · ")}` +
                  (remaining > 0 ? ` — ${remaining} to go` : " — done"),
          );
        }
      } else {
        manualBtn.textContent = ctl.isDone(i) ? "Mark not done" : "Mark done";
      }

      // Optional inputs adapt to the row: weight for rep rows, hold time for
      // timed/manual rows. RIR applies to both.
      const m = ctl.exercise(i);
      const manual = !repItem;
      auxStep = manual ? 5 : 2.5;
      setText(
        auxLabelEl,
        manual
          ? "Hold (seconds)"
          : m && isBodyweight(m.equipment)
            ? "Added weight (kg)"
            : "Weight (kg)",
      );
      setText(
        optToggle,
        `${showOptional ? "− Hide" : "+ Add"} ${manual ? "hold / RIR" : "weight / RIR"}`,
      );
      optBody.hidden = !showOptional;
      renderRir();
    }

    // Save card — available whenever there's at least one logged set.
    const loggedSets = ctl.loggedSetCount();
    saveCard.hidden = empty || loggedSets === 0;
    if (!saveCard.hidden) {
      const session = executeRunToSession(ctl, sheet.name, { fromSheetId: sheet.id });
      const effort = readEffort(session, loadSessions());
      const vs = effort.vsTypicalPct !== null ? ` · ${effort.vsTypicalPct}% of your usual` : "";
      setText(
        savePreview,
        `${loggedSets} ${loggedSets === 1 ? "set" : "sets"} · ≈ ${effort.label} effort · ~${estimateCalories(effort)} kcal${vs}`,
      );
      saveBtn.textContent = savedSessionId ? "Update log" : "Save to log";
      if (savedSessionId) {
        setText(saveStatus, "Logged ✓ — view it in the Live tab. Log more, then Update to refresh it.");
        saveStatus.className = "status status-ok";
      } else {
        setText(saveStatus, "");
        saveStatus.className = "status";
      }
    }

    renderChecklist();
  }

  const trainer = loadTrainer();
  const container = h("div", { class: "view view-execute" }, [
    logoBanner(),
    h("h1", { class: "view-title", text: "Execute" }),
    h("p", { class: "session-plan-name", text: sheet.name }),
    trainer ? h("p", { class: "session-trainer", text: `Trainer · ${trainer}` }) : null,
    empty
      ? h("p", { class: "empty", text: "This sheet has no exercises. Add some in Routines first." })
      : nowCard,
    doneCard,
    progress,
    meta,
    saveCard,
    checklist,
    controls,
  ]);

  update();
  root.appendChild(container);
  return () => {};
}
