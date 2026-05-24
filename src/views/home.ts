import { h } from "../dom";
import { loadProgress } from "../liveProgress";
import { getSession, loadSessions } from "../logStorage";
import { forceAppUpdate } from "../pwa";
import type { Nav } from "../router";
import { formatSessionDate, sessionSetCount } from "../util";

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

  root.appendChild(
    h("div", { class: "view view-home" }, [hero, trainingLane, routinesLane, updateCard]),
  );
}
