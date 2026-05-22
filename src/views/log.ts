import { clear, h } from "../dom";
import { blankLogExercise, newTrainingSession } from "../log";
import { deleteSession, getSession, loadSessions, saveSession } from "../logStorage";
import type { Nav } from "../router";
import { setActiveLog, state } from "../state";
import {
  EQUIPMENT,
  EQUIPMENT_LABELS,
  isBodyweight,
  MUSCLE_GROUPS,
  MUSCLE_LABELS,
  type LoggedExercise,
  type TrainingSession,
} from "../types";
import { formatSessionDate, sessionSetCount, sessionVolume } from "../util";
import { dialField } from "./dial";

export function mountLog(root: HTMLElement, _nav: Nav): void {
  const container = h("div", { class: "view view-log" });

  function render(): void {
    clear(container);
    if (state.activeLog) renderEditor(state.activeLog);
    else renderList();
    window.scrollTo(0, 0);
  }

  // ───────────────────────── List mode ─────────────────────────

  function renderList(): void {
    const sessions = loadSessions().sort((a, b) => b.startedAt.localeCompare(a.startedAt));

    const listHost = h("div", { class: "saved-list" });
    if (sessions.length === 0) {
      listHost.appendChild(
        h("p", {
          class: "empty",
          text: "No sessions yet. Hit “New session” when you reach the gym.",
        }),
      );
    } else {
      sessions.forEach((s) => listHost.appendChild(renderSessionCard(s)));
    }

    container.append(
      h("h1", { class: "view-title", text: "Training Log" }),
      h("p", {
        class: "lede",
        text: "Track a workout live: start a session, then add each exercise and log its sets as you go.",
      }),
      h("div", { class: "btn-row" }, [
        h("button", {
          class: "btn btn-primary",
          type: "button",
          text: "+ New session",
          on: {
            click: () => {
              setActiveLog(saveSession(newTrainingSession()));
              render();
            },
          },
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
          text: "Open",
          on: {
            click: () => {
              const fresh = getSession(s.id);
              if (fresh) {
                setActiveLog(fresh);
                render();
              }
            },
          },
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

  // ───────────────────────── Editor mode ─────────────────────────

  function renderEditor(session: TrainingSession): void {
    const metaEl = h("p", { class: "plan-meta" });
    const exercisesHost = h("div", { class: "exercises" });

    const persist = (): void => {
      saveSession(session);
    };

    const refreshMeta = (): void => {
      const sets = sessionSetCount(session);
      const vol = sessionVolume(session);
      metaEl.textContent =
        `${session.exercises.length} exercises · ${sets} sets` +
        (vol > 0 ? ` · ${vol} kg lifted` : "");
    };

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

    const renderSet = (ex: LoggedExercise, setIndex: number): HTMLElement => {
      const ws = ex.sets[setIndex]!;
      return h("div", { class: "set-row set-row-dial" }, [
        h("span", { class: "set-no", text: `Set ${setIndex + 1}` }),
        dialField({
          label: "Reps",
          value: ws.reps,
          step: 1,
          min: 0,
          integer: true,
          unit: "reps",
          tone: "signal",
          onCommit: (n) => {
            ws.reps = n;
            persist();
            refreshMeta();
          },
        }),
        dialField({
          label: isBodyweight(ex.equipment) ? "Added (kg)" : "Weight (kg)",
          value: ws.weightKg,
          step: 2.5,
          min: 0,
          integer: false,
          unit: "kg",
          tone: "navy",
          onCommit: (n) => {
            ws.weightKg = n;
            persist();
            refreshMeta();
          },
        }),
        h("button", {
          class: "icon-btn danger",
          type: "button",
          text: "Remove",
          aria: { label: `remove set ${setIndex + 1}` },
          disabled: ex.sets.length <= 1,
          on: {
            click: () => {
              if (ex.sets.length <= 1) return;
              ex.sets.splice(setIndex, 1);
              persist();
              renderExercises();
            },
          },
        }),
      ]);
    };

    const renderExercise = (ex: LoggedExercise, exIndex: number): HTMLElement => {
      const nameInput = h("input", {
        class: "ex-name",
        type: "text",
        value: ex.name,
        placeholder: "Exercise name",
        aria: { label: "Exercise name" },
      });
      nameInput.addEventListener("input", () => {
        ex.name = nameInput.value;
        persist();
      });

      return h("section", { class: "card exercise" }, [
        h("div", { class: "exercise-head" }, [
          h("span", { class: "ex-index", text: String(exIndex + 1) }),
          nameInput,
          h("button", {
            class: "icon-btn danger",
            type: "button",
            text: "Delete",
            aria: { label: `delete exercise ${exIndex + 1}` },
            on: {
              click: () => {
                session.exercises.splice(exIndex, 1);
                persist();
                renderExercises();
              },
            },
          }),
        ]),
        renderToggle(
          "Muscle group",
          MUSCLE_GROUPS,
          (m) => MUSCLE_LABELS[m as LoggedExercise["muscle"]],
          ex.muscle,
          (m) => {
            ex.muscle = m as LoggedExercise["muscle"];
            persist();
            renderExercises();
          },
        ),
        renderToggle(
          "Equipment",
          EQUIPMENT,
          (eq) => EQUIPMENT_LABELS[eq as LoggedExercise["equipment"]],
          ex.equipment,
          (eq) => {
            ex.equipment = eq as LoggedExercise["equipment"];
            persist();
            renderExercises();
          },
        ),
        h(
          "div",
          { class: "sets" },
          ex.sets.map((_s, i) => renderSet(ex, i)),
        ),
        h("button", {
          class: "btn btn-small",
          type: "button",
          text: "+ Add set",
          on: {
            click: () => {
              const last = ex.sets[ex.sets.length - 1];
              ex.sets.push(last ? { ...last } : { reps: 10, weightKg: 10 });
              persist();
              renderExercises();
            },
          },
        }),
      ]);
    };

    function renderExercises(): void {
      clear(exercisesHost);
      if (session.exercises.length === 0) {
        exercisesHost.appendChild(
          h("p", {
            class: "empty",
            text: "No exercises yet — hit “+ Add exercise” as you start each one.",
          }),
        );
      } else {
        session.exercises.forEach((ex, i) => exercisesHost.appendChild(renderExercise(ex, i)));
      }
      refreshMeta();
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

    const head = h("section", { class: "card builder-head" }, [
      h("label", { class: "field" }, [
        h("span", { class: "field-label", text: "Session name" }),
        nameInput,
      ]),
      h("p", { class: "session-date", text: formatSessionDate(session.startedAt) }),
      metaEl,
    ]);

    container.append(
      h("div", { class: "btn-row log-topbar" }, [
        h("button", {
          class: "btn btn-small",
          type: "button",
          text: "‹ All sessions",
          on: {
            click: () => {
              persist();
              setActiveLog(null);
              render();
            },
          },
        }),
      ]),
      h("h1", { class: "view-title", text: "Live Session" }),
      head,
      h("div", { class: "btn-row" }, [
        h("button", {
          class: "btn btn-primary",
          type: "button",
          text: "+ Add exercise",
          on: {
            click: () => {
              session.exercises.push(blankLogExercise());
              persist();
              renderExercises();
            },
          },
        }),
      ]),
      exercisesHost,
      h("div", { class: "btn-row log-footer" }, [
        h("button", {
          class: "btn btn-accent",
          type: "button",
          text: "✓ Done",
          on: {
            click: () => {
              persist();
              setActiveLog(null);
              render();
            },
          },
        }),
        h("button", {
          class: "btn danger",
          type: "button",
          text: "Delete session",
          on: {
            click: () => {
              if (!confirm(`Delete "${session.name || "this session"}"? This cannot be undone.`))
                return;
              deleteSession(session.id);
              setActiveLog(null);
              render();
            },
          },
        }),
      ]),
    );

    renderExercises();
  }

  render();
  root.appendChild(container);
}
