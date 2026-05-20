import { ensureAudio, goBeep, tickBeep } from "../audio";
import { h } from "../dom";
import type { Cleanup, Nav } from "../router";
import { SessionController } from "../session";
import { state } from "../state";
import { EQUIPMENT_LABELS, type ExercisePlan } from "../types";
import { formatClock, formatLoad } from "../util";

const SVG_NS = "http://www.w3.org/2000/svg";
const DIAL_R = 52;
const DIAL_C = 2 * Math.PI * DIAL_R;

function svgEl(tag: string, attrs: Record<string, string>): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function setText(el: HTMLElement, value: string): void {
  if (el.textContent !== value) el.textContent = value;
}

export function mountSession(root: HTMLElement, nav: Nav): Cleanup {
  const plan: ExercisePlan = state.session ?? state.editing;
  const ctl = new SessionController(plan);
  const empty = ctl.steps.length === 0;

  // ---- Status panels --------------------------------------------------------
  const eyebrow = h("p", { class: "now-eyebrow" });
  const equip = h("span", { class: "badge" });
  const nameEl = h("h2", { class: "now-name" });
  const setEl = h("p", { class: "now-set" });
  const targetEl = h("p", { class: "now-target" });

  const nowCard = h("section", { class: "card session-now", aria: { live: "polite" } }, [
    eyebrow,
    equip,
    nameEl,
    setEl,
    targetEl,
  ]);

  const doneElapsed = h("p", { class: "done-elapsed" });
  const doneCard = h("section", { class: "card session-done", hidden: true }, [
    h("p", { class: "done-title", text: "Workout complete" }),
    h("p", { class: "done-sub", text: `${ctl.steps.length} sets done. Nice work.` }),
    doneElapsed,
  ]);

  // ---- Rest dial ------------------------------------------------------------
  const dialFill = svgEl("circle", {
    class: "dial-fill",
    cx: "60",
    cy: "60",
    r: String(DIAL_R),
    "stroke-dasharray": String(DIAL_C),
    "stroke-dashoffset": "0",
  });
  const svg = svgEl("svg", { class: "dial", viewBox: "0 0 120 120", "aria-hidden": "true" });
  svg.appendChild(
    svgEl("circle", { class: "dial-track", cx: "60", cy: "60", r: String(DIAL_R) }),
  );
  svg.appendChild(dialFill);

  const dialNum = h("span", { class: "dial-num" });
  const dialLabel = h("span", { class: "dial-label", text: "REST" });
  const dialWrap = h("div", { class: "dial-wrap", hidden: true }, [
    svg,
    h("div", { class: "dial-center" }, [dialNum, dialLabel]),
  ]);

  // ---- Meta + progress ------------------------------------------------------
  const elapsedEl = h("span", { class: "meta-value", text: "0:00" });
  const progressText = h("span", { class: "meta-value" });
  const progressFill = h("div", { class: "progress-fill" });
  const progress = h("div", {
    class: "progress",
    role: "progressbar",
    aria: { valuemin: "0", valuemax: String(ctl.steps.length) },
  }, [progressFill]);

  const meta = h("section", { class: "session-meta" }, [
    h("div", { class: "meta-item" }, [h("span", { class: "meta-label", text: "Elapsed" }), elapsedEl]),
    h("div", { class: "meta-item" }, [h("span", { class: "meta-label", text: "Sets" }), progressText]),
  ]);

  // ---- Controls -------------------------------------------------------------
  const primary = h("button", {
    class: "btn btn-primary btn-jumbo",
    type: "button",
    disabled: empty,
  });
  primary.addEventListener("click", () => {
    ensureAudio();
    ctl.onPrimary(performance.now());
    updateUI(performance.now());
  });

  const resetBtn = h("button", {
    class: "btn",
    type: "button",
    text: "Reset",
    on: {
      click: () => {
        ctl.reset();
        updateUI(performance.now());
      },
    },
  });

  const backBtn = h("button", {
    class: "btn",
    type: "button",
    text: "Back to Saved",
    on: { click: () => nav.go("saved") },
  });

  const controls = h("div", { class: "btn-row session-controls" }, [primary, resetBtn, backBtn]);

  const container = h("div", { class: "view view-session" }, [
    h("h1", { class: "view-title", text: "Session" }),
    h("p", { class: "session-plan-name", text: plan.name }),
    empty
      ? h("p", { class: "empty", text: "This plan has no sets. Add some in the Builder first." })
      : nowCard,
    dialWrap,
    doneCard,
    progress,
    meta,
    controls,
  ]);

  // ---- Render loop ----------------------------------------------------------
  function updateUI(now: number): void {
    const phase = ctl.phase;
    primary.textContent = ctl.primaryLabel();
    primary.toggleAttribute("disabled", empty || phase === "done");

    setText(elapsedEl, formatClock(ctl.elapsedMs(now) / 1000));
    const done = ctl.completedSets();
    setText(progressText, `${done} / ${ctl.steps.length}`);
    progressFill.style.width =
      ctl.steps.length === 0 ? "0%" : `${(done / ctl.steps.length) * 100}%`;
    progress.setAttribute("aria-valuenow", String(done));

    const isDone = phase === "done";
    nowCard.hidden = isDone || empty;
    doneCard.hidden = !isDone;
    dialWrap.hidden = !ctl.isRest;

    if (isDone) {
      setText(doneElapsed, `Total time ${formatClock(ctl.elapsedMs(now) / 1000)}`);
      return;
    }

    if (ctl.isRest) {
      const remainingS = Math.ceil(ctl.remainingRestMs(now) / 1000);
      setText(dialNum, String(remainingS));
      setText(dialLabel, phase === "paused" ? "PAUSED" : "REST");
      dialFill.setAttribute(
        "stroke-dashoffset",
        String(DIAL_C * (1 - ctl.restFraction(now))),
      );
    }

    const step = ctl.displayStep();
    if (!step) return;
    setText(
      eyebrow,
      phase === "idle"
        ? "READY"
        : phase === "ready"
          ? "CURRENT SET"
          : phase === "paused"
            ? "PAUSED — UP NEXT"
            : "RESTING — UP NEXT",
    );
    equip.textContent = EQUIPMENT_LABELS[step.equipment];
    equip.className = `badge badge-${step.equipment}`;
    setText(nameEl, step.name);
    setText(setEl, `SET ${step.setIndex + 1} OF ${step.setCount}`);
    setText(targetEl, `${step.reps} reps · ${formatLoad(step.equipment, step.weightKg)}`);
  }

  let running = true;
  let rafId = requestAnimationFrame(function frame() {
    if (!running) return;
    const now = performance.now();
    for (const sound of ctl.tick(now)) {
      if (sound === "tick") tickBeep();
      else goBeep();
    }
    updateUI(now);
    rafId = requestAnimationFrame(frame);
  });

  updateUI(performance.now());
  root.appendChild(container);

  // Cancelable on view exit.
  return () => {
    running = false;
    cancelAnimationFrame(rafId);
  };
}
