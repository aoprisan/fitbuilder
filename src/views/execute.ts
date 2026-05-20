import { clear, h } from "../dom";
import { ExecuteController } from "../execute";
import type { Cleanup, Nav } from "../router";
import { state } from "../state";
import type { RoutineSheet } from "../types";

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
  const nowCard = h("section", { class: "card session-now", aria: { live: "polite" } }, [
    eyebrow,
    nameEl,
    stepEl,
    presEl,
  ]);

  // ---- Completion banner ----------------------------------------------------
  const doneCard = h("section", { class: "card session-done", hidden: true }, [
    h("p", { class: "done-title", text: "Routine complete" }),
    h("p", { class: "done-sub", text: `${ctl.total} exercises checked off. Nice work.` }),
  ]);

  // ---- Progress + meta ------------------------------------------------------
  const progressFill = h("div", { class: "progress-fill" });
  const progress = h("div", {
    class: "progress",
    role: "progressbar",
    aria: { valuemin: "0", valuemax: String(ctl.total) },
  }, [progressFill]);

  const doneValue = h("span", { class: "meta-value" });
  const leftValue = h("span", { class: "meta-value" });
  const meta = h("section", { class: "session-meta" }, [
    h("div", { class: "meta-item" }, [h("span", { class: "meta-label", text: "Done" }), doneValue]),
    h("div", { class: "meta-item" }, [h("span", { class: "meta-label", text: "Remaining" }), leftValue]),
  ]);

  // ---- Checklist ------------------------------------------------------------
  const checklist = h("div", { class: "exec-checklist" });

  function renderChecklist(): void {
    clear(checklist);
    const current = ctl.currentIndex();
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
      const row = h("button", {
        class: `exec-item${done ? " done" : ""}${!done && i === current ? " current" : ""}`,
        type: "button",
        aria: { pressed: done ? "true" : "false" },
      }, [
        h("span", { class: "exec-check", aria: { hidden: "true" } }),
        h("span", { class: "exec-body" }, [
          h("span", { class: "exec-name", text: item.name || "Untitled exercise" }),
          item.prescription
            ? h("span", { class: "exec-pres", text: item.prescription })
            : null,
        ]),
      ]);
      row.addEventListener("click", () => {
        ctl.toggle(i);
        update();
      });
      checklist.appendChild(row);
    });
  }

  // ---- Controls -------------------------------------------------------------
  const primary = h("button", {
    class: "btn btn-primary btn-jumbo",
    type: "button",
    disabled: empty,
  });
  primary.addEventListener("click", () => {
    const current = ctl.currentIndex();
    if (current >= 0) ctl.markDone(current);
    update();
  });

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

  const controls = h("div", { class: "btn-row session-controls" }, [primary, resetBtn, backBtn]);

  // ---- Render ---------------------------------------------------------------
  function update(): void {
    const done = ctl.completedCount();
    const total = ctl.total;
    const allDone = ctl.allDone();

    setText(doneValue, `${done} / ${total}`);
    setText(leftValue, String(total - done));
    progressFill.style.width = total === 0 ? "0%" : `${(done / total) * 100}%`;
    progress.setAttribute("aria-valuenow", String(done));

    nowCard.hidden = allDone || empty;
    doneCard.hidden = !allDone;

    primary.textContent = allDone ? "Complete" : "Mark Done";
    primary.toggleAttribute("disabled", empty || allDone);

    const current = ctl.currentIndex();
    const item = current >= 0 ? ctl.items[current] : undefined;
    if (item) {
      setText(eyebrow, item.routineTitle || "Current exercise");
      setText(nameEl, item.name || "Untitled exercise");
      setText(stepEl, `EXERCISE ${current + 1} OF ${total}`);
      setText(presEl, item.prescription || "—");
    }

    renderChecklist();
  }

  const container = h("div", { class: "view view-execute" }, [
    h("h1", { class: "view-title", text: "Execute" }),
    h("p", { class: "session-plan-name", text: sheet.name }),
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
