import { clear, h } from "../dom";
import { estimateProteinG, muscleBreakdown, readEffort, readHydration } from "../effort";
import { parseTargetReps } from "../execute";
import {
  analyzeSessionInClaude,
  analyzeSessionsInClaude,
  type AnalyzeResult,
  exportSessionPdf,
  exportSessionPng,
  exportSessionsJson,
  exportSessionsXml,
  shareSession,
} from "../exporters";
import { newLoggedExercise, newTrainingSession, repeatSession } from "../log";
import { clearProgress, loadProgress, saveProgress, type SelectMode } from "../liveProgress";
import { deleteSession, getSession, loadSessions, saveSession } from "../logStorage";
import {
  compoundMovements,
  findMovement,
  type Movement,
  movementsForMuscle,
  muscleShares,
} from "../movements";
import type { Cleanup, Nav } from "../router";
import { saveSheet } from "../sheetStorage";
import { setActiveLog, setEditingSheet, setSheetFlash, state } from "../state";
import {
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
import {
  cloneSheet,
  formatClock,
  formatLoad,
  formatSessionDate,
  sessionSetCount,
  sessionToSheet,
  sessionVolume,
} from "../util";
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

/** Total reps logged across an exercise's sets — used for the routine target tally. */
function sumReps(sets: readonly WorkSet[]): number {
  return sets.reduce((a, s) => a + s.reps, 0);
}

/** Top-level place in the live flow. */
type Stage = "list" | "select" | "exercise";
/** Where we are within a single exercise. */
type SetSub = "idle" | "running" | "logging" | "resting";

export function mountLive(root: HTMLElement, nav: Nav): Cleanup {
  const container = h("div", { class: "view view-live" });
  root.appendChild(container);

  let stage: Stage = state.activeLog ? "select" : "list";
  let sub: SetSub = "idle";

  // Pending exercise selection (becomes a LoggedExercise on the first logged set).
  let muscle: MuscleGroup = "chest";
  let equipment: Equipment = "dumbbell";
  // Selected catalog movement; drives the exercise name, load type, and secondary muscles.
  let movementId = "";
  // Which exercise picker the select screen shows: muscle+gear ("custom") or compound lifts.
  let selectMode: SelectMode = "custom";
  let currentEx: LoggedExercise | null = null;

  /** Point the selection at a movement id, syncing the derived muscle + load type. */
  function selectMovement(id: string): void {
    const mv = findMovement(id);
    if (!mv) return;
    movementId = mv.id;
    muscle = mv.primaryMuscle;
    equipment = mv.equipment;
  }

  /** Switch muscle group and reset the movement to that group's first option. */
  function selectMuscle(m: MuscleGroup): void {
    muscle = m;
    const first = movementsForMuscle(m)[0];
    if (first) selectMovement(first.id);
  }

  /** Ensure the current movement belongs to the current muscle; default if not. */
  function ensureMovement(): void {
    const movements = movementsForMuscle(muscle);
    if (!movements.some((mv) => mv.id === movementId)) {
      const first = movements[0];
      if (first) selectMovement(first.id);
    }
  }

  /** Ensure the selection points at a compound lift; default to the first one if not. */
  function ensureCompound(): void {
    const compounds = compoundMovements();
    if (!compounds.some((mv) => mv.id === movementId)) {
      const first = compounds[0];
      if (first) selectMovement(first.id);
    }
  }

  /**
   * The next planned-but-not-started exercise in a routine-loaded session: the
   * first with a carried prescription and no sets yet. Drives the select screen.
   */
  function nextPlanned(): LoggedExercise | undefined {
    return state.activeLog?.exercises.find(
      (ex) => ex.sets.length === 0 && ex.prescription !== undefined,
    );
  }

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

  // ───────────────────── Export / share (PNG · PDF · share) ───────────────────

  // Persists across re-renders because the element is reused, not recreated.
  const statusEl = h("p", { class: "status", role: "status", aria: { live: "polite" } });
  const setStatus = (msg: string, kind: "ok" | "err" | "info"): void => {
    statusEl.textContent = msg;
    statusEl.className = `status status-${kind}`;
  };
  const analyzeMsg = (result: AnalyzeResult): string =>
    result === "copied-opened"
      ? "Copied your log — paste it into the new Claude chat."
      : result === "copied"
        ? "Copied to clipboard — open Claude and paste."
        : "Clipboard unavailable — saved a Markdown file instead.";

  // Guard against double-taps while an (async) render/encode runs.
  let busy = false;
  async function runExport(label: string, fn: () => Promise<void>): Promise<void> {
    if (busy) return;
    busy = true;
    setStatus(`${label}…`, "info");
    try {
      await fn();
      setStatus(`${label} ready.`, "ok");
    } catch {
      setStatus(`Could not ${label.toLowerCase()}. Try again.`, "err");
    } finally {
      busy = false;
    }
  }

  /** Share / PNG / PDF row for one session's recap (effort + exercise ledger). */
  function sessionExportRow(s: TrainingSession): HTMLElement {
    const all = (): TrainingSession[] => loadSessions();
    return h("div", { class: "btn-row saved-actions" }, [
      h("button", {
        class: "btn btn-small btn-accent",
        type: "button",
        text: "Share ▸",
        aria: { label: `share ${s.name || "this session"}` },
        on: {
          click: () =>
            runExport("Share", async () => {
              const result = await shareSession(s, all());
              setStatus(
                result === "shared"
                  ? "Opened the share sheet — pick WhatsApp."
                  : "Sharing isn't available here, so the PNG was downloaded instead.",
                "ok",
              );
            }),
        },
      }),
      h("button", {
        class: "btn btn-small",
        type: "button",
        text: "PNG",
        aria: { label: `save ${s.name || "this session"} as PNG` },
        on: { click: () => runExport("Save PNG", () => exportSessionPng(s, all())) },
      }),
      h("button", {
        class: "btn btn-small",
        type: "button",
        text: "PDF",
        aria: { label: `save ${s.name || "this session"} as PDF` },
        on: { click: () => runExport("Save PDF", () => exportSessionPdf(s, all())) },
      }),
    ]);
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
      movementId,
      selectMode,
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
    movementId = saved.movementId;
    selectMode = saved.selectMode;
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
    selectMuscle("chest");
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

  /** Start a new session pre-loaded with a past session's exercises (no sets yet). */
  function repeatPastSession(src: TrainingSession): void {
    setActiveLog(saveSession(repeatSession(src)));
    currentEx = null;
    sub = "idle";
    stage = "select";
    render();
  }

  /** Save a logged session as a shareable routine, then open it in the Routines view. */
  function saveAsRoutine(s: TrainingSession): void {
    if (sessionSetCount(s) === 0) return;
    const sheet = saveSheet(sessionToSheet(s));
    setEditingSheet(cloneSheet(sheet));
    setSheetFlash(`Saved “${sheet.name}” as a routine — share it from here.`, "ok");
    nav.go("sheet");
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

  /** Re-open an exercise already in the session to add more sets (or review them). */
  function resumeExercise(ex: LoggedExercise): void {
    currentEx = ex;
    muscle = ex.muscle;
    equipment = ex.equipment;
    movementId = ex.exerciseId ?? `${ex.muscle}::${ex.equipment}`;
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
      const mv = findMovement(movementId);
      if (!mv) return;
      currentEx = newLoggedExercise(mv);
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

  // ──────────────────────── Session summary panel ─────────────────────────────

  /**
   * Effort gauge, hydration cue, per-muscle work (volume + time) and a recovery
   * protein estimate for a session — running or completed. The effort gauge is
   * calibrated against the user's other sessions in `allSessions`. Returns null
   * until the session has at least one logged set.
   */
  function renderSessionSummary(
    session: TrainingSession,
    allSessions: TrainingSession[],
  ): HTMLElement | null {
    if (sessionSetCount(session) === 0) return null;

    const effort = readEffort(session, allSessions);
    const hydration = readHydration(effort);
    const muscles = muscleBreakdown(session);
    const protein = estimateProteinG(effort, muscles.length);
    const pct = Math.round(Math.min(1, effort.ratio) * 100);

    const fill = h("div", { class: "effort-bar-fill" });
    fill.style.width = `${Math.min(1, effort.ratio) * 100}%`;

    const meta =
      effort.vsTypicalPct !== null
        ? `${effort.vsTypicalPct}% of your usual session`
        : "Building your baseline — fills toward a full session";

    const glasses = `${hydration.glasses} ${hydration.glasses === 1 ? "glass" : "glasses"}`;

    const muscleRows = muscles.map((m) =>
      h("div", { class: "muscle-row" }, [
        h("span", { class: "muscle-name", text: MUSCLE_LABELS[m.muscle] }),
        h("span", {
          class: "muscle-stat",
          text: `${m.volume > 0 ? `${m.volume} kg` : "Bodyweight"} · ${formatClock(m.timeSec)}`,
        }),
      ]),
    );

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
      h("div", { class: "summary-muscles" }, [
        h("span", { class: "summary-label", text: "Muscles worked" }),
        ...muscleRows,
      ]),
      h("div", { class: "hydration-row" }, [
        h("span", { class: "hydration-label", text: "Hydration" }),
        h("span", {
          class: "hydration-figure",
          text: `≈ ${hydration.liters.toFixed(1)} L · ${glasses}`,
        }),
      ]),
      h("p", { class: "hydration-note", text: hydration.note }),
      h("div", { class: "protein-row" }, [
        h("span", { class: "protein-label", text: "Protein to recover" }),
        h("span", { class: "protein-figure", text: `≈ ${protein} g` }),
      ]),
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
      sessions.forEach((s) => listHost.appendChild(renderSessionCard(s, sessions)));
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
      statusEl,
      listHost,
    );

    if (sessions.length > 0) container.append(renderExportPanel(sessions));
  }

  /**
   * "Export all" panel — downloads every logged session as one JSON or XML
   * archive for import into other tools. Sessions are ordered oldest-first so
   * the export reads chronologically.
   */
  function renderExportPanel(sessions: TrainingSession[]): HTMLElement {
    const chronological = [...sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    return h("section", { class: "card live-export" }, [
      h("h2", { class: "section-title", text: "Export sessions" }),
      h("p", {
        class: "plan-meta",
        text: `Download all ${sessions.length} logged ${sessions.length === 1 ? "session" : "sessions"} to import into other tools and analyse elsewhere.`,
      }),
      h("div", { class: "btn-row" }, [
        h("button", {
          class: "btn btn-small btn-accent",
          type: "button",
          text: "Analyze in Claude ▸",
          aria: { label: "analyse all logged sessions in Claude" },
          on: {
            click: () =>
              runExport("Analyze in Claude", async () => {
                setStatus(analyzeMsg(await analyzeSessionsInClaude(chronological)), "ok");
              }),
          },
        }),
        h("button", {
          class: "btn btn-small",
          type: "button",
          text: "Download JSON",
          on: { click: () => exportSessionsJson(chronological) },
        }),
        h("button", {
          class: "btn btn-small",
          type: "button",
          text: "Download XML",
          on: { click: () => exportSessionsXml(chronological) },
        }),
      ]),
    ]);
  }

  function renderSessionCard(s: TrainingSession, allSessions: TrainingSession[]): HTMLElement {
    const sets = sessionSetCount(s);
    const vol = sessionVolume(s);
    const meta =
      `${s.exercises.length} exercises · ${sets} sets` + (vol > 0 ? ` · ${vol} kg lifted` : "");
    const summary = renderSessionSummary(s, allSessions);
    return h("section", { class: "card saved-item" }, [
      h("div", { class: "saved-info" }, [
        h("p", { class: "plan-name", text: s.name || "Untitled session" }),
        h("p", { class: "plan-meta", text: formatSessionDate(s.startedAt) }),
        h("p", { class: "plan-meta", text: meta }),
      ]),
      ...(summary
        ? [
            h("details", { class: "session-summary-toggle" }, [
              h("summary", { class: "session-summary-label", text: "Effort & recovery" }),
              summary,
            ]),
          ]
        : []),
      h("div", { class: "btn-row saved-actions" }, [
        h("button", {
          class: "btn btn-accent btn-small",
          type: "button",
          text: "Resume",
          on: { click: () => openSession(s.id) },
        }),
        h("button", {
          class: "btn btn-small",
          type: "button",
          text: "Repeat",
          aria: { label: `repeat ${s.name || "this session"} as a new session` },
          on: { click: () => repeatPastSession(s) },
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
      ...(sets > 0
        ? [
            h("div", { class: "btn-row saved-actions" }, [
              h("button", {
                class: "btn btn-small",
                type: "button",
                text: "Save as routine",
                aria: { label: `save ${s.name || "this session"} as a shareable routine` },
                on: { click: () => saveAsRoutine(s) },
              }),
              h("button", {
                class: "btn btn-small",
                type: "button",
                text: "Export JSON",
                aria: { label: `export ${s.name || "this session"} as JSON` },
                on: { click: () => exportSessionsJson([s]) },
              }),
              h("button", {
                class: "btn btn-small btn-accent",
                type: "button",
                text: "Analyze in Claude ▸",
                aria: { label: `analyse ${s.name || "this session"} in Claude` },
                on: {
                  click: () =>
                    runExport("Analyze in Claude", async () => {
                      setStatus(analyzeMsg(await analyzeSessionInClaude(s)), "ok");
                    }),
                },
              }),
            ]),
            sessionExportRow(s),
          ]
        : []),
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

    // In a routine-loaded session, the next planned exercise drives this screen;
    // sync the toggles to its current selection so the user can confirm it.
    const planned = nextPlanned();
    if (planned) {
      muscle = planned.muscle;
      if (planned.exerciseId) {
        movementId = planned.exerciseId;
      } else {
        // No catalog identity yet (free-text routine row): pre-highlight only a
        // generic-gear option matching its load, never a named lift it didn't ask for.
        const match = movementsForMuscle(muscle).find(
          (mv) => mv.id.includes("::") && mv.equipment === planned.equipment,
        );
        if (match) movementId = match.id;
      }
    }
    if (selectMode === "compound") ensureCompound();
    else ensureMovement();

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

    // Only exercises with logged sets — planned-but-untouched rows live in the
    // "next exercise" card instead, so they aren't duplicated here.
    const doneHost = h("div", { class: "live-done-list" });
    const logged = session.exercises.filter((ex) => ex.sets.length > 0);
    if (logged.length > 0) {
      doneHost.append(
        h("p", { class: "field-label", text: "Logged so far — tap to add sets" }),
        ...logged.map((ex) =>
          h("button", {
            class: "btn btn-small live-done-row",
            type: "button",
            text: `${ex.name} — ${ex.sets.length} ${ex.sets.length === 1 ? "set" : "sets"}`,
            aria: { label: `log sets for ${ex.name}` },
            on: { click: () => resumeExercise(ex) },
          }),
        ),
      );
    }

    const summary = renderSessionSummary(session, loadSessions());

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
    if (summary) {
      container.append(summary, sessionExportRow(session), statusEl);
    }

    // Toggle picks update the view-level selection, and — when confirming a
    // planned routine exercise — write straight onto it so the choice sticks.
    const applyMovementToPlanned = (ex: LoggedExercise): void => {
      const mv = findMovement(movementId);
      if (!mv) return;
      ex.muscle = mv.primaryMuscle;
      ex.equipment = mv.equipment;
      ex.exerciseId = mv.id;
      if (mv.secondaryMuscles.length > 0) ex.secondaryMuscles = [...mv.secondaryMuscles];
      else delete ex.secondaryMuscles;
    };
    const pickMuscle = (m: string): void => {
      selectMuscle(m as MuscleGroup);
      if (planned) {
        applyMovementToPlanned(planned);
        persist();
      }
      render();
    };
    const pickMovement = (id: string): void => {
      selectMovement(id);
      if (planned) {
        applyMovementToPlanned(planned);
        persist();
      }
      render();
    };
    const pickMode = (m: string): void => {
      selectMode = m as SelectMode;
      if (selectMode === "compound") ensureCompound();
      else ensureMovement();
      if (planned) {
        applyMovementToPlanned(planned);
        persist();
      }
      render();
    };

    // The muscle split of the picked compound lift, as bars summing to 100%.
    const renderMuscleShares = (mv: Movement): HTMLElement =>
      h("div", { class: "field" }, [
        h("span", { class: "field-label", text: "Muscles worked" }),
        h(
          "div",
          { class: "muscle-shares" },
          muscleShares(mv).map((s) => {
            const fill = h("div", { class: "muscle-share-fill" });
            fill.style.width = `${s.pct}%`;
            return h("div", { class: "muscle-share" }, [
              h("span", { class: "muscle-share-name", text: MUSCLE_LABELS[s.muscle] }),
              h("div", { class: "muscle-share-bar" }, [fill]),
              h("span", { class: "muscle-share-pct", text: `${s.pct}%` }),
            ]);
          }),
        ),
      ]);

    // The exercise picker swaps shape by mode: muscle + gear, or compound lifts
    // with their muscle split. The mode toggle sits above both.
    const compounds = compoundMovements();
    const selectedCompound = findMovement(movementId);
    const picker =
      selectMode === "compound"
        ? compounds.length === 0
          ? [h("p", { class: "empty", text: "No compound lifts in the catalog yet." })]
          : [
              renderToggle(
                "Compound lift",
                compounds.map((mv) => mv.id),
                (id) => findMovement(id)?.name ?? id,
                movementId,
                pickMovement,
              ),
              ...(selectedCompound && selectedCompound.secondaryMuscles.length > 0
                ? [renderMuscleShares(selectedCompound)]
                : []),
            ]
        : [
            renderToggle("Muscle group", MUSCLE_GROUPS, (m) => MUSCLE_LABELS[m as MuscleGroup], muscle, pickMuscle),
            renderToggle(
              "Exercise",
              movementsForMuscle(muscle).map((mv) => mv.id),
              (id) => findMovement(id)?.name ?? id,
              movementId,
              pickMovement,
            ),
          ];

    container.append(
      h("section", { class: "card live-select" }, [
        h("h2", { class: "section-title", text: planned ? planned.name || "Next exercise" : "Next exercise" }),
        ...(planned && planned.prescription
          ? [h("p", { class: "now-target", text: planned.prescription })]
          : []),
        renderToggle(
          "Mode",
          ["custom", "compound"],
          (m) => (m === "compound" ? "Compound" : "Custom"),
          selectMode,
          pickMode,
        ),
        ...picker,
        h("div", { class: "btn-row" }, [
          h("button", {
            class: "btn btn-primary",
            type: "button",
            text: planned ? "Start →" : "Next →",
            on: { click: planned ? () => resumeExercise(planned) : startExercise },
          }),
          ...(planned
            ? [
                h("button", {
                  class: "btn",
                  type: "button",
                  text: "+ Add off-plan",
                  aria: { label: "add an exercise that isn't in the routine" },
                  on: { click: startExercise },
                }),
              ]
            : []),
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
    const mv = findMovement(movementId);
    const exName = currentEx?.name ?? mv?.name ?? MUSCLE_LABELS[muscle];
    const secondaries = currentEx?.secondaryMuscles ?? mv?.secondaryMuscles ?? [];
    const worked = [muscle, ...secondaries].map((m) => MUSCLE_LABELS[m]).join(" · ");
    const head = h("section", { class: "card live-ex-head" }, [
      h("span", { class: `badge badge-${equipment}`, text: EQUIPMENT_LABELS[equipment] }),
      h("h2", { class: "now-name", text: exName }),
      h("p", {
        class: "now-eyebrow",
        text: `${worked} · ${EQUIPMENT_LABELS[equipment]}`,
      }),
    ]);

    container.append(h("h1", { class: "view-title", text: "Live Session" }), head, renderSetList());

    // Routine target: when this exercise carries a prescription that parses to a
    // rep count, show how far the logged reps have filled it (reuses Execute's UI).
    const pres = currentEx?.prescription;
    const target = pres !== undefined ? parseTargetReps(pres) : null;
    if (currentEx && pres !== undefined && target !== null && target > 0) {
      const logged = sumReps(currentEx.sets);
      const pct = Math.round(Math.min(1, logged / target) * 100);
      const fill = h("div", { class: "progress-fill" });
      fill.style.width = `${pct}%`;
      container.append(
        h("p", { class: "now-target", text: pres }),
        h("p", { class: "now-tally" }, [
          h("span", { class: "tally-done", text: String(logged) }),
          h("span", { class: "tally-sep", text: "/" }),
          h("span", { class: "tally-target", text: String(target) }),
          h("span", { class: "tally-unit", text: "reps" }),
        ]),
        h(
          "div",
          {
            class: "progress now-progress",
            role: "progressbar",
            aria: { valuemin: "0", valuemax: "100", valuenow: String(pct), label: "Target progress" },
          },
          [fill],
        ),
      );
    }

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

      const summary = state.activeLog
        ? renderSessionSummary(state.activeLog, loadSessions())
        : null;

      container.append(
        h("p", { class: "set-time", text: "Resting — recover, then start your next set" }),
        dialWrap,
      );
      if (summary) container.append(summary);
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

    // sub === "logging" — the ✓ Done button sits above the dials so you don't
    // have to swipe down across the weight knob (which would rotate it) to reach it.
    container.append(
      h("p", { class: "set-time", text: `Set time ${formatClock(setElapsedMs / 1000)}` }),
      h("div", { class: "btn-row live-actions" }, [
        h("button", {
          class: "btn btn-primary btn-jumbo",
          type: "button",
          text: "✓ Done",
          on: { click: commitSet },
        }),
      ]),
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
