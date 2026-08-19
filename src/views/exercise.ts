import { clear, h } from "../dom";
import { registerTranslations, t } from "../i18n";
import { loadSessions } from "../logStorage";
import { clearOneRm, loadOneRmMaxes, setOneRm } from "../oneRmStore";
import type { Cleanup, Nav } from "../router";
import {
  epley1RM,
  exerciseKey,
  exerciseKeyLabel,
  isCardioExerciseKey,
  loadsForExercise,
  repCapacity,
  sessionCountsByExercise,
  type ExerciseKey,
} from "../stats";
import {
  EQUIPMENT_LABELS,
  isBodyweight,
  MUSCLE_LABELS,
  type LoggedExercise,
  type TrainingSession,
  type WorkSet,
} from "../types";
import { formatCardioSet, formatClock, formatSessionDate, round2 } from "../util";
import { lineChart } from "./chart";
import { filterField, matchesFilter } from "./filter";

registerTranslations({
  Exercises: "Exerciții",
  "Search exercises": "Caută exerciții",
  "Every movement you've logged — tap one for its history and estimated max.":
    "Fiecare mișcare înregistrată — atinge una pentru istoric și maximul estimat.",
  "{0} session": "{0} sesiune",
  "{0} sessions": "{0} sesiuni",
  "No exercises logged yet — train a live session and they show up here.":
    "Niciun exercițiu înregistrat încă — fă un antrenament live și vor apărea aici.",
  "No exercises match this search.": "Niciun exercițiu nu se potrivește căutării.",
  "← Back": "← Înapoi",
  "Estimated one-rep max": "Maxim estimat (1RM)",
  "from {0} on {1}": "din {0} pe {1}",
  "Epley estimate off your best working set.":
    "Estimare Epley din cel mai bun set de lucru.",
  "Your logged 1RM": "1RM-ul tău înregistrat",
  "No loaded sets yet — the estimate needs weighted work.":
    "Încă niciun set cu greutate — estimarea are nevoie de lucru cu greutăți.",
  "Estimated 1RM": "1RM estimat",
  "Best Epley estimate per session — your strength trend.":
    "Cea mai bună estimare Epley pe sesiune — trendul tău de forță.",
  "Reps you can expect": "Repetări de așteptat",
  "est ~{0} reps": "est ~{0} repetări",
  "best {0} · {1}": "record {0} · {1}",
  "never for reps": "niciodată pe repetări",
  "Past sets": "Serii anterioare",
  "Show more ▾": "Mai multe ▾",
  "Tested 1RM (kg)": "1RM testat (kg)",
  "Record a max you actually tested — it feeds the rep estimates.":
    "Notează un maxim testat — alimentează estimările de repetări.",
  Save: "Salvează",
  Clear: "Șterge",
  kg: "kg",
});

/** Short x-axis label for a session date, e.g. "22 May". */
function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

// The exercise the detail screen opens on, seeded by whichever view navigated
// here (History card chips, the live picker). Kept across remounts so browser
// back/forward restores the same screen; null opens the searchable index.
let seededKey: ExerciseKey | null = null;

/** Point the Exercise view at a movement before `nav.go("exercise")`. */
export function seedExercise(key: ExerciseKey | null): void {
  seededKey = key;
}

/** One session's logged instance of the movement, newest first. */
interface HistoryEntry {
  session: TrainingSession;
  exercise: LoggedExercise;
}

function historyFor(sessions: readonly TrainingSession[], key: ExerciseKey): HistoryEntry[] {
  const entries: HistoryEntry[] = [];
  for (const session of sessions) {
    for (const exercise of session.exercises) {
      if (exercise.sets.length === 0 || exerciseKey(exercise) !== key) continue;
      entries.push({ session, exercise });
    }
  }
  return entries.sort((a, b) => b.session.startedAt.localeCompare(a.session.startedAt));
}

/** A logged set as compact ledger text: "8×60", "8×BW+5", "0:45" for holds. */
function fmtPastSet(exercise: LoggedExercise, s: WorkSet): string {
  if (s.reps === 0 && s.durationSec !== undefined) return formatClock(s.durationSec);
  if (isBodyweight(exercise.equipment)) {
    return s.weightKg > 0 ? `${s.reps}×BW+${round2(s.weightKg)}` : `${s.reps}`;
  }
  return `${s.reps}×${round2(s.weightKg)}`;
}

/**
 * Exercise detail — the focused "what's my history and my max?" screen.
 * Opens on the movement seeded via {@link seedExercise}; with no seed it shows
 * a searchable index of every logged movement.
 */
