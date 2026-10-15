import { h } from "../dom";
import { repeatSession } from "../log";
import { clearProgress, loadProgress } from "../liveProgress";
import { deleteEmptySessions, loadSessions, saveSession } from "../logStorage";
import { muscleRecovery } from "../recovery";
import { WEEKLY_PRODUCTIVE_MIN, weeklyMuscleVolume } from "../stats";
import { setActiveLog } from "../state";
import { MUSCLE_LABELS } from "../types";
import { t } from "../i18n";
import type { LiveCtx } from "./liveState";

/* =============================================================================
   The Train tab with no session open: Start, a one-tap repeat of the last
   session, and the ready / recovering / behind-on-volume brief.
   Rendered by views/live.ts through the shared LiveCtx.
   ========================================================================== */

// ───────────────────────────── List screen ──────────────────────────────────

export function renderList(ctx: LiveCtx): void {
  // Clear out sessions that were started but never logged (abandoned via a
  // tab switch). We're on the list screen, so nothing is in flight; spare any
  // still-resumable session just in case a snapshot points at an empty one.
  deleteEmptySessions(loadProgress()?.sessionId);
  const count = loadSessions().length;

  ctx.container.append(
    h("h1", { class: "view-title", text: t("Train") }),
    h("p", {
      class: "lede",
      text: t("Start a session, pick an exercise, then time each set and log reps and weight."),
    }),
    h("div", { class: "btn-row" }, [
      h("button", {
        class: "btn btn-primary btn-jumbo",
        type: "button",
        text: t("▶ Start session"),
        on: { click: ctx.startSession },
      }),
    ]),
    ...(count > 0 ? renderTrainBrief(ctx) : []),
    ...(count > 0
      ? [
          h("p", {
            class: "plan-meta plan-note",
            text: t("Past sessions — and the Claude analysis — live in History."),
          }),
          h("div", { class: "btn-row" }, [
            h("button", {
              class: "btn btn-small",
              type: "button",
              text: t("History ▸"),
              on: { click: () => ctx.nav.go("history") },
            }),
          ]),
        ]
      : []),
  );
}

/**
 * What to train, before a session starts: a one-tap repeat of the last
 * session, which muscles are ready vs. still on the recovery clock, and
 * which are short of a productive week's volume.
 */
export function renderTrainBrief(ctx: LiveCtx): HTMLElement[] {
  const { st } = ctx;
  const sessions = loadSessions();
  const out: HTMLElement[] = [];

  const last = [...sessions]
    .filter((x) => x.exercises.some((ex) => ex.sets.length > 0))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  if (last) {
    out.push(
      h("div", { class: "btn-row" }, [
        h("button", {
          class: "btn",
          type: "button",
          text: t("↻ Repeat {0}").replace("{0}", last.name || t("this session")),
          aria: { label: t("Start a new session with the same exercises as your last one.") },
          on: {
            click: () => {
              setActiveLog(saveSession(repeatSession(last)));
              clearProgress();
              st.currentEx = null;
              st.sub = "idle";
              st.stage = "select";
              ctx.render();
            },
          },
        }),
      ]),
    );
  }

  const trained = muscleRecovery(sessions).filter(
    (r) => r.lastTrainedAt !== null && r.muscle !== "cardio",
  );
  const ready = trained.filter((r) => r.recovered >= 1).map((r) => t(MUSCLE_LABELS[r.muscle]));
  const recovering = trained
    .filter((r) => r.recovered < 1)
    .map((r) => `${t(MUSCLE_LABELS[r.muscle])} ~${r.hoursRemaining}h`);
  const behind = weeklyMuscleVolume(sessions)
    .filter((v) => v.muscle !== "cardio" && v.sets > 0 && v.sets < WEEKLY_PRODUCTIVE_MIN)
    .sort((a, b) => a.sets - b.sets)
    .slice(0, 6)
    .map((v) =>
      `${t(MUSCLE_LABELS[v.muscle])} ${t("{0}/{1} sets")
        .replace("{0}", String(Math.round(v.sets * 10) / 10))
        .replace("{1}", String(WEEKLY_PRODUCTIVE_MIN))}`,
    );

  const row = (label: string, items: readonly string[]): HTMLElement =>
    h("div", { class: "train-brief-row" }, [
      h("p", { class: "eyebrow", text: label }),
      h("p", { class: "train-brief-items", text: items.join(" · ") }),
    ]);
  const rows: HTMLElement[] = [];
  if (recovering.length > 0) {
    rows.push(row(t("Still recovering"), recovering));
    if (ready.length > 0) rows.push(row(t("Ready now"), ready));
  } else if (trained.length > 0) {
    rows.push(h("p", { class: "plan-meta plan-note", text: t("Everything you've trained is recovered.") }));
  }
  if (behind.length > 0) rows.push(row(t("Behind on volume this week"), behind));
  if (rows.length > 0) out.push(h("section", { class: "card train-brief" }, rows));
  return out;
}
