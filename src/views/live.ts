import { clear, h } from "../dom";
import { readEffort, readHydration } from "../effort";
import { newLoggedExercise, newTrainingSession } from "../log";
import { clearProgress, loadProgress, saveProgress } from "../liveProgress";
import { deleteSession, getSession, loadSessions, saveSession } from "../logStorage";
import type { Cleanup, Nav } from "../router";
import { setActiveLog, state } from "../state";
import {
  EQUIPMENT,
  EQUIPMENT_LABELS,
  isBodyweight,
  MUSCLE_GROUPS,
  MUSCLE_LABELS,
  type Equipment,
  type LoggedExercise,
  type MuscleGroup,
  type TrainingSession,
  type WorkSet,
} from "../types";
import { formatClock, formatLoad, formatSessionDate, sessionSetCount, sessionVolume } from "../util";
import { dialField } from "./dial";

const SVG_NS = "http://www.w3.org/2000/svg";
// Pulled in from the rim so the thicker ring stroke clears the gauge ticks.
const DIAL_R = 49;
const DIAL_C = 2 * Math.PI * DIAL_R;

function svgEl(tag: string, attrs: Record<string, string>): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

/** Top-level place in the live flow. */
type Stage = "list" | "select" | "exercise";
/** Where we are within a single exercise. */
type SetSub = "idle" | "running" | "logging" | "resting";

