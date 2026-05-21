import { clear, h } from "../dom";
import { ExecuteController } from "../execute";
import { loadLogo } from "../logo";
import type { Cleanup, Nav } from "../router";
import { state } from "../state";
import { loadTrainer } from "../trainer";
import type { RoutineSheet } from "../types";

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

export function mountExecute(root: HTMLElement, nav: Nav): Cleanup {
  // Snapshot chosen by nav.runSheet; fall back to the working sheet so the
  // Execute tab always has something to run.
  const sheet: RoutineSheet = state.executing ?? state.editingSheet;
  const ctl = new ExecuteController(sheet);
  const empty = ctl.total === 0;

  // ---- Focused "now" card ---------------------------------------------------
  const eyebrow = h("p", { class: "now-eyebrow" });
  const nameEl = h("h2", { class: "now-name" });
  const stepEl = h("p", { class: "now-set" });
  const presEl = h("p", { class: "now-target" });

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

  const nowCard = h("section", { class: "card session-now exec-now", aria: { live: "polite" } }, [
    eyebrow,
    nameEl,
    stepEl,
    presEl,
    tally,
    nowBar,
    setsEl,
    repControls,
    manualBtn,
  ]);

  // ---- Completion banner ----------------------------------------------------
  const doneSub = h("p", { class: "done-sub" });
  const doneCard = h("section", { class: "card session-done", hidden: true }, [
    h("p", { class: "done-title", text: "Routine complete" }),
    doneSub,
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
      const status =
        target == null
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

  // ---- Logger actions -------------------------------------------------------
  function logReps(n: number): void {
    ctl.logSet(ctl.selectedIndex(), n);
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
    ctl.toggleManual(ctl.selectedIndex());
    update();
  });

  // ---- Controls -------------------------------------------------------------
  const resetBtn = h("button", {
    class: "btn",
    type: "button",
    text: "Reset",
    on: {
      click: () => {
        ctl.reset();
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
      const target = item.targetReps;
      setText(eyebrow, item.routineTitle || "Current exercise");
      setText(nameEl, item.name || "Untitled exercise");
      setText(stepEl, `EXERCISE ${i + 1} OF ${exTotal}`);
      setText(presEl, item.prescription || "—");

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
        const remaining = ctl.remainingReps(i);
        setText(
          setsEl,
          sets.length === 0
            ? "No sets yet — log your first set."
            : `${sets.length} ${sets.length === 1 ? "set" : "sets"}: ${sets.join(" · ")}` +
                (remaining > 0 ? ` — ${remaining} to go` : " — done"),
        );
      } else {
        manualBtn.textContent = ctl.isDone(i) ? "Mark not done" : "Mark done";
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
    checklist,
    controls,
  ]);

  update();
  root.appendChild(container);
  return () => {};
}