export function mountExercise(root: HTMLElement, _nav: Nav): Cleanup {
  const container = h("div", { class: "view view-exercise" });
  root.appendChild(container);

  const sessions = loadSessions();
  let key: ExerciseKey | null = seededKey;
  // Whether the detail was opened from the in-view index (back returns to it)
  // rather than from another view (back leaves via browser history).
  let fromIndex = false;
  let searchText = "";
  let shownGroups = 8;

  // ────────────────────────────── Index ──────────────────────────────────────

  function renderIndex(): void {
    const counts = sessionCountsByExercise(sessions);
    const keys = [...counts.entries()].sort((a, b) => b[1] - a[1]);

    container.append(
      h("h1", { class: "view-title", text: t("Exercises") }),
      h("p", {
        class: "lede",
        text: t("Every movement you've logged — tap one for its history and estimated max."),
      }),
    );

    if (keys.length === 0) {
      container.append(
        h("p", {
          class: "empty",
          text: t("No exercises logged yet — train a live session and they show up here."),
        }),
      );
      return;
    }

    const listHost = h("div", { class: "exercise-index" });
    const paint = (): void => {
      clear(listHost);
      const shown = keys.filter(([k]) => matchesFilter(exerciseKeyLabel(k), searchText));
      if (shown.length === 0) {
        listHost.append(h("p", { class: "empty", text: t("No exercises match this search.") }));
        return;
      }
      shown.forEach(([k, count]) => {
        listHost.append(
          h(
            "button",
            {
              class: "btn btn-small exercise-index-row",
              type: "button",
              on: {
                click: () => {
                  key = k;
                  seededKey = k;
                  fromIndex = true;
                  shownGroups = 8;
                  render();
                },
              },
            },
            [
              h("span", { class: "exercise-index-name", text: exerciseKeyLabel(k) }),
              h("span", {
                class: "exercise-index-count",
                text: (count === 1 ? t("{0} session") : t("{0} sessions")).replace(
                  "{0}",
                  String(count),
                ),
              }),
            ],
          ),
        );
      });
    };
    const filterEl = filterField(t("Search exercises"), (q) => {
      searchText = q;
      paint();
    });
    filterEl.value = searchText;
    paint();
    container.append(h("section", { class: "card" }, [filterEl, listHost]));
  }

  // ────────────────────────────── Detail ─────────────────────────────────────

  /** The best (highest-Epley) working set logged for the movement, with its date. */
  function bestEstimated(entries: readonly HistoryEntry[]): {
    kg: number;
    set: WorkSet | null;
    date: string;
  } {
    let kg = 0;
    let set: WorkSet | null = null;
    let date = "";
    for (const e of entries) {
      for (const s of e.exercise.sets) {
        if (s.setType === "warmup") continue;
        const est = epley1RM(s);
        if (est > kg) {
          kg = est;
          set = s;
          date = e.session.startedAt;
        }
      }
    }
    return { kg: round2(kg), set, date };
  }

  /** Inline editor for the user's tested 1RM, feeding the same store Stats used. */
  function renderOneRmEditor(k: ExerciseKey): HTMLElement {
    const current = loadOneRmMaxes()[k];
    const input = h("input", {
      class: "plan-name-input oneRm-input",
      type: "number",
      inputmode: "decimal",
      min: "0",
      step: "0.5",
      value: current !== undefined ? String(current) : "",
      placeholder: "kg",
      aria: { label: t("Tested 1RM (kg)") },
    });
    return h("div", { class: "field" }, [
      h("span", { class: "field-label", text: t("Tested 1RM (kg)") }),
      h("div", { class: "btn-row oneRm-row" }, [
        input,
        h("button", {
          class: "btn btn-small",
          type: "button",
          text: t("Save"),
          on: {
            click: () => {
              const kg = Number(input.value);
              if (Number.isFinite(kg) && kg > 0) {
                setOneRm(k, round2(kg));
                render();
              }
            },
          },
        }),
        ...(current !== undefined
          ? [
              h("button", {
                class: "btn btn-small danger",
                type: "button",
                text: t("Clear"),
                on: {
                  click: () => {
                    clearOneRm(k);
                    render();
                  },
                },
              }),
            ]
          : []),
      ]),
      h("p", {
        class: "plan-meta",
        text: t("Record a max you actually tested — it feeds the rep estimates."),
      }),
    ]);
  }

  function renderDetail(k: ExerciseKey): void {
    const entries = historyFor(sessions, k);
    const latest = entries[0]?.exercise;
    const cardio = isCardioExerciseKey(k) || (latest !== undefined && latest.equipment === "treadmill");

    // Header: back + name + muscle/equipment chip.
    container.append(
      h("div", { class: "exercise-head" }, [
        h("button", {
          class: "btn btn-small",
          type: "button",
          text: t("← Back"),
          on: {
            click: () => {
              if (fromIndex) {
                key = null;
                seededKey = null;
                fromIndex = false;
                render();
              } else {
                history.back();
              }
            },
          },
        }),
        h("h1", { class: "view-title exercise-title", text: exerciseKeyLabel(k) }),
      ]),
      ...(latest
        ? [
            h("p", {
              class: "plan-meta exercise-meta",
              text: `${t(MUSCLE_LABELS[latest.muscle])} · ${t(EQUIPMENT_LABELS[latest.equipment])}`,
            }),
          ]
        : []),
    );

    if (entries.length === 0) {
      container.append(
        h("p", {
          class: "empty",
          text: t("No exercises logged yet — train a live session and they show up here."),
        }),
      );
      return;
    }

    const maxes = loadOneRmMaxes();

    if (!cardio) {
      // — Estimated max headline —
      const est = bestEstimated(entries);
      const loggedMax = Math.max(
        maxes[k] ?? 0,
        ...entries.map((e) => e.exercise.oneRmKg ?? 0),
      );
      const headlineKids: HTMLElement[] = [
        h("p", { class: "eyebrow", text: t("Estimated one-rep max") }),
      ];
      if (est.kg > 0 && est.set && latest) {
        headlineKids.push(
          h("p", { class: "oneRm-figure" }, [
            h("span", { class: "oneRm-kg", text: String(est.kg) }),
            h("span", { class: "oneRm-unit", text: t("kg") }),
          ]),
          h("p", {
            class: "plan-meta",
            text: `${t("Epley estimate off your best working set.")} ${t("from {0} on {1}")
              .replace("{0}", fmtPastSet(latest, est.set))
              .replace("{1}", formatSessionDate(est.date))}`,
          }),
        );
      } else {
        headlineKids.push(
          h("p", {
            class: "plan-meta",
            text: t("No loaded sets yet — the estimate needs weighted work."),
          }),
        );
      }
      if (loggedMax > 0) {
        headlineKids.push(
          h("p", {
            class: "plan-meta",
            text: `${t("Your logged 1RM")}: ${round2(loggedMax)} kg`,
          }),
        );
      }
      headlineKids.push(renderOneRmEditor(k));
      container.append(h("section", { class: "card" }, headlineKids));

      // — e1RM trend (chronological, one point per session with weighted work) —
      const points = [...entries]
        .reverse()
        .map((e) => {
          let best = 0;
          for (const s of e.exercise.sets) {
            if (s.setType === "warmup") continue;
            best = Math.max(best, epley1RM(s));
          }
          return { label: shortDate(e.session.startedAt), value: round2(best) };
        })
        .filter((p) => p.value > 0);
      if (points.length >= 2) {
        container.append(
          lineChart({
            title: t("Estimated 1RM"),
            unit: "kg",
            values: points.map((p) => p.value),
            labels: points.map((p) => p.label),
            hint: t("Best Epley estimate per session — your strength trend."),
          }),
        );
      }

      // — Reps you can expect, at the loads actually trained —
      const loads = [...loadsForExercise(sessions, k)]
        .sort((a, b) => b.sessions - a.sessions || b.weightKg - a.weightKg)
        .slice(0, 3)
        .sort((a, b) => a.weightKg - b.weightKg);
      if (loads.length > 0) {
        const rows = loads.map((opt) => {
          const cap = repCapacity(sessions, k, opt.weightKg, maxes);
          const bestText =
            cap.performed > 0
              ? t("best {0} · {1}")
                  .replace("{0}", String(cap.performed))
                  .replace("{1}", cap.performedLabel ?? "")
              : t("never for reps");
          return h("div", { class: "muscle-row" }, [
            h("span", { class: "muscle-name", text: `${round2(opt.weightKg)} kg` }),
            h("span", {
              class: "muscle-stat",
              text: `${t("est ~{0} reps").replace("{0}", String(cap.estimated))} · ${bestText}`,
            }),
          ]);
        });
        container.append(
          h("section", { class: "card" }, [
            h("h2", { class: "section-title", text: t("Reps you can expect") }),
            ...rows,
          ]),
        );
      }
    }

    // — Past sets, grouped per session, newest first —
    const groupsHost = h("div");
    const paintGroups = (): void => {
      clear(groupsHost);
      entries.slice(0, shownGroups).forEach((e) => {
        const setsLine = h("p", { class: "typical-last-sets" });
        e.exercise.sets.forEach((s, i) => {
          if (i > 0) setsLine.append("   ");
          setsLine.append(
            cardio ? formatCardioSet(s) : fmtPastSet(e.exercise, s),
          );
          if (!cardio && s.rir !== undefined) {
            setsLine.append(h("span", { class: "past-set-rir", text: `@${s.rir}` }));
          }
        });
        groupsHost.append(
          h("div", { class: "past-session" }, [
            h("p", {
              class: "now-eyebrow",
              text: `${formatSessionDate(e.session.startedAt)} · ${e.session.name}`,
            }),
            setsLine,
          ]),
        );
      });
      if (entries.length > shownGroups) {
        groupsHost.append(
          h("div", { class: "btn-row" }, [
            h("button", {
              class: "btn btn-small",
              type: "button",
              text: t("Show more ▾"),
              on: {
                click: () => {
                  shownGroups += 12;
                  paintGroups();
                },
              },
            }),
          ]),
        );
      }
    };
    paintGroups();
    container.append(
      h("section", { class: "card" }, [
        h("h2", { class: "section-title", text: t("Past sets") }),
        groupsHost,
      ]),
    );
  }

  // ────────────────────────────── Render ─────────────────────────────────────

  function render(): void {
    clear(container);
    if (key === null) renderIndex();
    else renderDetail(key);
    window.scrollTo(0, 0);
  }

  render();
  return () => {};
}
