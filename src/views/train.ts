import { formatRelativeAgo, summarizeAdherence } from "../adherence";
import { append, clear, h } from "../dom";
import { registerTranslations, t } from "../i18n";
import { loadProgress } from "../liveProgress";
import { getSession, loadSessions } from "../logStorage";
import type { Nav } from "../router";
import { singleRoutineSheet, singleRoutineSheetId } from "../sheet";
import { deleteSheet, loadSheets, saveSheet } from "../sheetStorage";

registerTranslations({
  Train: "Antrenament",
  "Train freestyle and log as you go, or follow one of your routines set-by-set. Either way it lands in your log.":
    "Antrenează-te liber și înregistrează pe parcurs sau urmează una dintre rutinele tale serie cu serie. Oricum ar fi, ajunge în jurnalul tău.",
  "No plan": "Fără plan",
  Freestyle: "Liber",
  "Pick exercises as you go, with a stopwatch and rest timer. Best when you're improvising.":
    "Alege exerciții pe parcurs, cu cronometru și temporizator de pauză. Ideal când improvizezi.",
  "Resume Session": "Reia sesiunea",
  "Start Freestyle": "Pornește liber",
  "Follow a plan": "Urmează un plan",
  "Run a routine": "Rulează o rutină",
  "Untitled routine": "Rutină fără titlu",
  "Not yet run": "Încă nerulată",
  "1 run": "1 rulare",
  "{0} runs": "{0} rulări",
  "last {0}": "ultima {0}",
  "{0}% on plan": "{0}% conform planului",
  "run routine {0}": "rulează rutina {0}",
  "{0} · {1} {2}": "{0} · {1} {2}",
  exercise: "exercițiu",
  exercises: "exerciții",
  Delete: "Șterge",
  "delete routine {0}": "șterge rutina {0}",
  'Delete "{0}"? This cannot be undone.': 'Ștergi „{0}”? Această acțiune nu poate fi anulată.',
  "No routines yet — open one you were sent, or get a starting plan from Claude.":
    "Încă nicio rutină — deschide una care ți-a fost trimisă sau obține un plan de început de la Claude.",
  "Get a plan from Claude": "Obține un plan de la Claude",
  "Tap a routine to run it and tick off each set.":
    "Atinge o rutină pentru a o rula și bifează fiecare serie.",
});

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
    h("p", { class: "eyebrow", text: t("Train") }),
    h("h1", { class: "display", text: t("Train") }),
    h("p", {
      class: "lede",
      text: t(
        "Train freestyle and log as you go, or follow one of your routines set-by-set. Either way it lands in your log.",
      ),
    }),
  ]);

  // ── Freestyle — the owner's own, unplanned session ────────────────────────
  const freestyle = h("section", { class: "card" }, [
    h("p", { class: "eyebrow", text: t("No plan") }),
    h("h2", { class: "section-title", text: t("Freestyle") }),
    h("p", {
      class: "plan-meta",
      text: t(
        "Pick exercises as you go, with a stopwatch and rest timer. Best when you're improvising.",
      ),
    }),
    h("div", { class: "btn-row" }, [
      h("button", {
        class: "btn btn-primary",
        text: liveRunning ? t("Resume Session") : t("Start Freestyle"),
        on: { click: () => nav.go("live") },
      }),
    ]),
  ]);

  // ── Follow a plan — run a routine from the library, set-by-set ────────────
  const plan = h("section", { class: "card" });

  function renderPlan(): void {
    clear(plan);
    const planBody: HTMLElement[] = [
      h("p", { class: "eyebrow", text: t("Follow a plan") }),
      h("h2", { class: "section-title", text: t("Run a routine") }),
    ];

    const sheets = loadSheets();
    const sessions = loadSessions();
    const rows: HTMLElement[] = [];
    sheets.forEach((sheet) => {
      sheet.routines.forEach((routine, i) => {
        const exCount = routine.exercises.filter((e) => e.name.trim() !== "").length;
        if (exCount === 0) return;
        const title = routine.title || t("Untitled routine");
        const adherence = summarizeAdherence(singleRoutineSheetId(sheet, i), sessions);
        const adherenceText =
          adherence.runs === 0
            ? t("Not yet run")
            : [
                adherence.runs === 1
                  ? t("1 run")
                  : t("{0} runs").replace("{0}", String(adherence.runs)),
                t("last {0}").replace("{0}", formatRelativeAgo(adherence.lastRunIso!)),
                ...(adherence.avgCompletionPct !== undefined
                  ? [t("{0}% on plan").replace("{0}", String(adherence.avgCompletionPct))]
                  : []),
              ].join(" · ");
        rows.push(
          h("div", { class: "train-plan-item" }, [
            h("button", {
              class: "btn train-plan-row",
              type: "button",
              aria: { label: t("run routine {0}").replace("{0}", title) },
              on: { click: () => nav.runSheet(singleRoutineSheet(sheet, routine, i)) },
            }, [
              h("span", { class: "train-plan-title", text: title }),
              h("span", {
                class: "train-plan-meta",
                text: t("{0} · {1} {2}")
                  .replace("{0}", sheet.name)
                  .replace("{1}", String(exCount))
                  .replace("{2}", exCount === 1 ? t("exercise") : t("exercises")),
              }),
              h("span", { class: "train-plan-meta", text: adherenceText }),
            ]),
            h("button", {
              class: "icon-btn danger train-plan-delete",
              type: "button",
              text: t("Delete"),
              aria: { label: t("delete routine {0}").replace("{0}", title) },
              on: {
                click: () => {
                  if (!confirm(t('Delete "{0}"? This cannot be undone.').replace("{0}", title)))
                    return;
                  if (sheet.routines.length <= 1) {
                    deleteSheet(sheet.id);
                  } else {
                    sheet.routines.splice(i, 1);
                    saveSheet(sheet);
                  }
                  renderPlan();
                },
              },
            }),
          ]),
        );
      });
    });

    if (rows.length === 0) {
      planBody.push(
        h("p", {
          class: "empty",
          text: t("No routines yet — open one you were sent, or get a starting plan from Claude."),
        }),
        h("div", { class: "btn-row" }, [
          h("button", {
            class: "btn",
            type: "button",
            text: t("Get a plan from Claude"),
            on: { click: () => nav.go("claudeStart") },
          }),
        ]),
      );
    } else {
      planBody.push(
        h("p", { class: "plan-meta", text: t("Tap a routine to run it and tick off each set.") }),
        h("div", { class: "train-plan-list" }, rows),
      );
    }

    append(plan, planBody);
  }

  renderPlan();

  root.appendChild(h("div", { class: "view view-train" }, [hero, freestyle, plan]));
}
