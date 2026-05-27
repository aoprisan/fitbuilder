import { h } from "../dom";
import { loadProgress } from "../liveProgress";
import { getSession } from "../logStorage";
import type { Nav } from "../router";
import { singleRoutineSheet } from "../sheet";
import { loadSheets } from "../sheetStorage";

/**
 * The student-side "Train" landing — the single entry point that unifies the
 * two ways to train: a freestyle live session (logged set-by-set with timers),
 * or following one of your routines as a guided run. Both feed the same log;
 * this screen just routes to the existing Live and Execute runners.
 */
export function mountTrain(root: HTMLElement, nav: Nav): void {
  // Mirror home/main's resumable-session check so the button reads correctly.
  const progress = loadProgress();
  const liveRunning = progress !== null && getSession(progress.sessionId) !== undefined;

  const hero = h("section", { class: "hero" }, [
    h("p", { class: "eyebrow", text: "TRAIN" }),
    h("h1", { class: "display", text: "Train" }),
    h("p", {
      class: "lede",
      text: "Train freestyle and log as you go, or follow one of your routines set-by-set. Either way it lands in your log.",
    }),
  ]);

  // ── Freestyle — the owner's own, unplanned session ────────────────────────
  const freestyle = h("section", { class: "card" }, [
    h("p", { class: "eyebrow", text: "No plan" }),
    h("h2", { class: "section-title", text: "Freestyle" }),
    h("p", {
      class: "plan-meta",
      text: "Pick exercises as you go, with a stopwatch and rest timer. Best when you're improvising.",
    }),
    h("div", { class: "btn-row" }, [
      h("button", {
        class: "btn btn-primary",
        text: liveRunning ? "Resume Session" : "Start Freestyle",
        on: { click: () => nav.go("live") },
      }),
    ]),
  ]);

  // ── Follow a plan — run a routine from the library, set-by-set ────────────
  const planBody: HTMLElement[] = [
    h("p", { class: "eyebrow", text: "Follow a plan" }),
    h("h2", { class: "section-title", text: "Run a routine" }),
  ];

  const sheets = loadSheets();
  const rows: HTMLElement[] = [];
  sheets.forEach((sheet) => {
    sheet.routines.forEach((routine, i) => {
      const exCount = routine.exercises.filter(
        (e) => e.name.trim() !== "" || e.prescription.trim() !== "",
      ).length;
      if (exCount === 0) return;
      rows.push(
        h("button", {
          class: "btn train-plan-row",
          type: "button",
          aria: { label: `run routine ${routine.title || "Routine"}` },
          on: { click: () => nav.runSheet(singleRoutineSheet(sheet, routine, i)) },
        }, [
          h("span", { class: "train-plan-title", text: routine.title || "Untitled routine" }),
          h("span", {
            class: "train-plan-meta",
            text: `${sheet.name} · ${exCount} ${exCount === 1 ? "exercise" : "exercises"}`,
          }),
        ]),
      );
    });
  });

  if (rows.length === 0) {
    planBody.push(
      h("p", {
        class: "empty",
        text: "No routines yet — open a routine you were sent, or switch to Trainer mode to build one.",
      }),
    );
  } else {
    planBody.push(
      h("p", { class: "plan-meta", text: "Tap a routine to run it and tick off each set." }),
      h("div", { class: "train-plan-list" }, rows),
    );
  }

  const plan = h("section", { class: "card" }, planBody);

  root.appendChild(h("div", { class: "view view-train" }, [hero, freestyle, plan]));
}
