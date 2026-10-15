import { h } from "../dom";
import { repeatSession } from "../log";
import { clearProgress, loadProgress } from "../liveProgress";
import { deleteEmptySessions, loadSessions, saveSession } from "../logStorage";
import { muscleRecovery } from "../recovery";
import { WEEKLY_PRODUCTIVE_MIN, weeklyMuscleVolume } from "../stats";
import { setActiveLog } from "../state";
import { MUSCLE_LABELS } from "../types";
import { registerTranslations, t } from "../i18n";
import {
  deleteTemplate,
  loadTemplates,
  saveTemplate,
  sessionFromTemplate,
  type WorkoutTemplate,
} from "../templateStore";
import type { LiveCtx } from "./liveState";
import { showUndo } from "./snackbar";

registerTranslations({
  Templates: "Șabloane",
  "Save a session as a template from History to start it here in one tap.":
    "Salvează o sesiune ca șablon din Istoric ca s-o pornești de aici dintr-o atingere.",
  "▶ {0}": "▶ {0}",
  "start {0}": "pornește {0}",
  "delete template {0}": "șterge șablonul {0}",
  "{0} exercises": "{0} exerciții",
  "1 exercise": "1 exercițiu",
  'Deleted template "{0}".': "S-a șters șablonul „{0}”.",
});

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
    ...renderTemplates(ctx),
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

/** Start the session a template describes and land on its exercise list. */
function startFromTemplate(ctx: LiveCtx, tpl: WorkoutTemplate): void {
  setActiveLog(saveSession(sessionFromTemplate(tpl)));
  clearProgress();
  ctx.st.currentEx = null;
  ctx.st.sub = "idle";
  ctx.st.stage = "select";
  ctx.render();
}

/**
 * Saved workout templates, one tap each. Shown only once at least one exists;
 * with sessions logged but no templates yet, a one-line hint says where they
 * come from.
 */
function renderTemplates(ctx: LiveCtx): HTMLElement[] {
  const templates = loadTemplates();
  if (templates.length === 0) {
    return loadSessions().length > 0
      ? [
          h("p", {
            class: "plan-meta plan-note",
            text: t("Save a session as a template from History to start it here in one tap."),
          }),
        ]
      : [];
  }
  const rows = templates.map((tpl) =>
    h("div", { class: "template-row" }, [
      h("button", {
        class: "btn template-start",
        type: "button",
        text: t("▶ {0}").replace("{0}", tpl.name),
        aria: { label: t("start {0}").replace("{0}", tpl.name) },
        on: { click: () => startFromTemplate(ctx, tpl) },
      }),
      h("span", {
        class: "plan-meta",
        text:
          tpl.exercises.length === 1
            ? t("1 exercise")
            : t("{0} exercises").replace("{0}", String(tpl.exercises.length)),
      }),
      h("button", {
        class: "btn btn-tiny danger",
        type: "button",
        text: "✕",
        aria: { label: t("delete template {0}").replace("{0}", tpl.name) },
        on: {
          click: () => {
            deleteTemplate(tpl.id);
            ctx.render();
            showUndo(t('Deleted template "{0}".').replace("{0}", tpl.name), () => {
              saveTemplate(tpl);
              ctx.render();
            });
          },
        },
      }),
    ]),
  );
  return [
    h("section", { class: "card templates-card" }, [
      h("p", { class: "eyebrow", text: t("Templates") }),
      ...rows,
    ]),
  ];
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
