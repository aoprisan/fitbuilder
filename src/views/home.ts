import { clear, h } from "../dom";
import { loadProgress } from "../liveProgress";
import { getSession, loadSessions } from "../logStorage";
import { loadMode } from "../mode";
import { allMovements } from "../movements";
import { clearOneRm, loadOneRmMaxes, setOneRm } from "../oneRmStore";
import { forceAppUpdate } from "../pwa";
import {
  muscleRecovery,
  overallRecovery,
  overallStatus,
  systemicRecovery,
} from "../recovery";
import type { Nav } from "../router";
import { exerciseKeyLabel } from "../stats";
import { MUSCLE_LABELS } from "../types";
import { formatSessionDate, round2, sessionSetCount } from "../util";
import { recoveryRing, ringCell } from "./recovery";

export function mountHome(root: HTMLElement, nav: Nav): void {
  const sessions = loadSessions().sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const last = sessions[0];

  // A live session is in progress when there's a saved flow snapshot whose
  // session still exists — the same condition Live's restore() resumes from.
  const progress = loadProgress();
  const liveRunning = progress !== null && getSession(progress.sessionId) !== undefined;

  const hero = h("section", { class: "hero" }, [
    h("p", { class: "eyebrow", text: "GYM LOG" }),
    h("h1", { class: "display" }, ["Train · Log", h("br"), "Share"]),
    h("p", {
      class: "lede",
      text: "Two tools in one ledger — a live training log for your own workouts, and shareable routines for coaching. Use either; they hand off when you want.",
    }),
  ]);

  // ── Getting started — let Claude draft a first routine ────────────────────
  const claudeStartCard = h("section", { class: "card" }, [
    h("p", { class: "eyebrow", text: "New here?" }),
    h("h2", { class: "section-title", text: "Get a plan from Claude" }),
    h("p", {
      class: "plan-meta",
      text: "No coach yet? Answer three quick questions and let Claude draft a starting routine you can follow set-by-set.",
    }),
    h("div", { class: "btn-row" }, [
      h("button", {
        class: "btn btn-primary",
        text: "Get a plan from Claude",
        on: { click: () => nav.go("claudeStart") },
      }),
    ]),
  ]);

  // ── Lane 1: the athlete — log your own training, watch it add up ──────────
  const lastSets = last ? sessionSetCount(last) : 0;
  const lastLine = last
    ? h("p", {
        class: "plan-meta",
        text: `Last: ${last.name || "session"} · ${last.exercises.length} ex · ${lastSets} ${lastSets === 1 ? "set" : "sets"}`,
      })
    : h("p", { class: "plan-meta", text: "No sessions yet — start one when you reach the gym." });

  const trainingLane = h("section", { class: "card" }, [
    h("p", { class: "eyebrow", text: "For your training" }),
    h("h2", { class: "section-title", text: "Train & track" }),
    h("p", {
      class: "plan-meta",
      text: "Log a workout live, set by set, with rest timers — effort, hydration and progress add up in Stats.",
    }),
    lastLine,
    h("div", { class: "btn-row" }, [
      h("button", {
        class: "btn btn-primary",
        text: liveRunning ? "Resume Session" : "Start Live Session",
        on: { click: () => nav.go("live") },
      }),
      h("button", { class: "btn", text: "Progress Stats", on: { click: () => nav.go("stats") } }),
    ]),
  ]);

  // ── Recovery — how recovered each muscle is since it was last trained ──────
  function renderRecoveryCard(): HTMLElement {
    const recoveries = muscleRecovery(sessions);
    const trained = recoveries.some((r) => r.lastTrainedAt !== null);

    const body: HTMLElement[] = [
      h("p", { class: "eyebrow", text: "Readiness" }),
      h("h2", { class: "section-title", text: "Recovery" }),
    ];

    if (!trained) {
      body.push(
        h("p", {
          class: "plan-meta",
          text: "Log a session to start tracking how recovered each muscle is — red just-worked, green ready again.",
        }),
      );
    } else {
      const overall = overallRecovery(recoveries);
      const systemic = systemicRecovery(sessions);
      const top = recoveries[0]!; // least recovered
      const meta =
        top.recovered >= 1
          ? "All muscle groups recovered — ready for a new session."
          : `Most fatigued: ${MUSCLE_LABELS[top.muscle]} · ${Math.round(top.recovered * 100)}% (~${top.hoursRemaining}h to go).`;
      body.push(
        h("div", { class: "recovery-home-row" }, [
          h("div", { class: "recovery-rings" }, [
            ringCell(recoveryRing(overall, overallStatus(overall), { size: "sm" }), "Muscles"),
            ringCell(
              recoveryRing(systemic.readiness, overallStatus(systemic.readiness), { size: "sm" }),
              "Systemic",
            ),
          ]),
          h("p", { class: "plan-meta recovery-home-meta", text: meta }),
        ]),
      );
    }

    body.push(
      h("div", { class: "btn-row" }, [
        h("button", { class: "btn", text: "Recovery", on: { click: () => nav.go("recovery") } }),
      ]),
    );

    return h("section", { class: "card recovery-home" }, body);
  }

  // ── One-rep max — log a tested max from anywhere, not just mid-workout ─────
  function renderOneRmCard(): HTMLElement {
    const select = h(
      "select",
      { class: "onerm-log-select", aria: { label: "Lift to log a one-rep max for" } },
      allMovements().map((mv) => h("option", { value: mv.id, text: exerciseKeyLabel(mv.id) })),
    );
    const kgInput = h("input", {
      class: "onerm-log-input",
      type: "number",
      inputmode: "decimal",
      min: "0",
      step: "2.5",
      placeholder: "—",
      aria: { label: "Tested one-rep max in kg" },
    });
    const status = h("p", {
      class: "onerm-note",
      text: "Saved on this device per lift, and shown beside your Stats estimate.",
    });
    const listHost = h("div", { class: "saved-list onerm-log-list" });

    // Mirror the stored max for the chosen lift into the input.
    const syncInput = (): void => {
      const current = loadOneRmMaxes()[select.value];
      kgInput.value = current !== undefined ? String(current) : "";
    };

    const renderList = (): void => {
      clear(listHost);
      const entries = Object.entries(loadOneRmMaxes()).sort((a, b) =>
        exerciseKeyLabel(a[0]).localeCompare(exerciseKeyLabel(b[0])),
      );
      if (entries.length === 0) {
        listHost.appendChild(h("p", { class: "empty", text: "No maxes logged yet." }));
        return;
      }
      for (const [key, kg] of entries) {
        const label = exerciseKeyLabel(key);
        listHost.appendChild(
          h("div", { class: "onerm-log-row" }, [
            h("span", { class: "onerm-log-name", text: label }),
            h("span", { class: "onerm-log-kg", text: `${kg} kg` }),
            h("button", {
              class: "icon-btn danger",
              type: "button",
              text: "✕",
              aria: { label: `remove logged max for ${label}` },
              on: {
                click: () => {
                  clearOneRm(key);
                  renderList();
                  syncInput();
                },
              },
            }),
          ]),
        );
      }
    };

    select.addEventListener("change", syncInput);

    const saveBtn = h("button", {
      class: "btn btn-primary btn-small",
      type: "button",
      text: "Save max",
    });
    saveBtn.addEventListener("click", () => {
      const n = parseFloat(kgInput.value);
      const label = exerciseKeyLabel(select.value);
      if (Number.isFinite(n) && n > 0) {
        setOneRm(select.value, n);
        status.textContent = `Saved ${label} — ${round2(n)} kg.`;
      } else {
        clearOneRm(select.value);
        status.textContent = `Cleared ${label}.`;
      }
      renderList();
      syncInput();
    });

    syncInput();
    renderList();

    return h("section", { class: "card onerm-log" }, [
      h("p", { class: "eyebrow", text: "Personal records" }),
      h("h2", { class: "section-title", text: "One-rep max" }),
      h("p", {
        class: "plan-meta",
        text: "Log a max you tested — in or out of a workout. Pick the lift, enter the weight, and it shows up in Stats.",
      }),
      h("label", { class: "field" }, [h("span", { class: "field-label", text: "Lift" }), select]),
      h("label", { class: "field" }, [
        h("span", { class: "field-label", text: "Tested max (kg)" }),
        kgInput,
      ]),
      h("div", { class: "btn-row" }, [saveBtn]),
      status,
      listHost,
    ]);
  }

  // ── Lane 2: the coach — author routines, share them, run them ─────────────
  const routinesLane = h("section", { class: "card" }, [
    h("p", { class: "eyebrow", text: "For routines & coaching" }),
    h("h2", { class: "section-title", text: "Routines" }),
    h("p", {
      class: "plan-meta",
      text: "Build or import training routines and share them as PNG/PDF on WhatsApp — for a coach handing plans to students. Run one live to log it, or as a checklist.",
    }),
    h("div", { class: "btn-row" }, [
      h("button", { class: "btn btn-accent", text: "Routine Sheets", on: { click: () => nav.go("sheet") } }),
    ]),
  ]);

  const updateBtn = h("button", {
    class: "btn btn-small",
    text: "Update app",
    aria: { label: "Update app to the latest version" },
  });
  updateBtn.addEventListener("click", () => {
    updateBtn.disabled = true;
    updateBtn.textContent = "Updating…";
    void forceAppUpdate();
  });

  const updateCard = h("section", { class: "card" }, [
    h("h2", { class: "section-title", text: "Updates" }),
    h("p", {
      class: "plan-meta",
      text: "Pull the latest version and refresh this installed copy.",
    }),
    h("div", { class: "btn-row" }, [updateBtn]),
    h("p", { class: "build-stamp", text: `Build ${formatSessionDate(__BUILD_TIME__)}` }),
  ]);

  // Hard gate: Home shows only the active mode's lane. Student = train/track,
  // recovery, personal records, and the Claude getting-started draft (so a
  // student without a coach can still get a starting plan); Trainer = authoring.
  const cards =
    loadMode() === "trainer"
      ? [hero, routinesLane, updateCard]
      : [hero, trainingLane, claudeStartCard, renderRecoveryCard(), renderOneRmCard(), updateCard];

  root.appendChild(h("div", { class: "view view-home" }, cards));
}