export function mountLive(root: HTMLElement, _nav: Nav): Cleanup {
  const container = h("div", { class: "view view-live" });
  root.appendChild(container);

  let stage: Stage = state.activeLog ? "select" : "list";
  let sub: SetSub = "idle";

  // Pending exercise selection (becomes a LoggedExercise on the first logged set).
  let muscle: MuscleGroup = "chest";
  let equipment: Equipment = "dumbbell";
  let currentEx: LoggedExercise | null = null;

  // In-flight set values.
  let setReps = 10;
  let setWeight = 10;

  // Stopwatch. Anchored to wall-clock time (epoch ms) so it keeps correct time
  // across a reload or phone lock, not just within one page session.
  let setStartEpoch = 0;
  let setElapsedMs = 0;
  let rafId = 0;

  // Rest clock — starts the moment a set is committed, runs until the next set.
  let restStartEpoch = 0;

  function stopRaf(): void {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  function persist(): void {
    if (state.activeLog) saveSession(state.activeLog);
  }

  /** Snapshot the in-flight flow so a reload can resume exactly here. */
  function snapshot(): void {
    const s = state.activeLog;
    if (!s || stage === "list") {
      clearProgress();
      return;
    }
    saveProgress({
      sessionId: s.id,
      stage,
      sub,
      muscle,
      equipment,
      hasCurrentEx: currentEx !== null,
      setReps,
      setWeight,
      setStartEpoch,
      setElapsedMs,
      restStartEpoch,
    });
  }

  /** Re-open the session and flow position saved by a previous run, if any. */
  function restore(): void {
    const saved = loadProgress();
    if (!saved) return;
    const session = getSession(saved.sessionId);
    if (!session) {
      clearProgress();
      return;
    }
    setActiveLog(session);
    stage = saved.stage;
    sub = saved.sub;
    muscle = saved.muscle;
    equipment = saved.equipment;
    currentEx =
      saved.hasCurrentEx && session.exercises.length > 0
        ? session.exercises[session.exercises.length - 1]!
        : null;
    setReps = saved.setReps;
    setWeight = saved.setWeight;
    setStartEpoch = saved.setStartEpoch;
    setElapsedMs = saved.setElapsedMs;
    restStartEpoch = saved.restStartEpoch;
  }

  // ───────────────────────── Toggles (muscle / equipment) ─────────────────────

  const renderToggle = (
    groupLabel: string,
    options: readonly string[],
    label: (value: string) => string,
    current: string,
    onPick: (value: string) => void,
  ): HTMLElement =>
    h("div", { class: "field" }, [
      h("span", { class: "field-label", text: groupLabel }),
      h(
        "div",
        { class: "toggle", role: "group", aria: { label: groupLabel } },
        options.map((opt) =>
          h("button", {
            class: current === opt ? "toggle-btn active" : "toggle-btn",
            type: "button",
            text: label(opt),
            aria: { pressed: String(current === opt) },
            on: { click: () => onPick(opt) },
          }),
        ),
      ),
    ]);

  // ───────────────────────────── Transitions ──────────────────────────────────

  function startSession(): void {
    setActiveLog(saveSession(newTrainingSession()));
    muscle = "chest";
    equipment = "dumbbell";
    currentEx = null;
    sub = "idle";
    stage = "select";
    render();
  }

  function openSession(id: string): void {
    const fresh = getSession(id);
    if (!fresh) return;
    setActiveLog(fresh);
    currentEx = null;
    sub = "idle";
    stage = "select";
    render();
  }

  function endSession(): void {
    stopRaf();
    const s = state.activeLog;
    if (s) {
      if (s.exercises.some((ex) => ex.sets.length > 0)) saveSession(s);
      else deleteSession(s.id); // discard a session with nothing logged
    }
    clearProgress();
    setActiveLog(null);
    currentEx = null;
    sub = "idle";
    stage = "list";
    render();
  }

  function startExercise(): void {
    currentEx = null;
    sub = "idle";
    stage = "exercise";
    render();
  }

  function startSet(): void {
    setStartEpoch = Date.now();
    setElapsedMs = 0;
    sub = "running";
    render();
  }

  function stopSet(): void {
    stopRaf();
    setElapsedMs = Date.now() - setStartEpoch;
    const last =
      currentEx && currentEx.sets.length ? currentEx.sets[currentEx.sets.length - 1]! : null;
    setReps = last ? last.reps : 10;
    setWeight = last ? last.weightKg : isBodyweight(equipment) ? 0 : 10;
    sub = "logging";
    render();
  }

  function commitSet(): void {
    const s = state.activeLog;
    if (!s) return;
    const set: WorkSet = {
      reps: setReps,
      weightKg: setWeight,
      durationSec: Math.round(setElapsedMs / 1000),
    };
    if (!currentEx) {
      currentEx = newLoggedExercise(muscle, equipment);
      s.exercises.push(currentEx);
    }
    currentEx.sets.push(set);
    persist();
    restStartEpoch = Date.now();
    sub = "resting";
    render();
  }

  function finishExercise(): void {
    currentEx = null;
    sub = "idle";
    stage = "select";
    render();
  }

  function deleteSet(i: number): void {
    if (!currentEx) return;
    if (!confirm(`Delete set ${i + 1}? This cannot be undone.`)) return;
    currentEx.sets.splice(i, 1);
    persist();
    render();
  }

  // ──────────────────────── Effort / hydration panel ──────────────────────────

  /**
   * Effort gauge + hydration cue for the active session. The gauge fills as
   * sets accumulate (calibrated against the user's past sessions) and the
   * hydration target climbs with it. Hidden until the first set is logged.
   */
  function renderEffortPanel(): HTMLElement | null {
    const s = state.activeLog;
    if (!s || sessionSetCount(s) === 0) return null;

    const effort = readEffort(s, loadSessions());
    const hydration = readHydration(effort);
    const pct = Math.round(Math.min(1, effort.ratio) * 100);

    const fill = h("div", { class: "effort-bar-fill" });
    fill.style.width = `${Math.min(1, effort.ratio) * 100}%`;

    const meta =
      effort.vsTypicalPct !== null
        ? `${effort.vsTypicalPct}% of your usual session`
        : "Building your baseline — fills toward a full session";

    const glasses = `${hydration.glasses} ${hydration.glasses === 1 ? "glass" : "glasses"}`;

    return h("section", { class: "card live-effort", dataset: { tier: effort.tier } }, [
      h("div", { class: "effort-head" }, [
        h("span", { class: "effort-eyebrow", text: "Session effort" }),
        h("span", { class: "effort-tier", text: effort.label }),
      ]),
      h(
        "div",
        {
          class: "effort-bar",
          role: "progressbar",
          aria: { valuemin: "0", valuemax: "100", valuenow: String(pct), label: "Session effort" },
        },
        [fill],
      ),
      h("p", { class: "effort-meta", text: meta }),
      h("div", { class: "hydration-row" }, [
        h("span", { class: "hydration-label", text: "Hydration" }),
        h("span", { class: "hydration-figure", text: `≈ ${hydration.liters.toFixed(1)} L · ${glasses}` }),
      ]),
      h("p", { class: "hydration-note", text: hydration.note }),
    ]);
  }

  // ───────────────────────────── List screen ──────────────────────────────────

  function renderList(): void {
    const sessions = loadSessions().sort((a, b) => b.startedAt.localeCompare(a.startedAt));

    const listHost = h("div", { class: "saved-list" });
    if (sessions.length === 0) {
      listHost.appendChild(
        h("p", {
          class: "empty",
          text: "No sessions yet. Hit “Start session” when you reach the gym.",
        }),
      );
    } else {
      sessions.forEach((s) => listHost.appendChild(renderSessionCard(s)));
    }

    container.append(
      h("h1", { class: "view-title", text: "Live" }),
      h("p", {
        class: "lede",
        text: "Track a workout in real time: start a session, pick the muscle and gear, then time each set and log reps and weight.",
      }),
      h("div", { class: "btn-row" }, [
        h("button", {
          class: "btn btn-primary",
          type: "button",
          text: "+ Start session",
          on: { click: startSession },
        }),
      ]),
      listHost,
    );
  }

  function renderSessionCard(s: TrainingSession): HTMLElement {
    const sets = sessionSetCount(s);
    const vol = sessionVolume(s);
    const meta =
      `${s.exercises.length} exercises · ${sets} sets` + (vol > 0 ? ` · ${vol} kg lifted` : "");
    return h("section", { class: "card saved-item" }, [
      h("div", { class: "saved-info" }, [
        h("p", { class: "plan-name", text: s.name || "Untitled session" }),
        h("p", { class: "plan-meta", text: formatSessionDate(s.startedAt) }),
        h("p", { class: "plan-meta", text: meta }),
      ]),
      h("div", { class: "btn-row saved-actions" }, [
        h("button", {
          class: "btn btn-accent btn-small",
          type: "button",
          text: "Resume",
          on: { click: () => openSession(s.id) },
        }),
        h("button", {
          class: "btn btn-small danger",
          type: "button",
          text: "Delete",
          on: {
            click: () => {
              if (!confirm(`Delete "${s.name || "this session"}"? This cannot be undone.`)) return;
              deleteSession(s.id);
              render();
            },
          },
        }),
      ]),
    ]);
  }

  // ──────────────────────────── Select screen ─────────────────────────────────

  function renderSelect(): void {
    const session = state.activeLog;
    if (!session) {
      stage = "list";
      renderList();
      return;
    }

    const nameInput = h("input", {
      class: "plan-name-input",
      type: "text",
      value: session.name,
      placeholder: "Session name",
      aria: { label: "Session name" },
    });
    nameInput.addEventListener("input", () => {
      session.name = nameInput.value;
      persist();
    });

    const doneHost = h("div", { class: "live-done-list" });
    if (session.exercises.length > 0) {
      doneHost.append(
        h("p", { class: "field-label", text: "Logged so far" }),
        ...session.exercises.map((ex) =>
          h("p", { class: "live-done-row", text: `${ex.name} — ${ex.sets.length} sets` }),
        ),
      );
    }

    const effortPanel = renderEffortPanel();

    container.append(
      h("h1", { class: "view-title", text: "Live Session" }),
      h("section", { class: "card" }, [
        h("label", { class: "field" }, [
          h("span", { class: "field-label", text: "Session name" }),
          nameInput,
        ]),
        h("p", { class: "session-date", text: formatSessionDate(session.startedAt) }),
      ]),
    );
    if (effortPanel) container.append(effortPanel);
    container.append(
      h("section", { class: "card live-select" }, [
        h("h2", { class: "section-title", text: "Next exercise" }),
        renderToggle(
          "Muscle group",
          MUSCLE_GROUPS,
          (m) => MUSCLE_LABELS[m as MuscleGroup],
          muscle,
          (m) => {
            muscle = m as MuscleGroup;
            render();
          },
        ),
        renderToggle(
          "Equipment",
          EQUIPMENT,
          (eq) => EQUIPMENT_LABELS[eq as Equipment],
          equipment,
          (eq) => {
            equipment = eq as Equipment;
            render();
          },
        ),
        h("div", { class: "btn-row" }, [
          h("button", {
            class: "btn btn-primary",
            type: "button",
            text: "Next →",
            on: { click: startExercise },
          }),
        ]),
        doneHost,
      ]),
      h("div", { class: "btn-row live-actions" }, [
        h("button", {
          class: "btn btn-accent",
          type: "button",
          text: "✓ Done — end session",
          on: { click: endSession },
        }),
      ]),
    );
  }

  // ─────────────────────────── Exercise screen ────────────────────────────────

  function renderSetList(): HTMLElement {
    const sets = currentEx?.sets ?? [];
    const host = h("div", { class: "live-set-list" });
    if (sets.length === 0) {
      host.appendChild(h("p", { class: "empty", text: "No sets yet — hit “Start set”." }));
      return host;
    }
    sets.forEach((s, i) => {
      const bits = [`${s.reps} reps`, formatLoad(equipment, s.weightKg)];
      if (s.durationSec !== undefined) bits.push(formatClock(s.durationSec));
      host.appendChild(
        h("div", { class: "live-set" }, [
          h("span", { class: "set-no", text: `Set ${i + 1}` }),
          h("span", { class: "live-set-meta", text: bits.join(" · ") }),
          h("button", {
            class: "icon-btn danger live-set-del",
            type: "button",
            text: "✕",
            aria: { label: `delete set ${i + 1}` },
            on: { click: () => deleteSet(i) },
          }),
        ]),
      );
    });
    return host;
  }

  function renderExercise(): void {
    const head = h("section", { class: "card live-ex-head" }, [
      h("span", { class: `badge badge-${equipment}`, text: EQUIPMENT_LABELS[equipment] }),
      h("h2", { class: "now-name", text: MUSCLE_LABELS[muscle] }),
      h("p", {
        class: "now-eyebrow",
        text: `${MUSCLE_LABELS[muscle]} · ${EQUIPMENT_LABELS[equipment]}`,
      }),
    ]);

    container.append(h("h1", { class: "view-title", text: "Live Session" }), head, renderSetList());

    if (sub === "idle") {
      container.append(
        h("div", { class: "btn-row live-actions" }, [
          h("button", {
            class: "btn btn-primary btn-jumbo",
            type: "button",
            text: "▶ Start set",
            on: { click: startSet },
          }),
        ]),
        h("div", { class: "btn-row" }, [
          h("button", {
            class: "btn",
            type: "button",
            text: "✓ Done — finish exercise",
            on: { click: finishExercise },
          }),
        ]),
      );
      return;
    }

    if (sub === "running") {
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
        h("div", { class: "dial-center" }, [num, h("span", { class: "dial-label", text: "SET" })]),
      ]);

      container.append(
        dialWrap,
        h("div", { class: "btn-row live-actions" }, [
          h("button", {
            class: "btn btn-accent btn-jumbo",
            type: "button",
            text: "■ Stop",
            on: { click: stopSet },
          }),
        ]),
      );

      const frame = (): void => {
        setElapsedMs = Date.now() - setStartEpoch;
        const secs = setElapsedMs / 1000;
        num.textContent = formatClock(secs);
        fill.setAttribute("stroke-dashoffset", String(DIAL_C * (1 - ((secs % 60) / 60))));
        rafId = requestAnimationFrame(frame);
      };
      rafId = requestAnimationFrame(frame);
      return;
    }

    if (sub === "resting") {
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
        h("div", { class: "dial-center" }, [num, h("span", { class: "dial-label", text: "REST" })]),
      ]);

      const effortPanel = renderEffortPanel();

      container.append(
        h("p", { class: "set-time", text: "Resting — recover, then start your next set" }),
        dialWrap,
      );
      if (effortPanel) container.append(effortPanel);
      container.append(
        h("div", { class: "btn-row live-actions" }, [
          h("button", {
            class: "btn btn-primary btn-jumbo",
            type: "button",
            text: "▶ Start set",
            on: { click: startSet },
          }),
        ]),
        h("div", { class: "btn-row" }, [
          h("button", {
            class: "btn",
            type: "button",
            text: "✓ Done — finish exercise",
            on: { click: finishExercise },
          }),
        ]),
      );

      const frame = (): void => {
        const secs = (Date.now() - restStartEpoch) / 1000;
        num.textContent = formatClock(secs);
        fill.setAttribute("stroke-dashoffset", String(DIAL_C * (1 - ((secs % 60) / 60))));
        rafId = requestAnimationFrame(frame);
      };
      rafId = requestAnimationFrame(frame);
      return;
    }

    // sub === "logging"
    container.append(
      h("p", { class: "set-time", text: `Set time ${formatClock(setElapsedMs / 1000)}` }),
      h("div", { class: "card live-dials" }, [
        dialField({
          label: "Reps",
          value: setReps,
          step: 1,
          min: 0,
          integer: true,
          unit: "reps",
          tone: "signal",
          onCommit: (n) => {
            setReps = n;
            snapshot();
          },
        }),
        dialField({
          label: isBodyweight(equipment) ? "Added (kg)" : "Weight (kg)",
          value: setWeight,
          step: 2.5,
          min: 0,
          integer: false,
          unit: "kg",
          tone: "navy",
          onCommit: (n) => {
            setWeight = n;
            snapshot();
          },
        }),
      ]),
      h("div", { class: "btn-row live-actions" }, [
        h("button", {
          class: "btn btn-primary btn-jumbo",
          type: "button",
          text: "✓ Done",
          on: { click: commitSet },
        }),
      ]),
    );
  }

  // ─────────────────────────────── Render ─────────────────────────────────────

  function render(): void {
    stopRaf();
    clear(container);
    if (!state.activeLog) stage = "list";
    snapshot();
    if (stage === "list") renderList();
    else if (stage === "select") renderSelect();
    else renderExercise();
    window.scrollTo(0, 0);
  }

  restore();
  render();
  return () => stopRaf();
}
