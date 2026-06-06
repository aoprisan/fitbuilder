import { track } from "../analytics";
import { parsePlanFromText } from "../claudePlan";
import {
  buildRoutinePrompt,
  buildWholeBodyPrompt,
  goalTitle,
  isCompoundKey,
  loggedCompoundOptions,
  type RoutineGoal,
  type RoutineInputs,
  type RoutineScope,
  type WholeBodyGoal,
  type WholeBodyInputs,
} from "../claudeRoutine";
import { h } from "../dom";
import { copyRoutinePrompt, startRoutineInClaude } from "../exporters";
import { registerTranslations, t } from "../i18n";
import { loadMode } from "../mode";
import { compoundMovements } from "../movements";
import { loadOneRmMaxes } from "../oneRmStore";
import type { Cleanup, Nav } from "../router";
import { loadSessions } from "../logStorage";
import { saveSheet } from "../sheetStorage";
import { setEditingSheet, setSheetFlash } from "../state";
import { bestOneRm, type ExerciseKey, exerciseKeyLabel, presentExerciseKeys } from "../stats";
import type { MuscleGroup, TrainingSession } from "../types";
import { cloneSheet, round2 } from "../util";

registerTranslations({
  "Build a strength routine": "Construiește o rutină de forță",
  "Build a routine from your training": "Construiește o rutină din antrenamentele tale",
  "Turn your training history into a set-based block you can run — for one compound lift or your whole body — then paste it back to save it.":
    "Transformă istoricul tău de antrenament într-un bloc bazat pe serii pe care îl poți rula — pentru un exercițiu compus sau pentru tot corpul — apoi lipește-l înapoi pentru a-l salva.",
  "Step 1": "Pasul 1",
  "Scope & goal": "Domeniu și obiectiv",
  Scope: "Domeniu",
  "One compound lift": "Un exercițiu compus",
  "Whole body (all muscles)": "Tot corpul (toți mușchii)",
  "Compound lift": "Exercițiu compus",
  Goal: "Obiectiv",
  "Based on {0} exercises across {1} muscles.": "Pe baza a {0} exerciții din {1} grupe musculare.",
  "No training logged yet — Claude will draft a balanced starting split.":
    "Niciun antrenament înregistrat încă — Claude va schița un split echilibrat de început.",
  Strength: "Forță",
  Hypertrophy: "Hipertrofie",
  "1RM Peak": "Vârf 1RM",
  "Base it on": "Bazează-l pe",
  "Days per week": "Zile pe săptămână",
  "Last {0} sessions": "Ultimele {0} sesiuni",
  "All sessions": "Toate sesiunile",
  "{0} day / week": "{0} zi / săptămână",
  "{0} days / week": "{0} zile / săptămână",
  "Current 1RM: {0}": "1RM curent: {0}",
  "{0} sessions logged for this lift.": "{0} sesiuni înregistrate pentru acest exercițiu.",
  "1 session logged for this lift.": "1 sesiune înregistrată pentru acest exercițiu.",
  "No sessions logged for this lift yet — Claude will draft a starting block.":
    "Nicio sesiune înregistrată pentru acest exercițiu încă — Claude va schița un bloc de început.",
  "Step 2": "Pasul 2",
  "Ask Claude": "Întreabă Claude",
  "Opens Claude with a ready-made prompt carrying your history. On a phone, pick Claude from the share sheet; on desktop the prompt is copied and Claude opens in a new tab. Or copy it for any other AI.":
    "Deschide Claude cu un prompt gata făcut care conține istoricul tău. Pe telefon, alege Claude din fereastra de partajare; pe desktop promptul este copiat și Claude se deschide într-un tab nou. Sau copiază-l pentru orice alt AI.",
  "Open Claude": "Deschide Claude",
  "Opening Claude…": "Se deschide Claude…",
  "Copy prompt": "Copiază promptul",
  "Copying the prompt…": "Se copiază promptul…",
  "Opened the share sheet — pick Claude, then send the prompt.":
    "S-a deschis fereastra de partajare — alege Claude, apoi trimite promptul.",
  "Copied the prompt and opened Claude — paste it into the chat.":
    "Promptul a fost copiat și Claude s-a deschis — lipește-l în conversație.",
  "Copied the prompt — open Claude and paste it into a new chat.":
    "Promptul a fost copiat — deschide Claude și lipește-l într-o conversație nouă.",
  "Downloaded the prompt — open it, copy the text, and paste it into Claude.":
    "Promptul a fost descărcat — deschide-l, copiază textul și lipește-l în Claude.",
  "Copied the prompt — paste it into any AI chat.":
    "Promptul a fost copiat — lipește-l în orice conversație AI.",
  "Downloaded the prompt — open it and paste the text into any AI.":
    "Promptul a fost descărcat — deschide-l și lipește textul în orice AI.",
  "Couldn't open Claude. Try copying the prompt manually.":
    "Nu s-a putut deschide Claude. Încearcă să copiezi promptul manual.",
  "Couldn't copy the prompt. Try again.": "Nu s-a putut copia promptul. Încearcă din nou.",
  "Step 3": "Pasul 3",
  "Paste it back": "Lipește-l înapoi",
  "Copy the JSON block Claude replies with and paste it here to save it to your routines.":
    "Copiază blocul JSON cu care răspunde Claude și lipește-l aici pentru a-l salva în rutinele tale.",
  "Paste the JSON block Claude gave you here…":
    "Lipește aici blocul JSON pe care ți l-a dat Claude…",
  "Paste your block from Claude": "Lipește blocul tău de la Claude",
  "Add routine": "Adaugă rutina",
  "Paste the block from Claude first.": "Lipește mai întâi blocul de la Claude.",
  'Added "{0}" from Claude. Edit it here.': 'Ai adăugat "{0}" de la Claude. Editează-l aici.',
  'Saved "{0}". Open Train to run it.': 'Salvat "{0}". Deschide Antrenament pentru a-l rula.',
  "Couldn't read that block. Make sure you pasted the whole JSON.":
    "Nu s-a putut citi acel bloc. Asigură-te că ai lipit tot JSON-ul.",
});

type StatusKind = "ok" | "err" | "info";

/** History depths offered in the "base it on" selector (0 = every logged session). */
const HISTORY_DEPTHS: readonly number[] = [4, 8, 12, 0];

/** What a caller (Stats, Home) wants the next mount of the builder to open on. */
export interface RoutineSeed {
  /** Preselect this compound lift (and the single-lift scope). */
  key?: ExerciseKey;
  /** Open in this scope (single lift vs whole body). */
  scope?: RoutineScope;
}

// One-shot seed so other views can preset the builder (the same pattern as the
// sheet-flash hand-off). Consumed and cleared on mount.
let seed: RoutineSeed | null = null;

/** Preset the lift and/or scope the next mount of this view opens on. */
export function seedRoutine(next: RoutineSeed): void {
  seed = next;
}

export function mountClaudeRoutine(root: HTMLElement, nav: Nav): Cleanup {
  const sessions: TrainingSession[] = loadSessions();
  const loggedMaxes = loadOneRmMaxes();

  // The selectable compounds: those the user has logged (richest history first),
  // falling back to the full curated catalog when they've logged none.
  const logged = loggedCompoundOptions(sessions);
  const options =
    logged.length > 0
      ? logged
      : compoundMovements().map((mv) => ({ key: mv.id, label: exerciseKeyLabel(mv.id), sessionCount: 0 }));

  const seededKey = seed?.key && isCompoundKey(seed.key) ? seed.key : undefined;
  const startKey = seededKey ?? options[0]?.key ?? "";
  // A seeded lift forces single-lift scope; otherwise honour an explicit scope,
  // defaulting to single-lift (the richer programming path).
  let scope: RoutineScope = seededKey ? "lift" : (seed?.scope ?? "lift");
  seed = null;

  // How many distinct exercises / muscles the whole-body summary will carry —
  // the read shown under the inputs so the user knows what Claude works from.
  const exerciseCount = presentExerciseKeys(sessions).length;
  const trainedMuscles = new Set<MuscleGroup>();
  for (const session of sessions) {
    for (const ex of session.exercises) {
      if (ex.sets.length > 0 && ex.muscle !== "cardio") trainedMuscles.add(ex.muscle);
    }
  }

  const inputs: RoutineInputs = {
    key: startKey,
    goal: "strength",
    sessionsBack: 8,
    daysPerWeek: 3,
  };

  const statusEl = h("p", { class: "status", role: "status", aria: { live: "polite" } });
  const setStatus = (msg: string, kind: StatusKind): void => {
    statusEl.textContent = msg;
    statusEl.className = `status status-${kind}`;
  };

  // ---- Step 1: scope, the lift, goal, history depth & schedule --------------
  const scopeSelect = h("select", { class: "field-select", aria: { label: t("Scope") } }, [
    h("option", { value: "lift", text: t("One compound lift") }),
    h("option", { value: "whole", text: t("Whole body (all muscles)") }),
  ]);
  scopeSelect.value = scope;

  const liftSelect = h(
    "select",
    { class: "field-select", aria: { label: t("Compound lift") } },
    options.map((o) => h("option", { value: o.key, text: o.label })),
  );
  liftSelect.value = inputs.key;
  // Wrapped so the whole field hides in whole-body scope (no lift to pick).
  const liftField = h("label", { class: "field" }, [
    h("span", { class: "field-label", text: t("Compound lift") }),
    liftSelect,
  ]);

  // A 1RM peak is inherently lift-specific, so its option is removed in whole-body scope.
  const peakOption = h("option", { value: "peak-1rm", text: t(goalTitle("peak-1rm")) });
  const goalSelect = h("select", { class: "field-select", aria: { label: t("Goal") } }, [
    h("option", { value: "strength", text: t(goalTitle("strength")) }),
    h("option", { value: "hypertrophy", text: t(goalTitle("hypertrophy")) }),
    peakOption,
  ]);
  goalSelect.value = inputs.goal;
  goalSelect.addEventListener("change", () => {
    inputs.goal = goalSelect.value as RoutineGoal;
  });

  const baseSelect = h(
    "select",
    { class: "field-select", aria: { label: t("Base it on") } },
    HISTORY_DEPTHS.map((n) =>
      h("option", {
        value: String(n),
        text: n === 0 ? t("All sessions") : t("Last {0} sessions").replace("{0}", String(n)),
      }),
    ),
  );
  baseSelect.value = String(inputs.sessionsBack);
  baseSelect.addEventListener("change", () => {
    inputs.sessionsBack = Number(baseSelect.value);
  });

  const daysSelect = h(
    "select",
    { class: "field-select", aria: { label: t("Days per week") } },
    [1, 2, 3, 4, 5, 6].map((n) =>
      h("option", {
        value: String(n),
        text: (n === 1 ? t("{0} day / week") : t("{0} days / week")).replace("{0}", String(n)),
      }),
    ),
  );
  daysSelect.value = String(inputs.daysPerWeek);
  daysSelect.addEventListener("change", () => {
    inputs.daysPerWeek = Number(daysSelect.value);
  });

  // A live read of what Claude works from: in single-lift scope its current 1RM
  // and history depth; in whole-body scope the breadth of training summarised.
  const oneRmLine = h("p", { class: "plan-meta" });
  const historyLine = h("p", { class: "plan-meta" });
  const wholeLine = h("p", { class: "plan-meta" });
  const refreshContext = (): void => {
    const isWhole = scope === "whole";
    liftField.hidden = isWhole;
    oneRmLine.hidden = isWhole;
    historyLine.hidden = isWhole;
    wholeLine.hidden = !isWhole;
    peakOption.hidden = isWhole;
    peakOption.disabled = isWhole;

    if (isWhole) {
      wholeLine.textContent =
        exerciseCount === 0
          ? t("No training logged yet — Claude will draft a balanced starting split.")
          : t("Based on {0} exercises across {1} muscles.")
              .replace("{0}", String(exerciseCount))
              .replace("{1}", String(trainedMuscles.size));
      return;
    }

    const best = bestOneRm(sessions, inputs.key, loggedMaxes);
    const maxText =
      best.logged > 0
        ? `${round2(best.logged)} kg`
        : best.estimated > 0
          ? `${round2(best.estimated)} kg (est.)`
          : "—";
    oneRmLine.textContent = t("Current 1RM: {0}").replace("{0}", maxText);

    const count = options.find((o) => o.key === inputs.key)?.sessionCount ?? 0;
    historyLine.textContent =
      count === 0
        ? t("No sessions logged for this lift yet — Claude will draft a starting block.")
        : count === 1
          ? t("1 session logged for this lift.")
          : t("{0} sessions logged for this lift.").replace("{0}", String(count));
  };
  liftSelect.addEventListener("change", () => {
    inputs.key = liftSelect.value;
    refreshContext();
  });
  scopeSelect.addEventListener("change", () => {
    scope = scopeSelect.value as RoutineScope;
    // A whole-body block can't peak a 1RM — fall back to strength if it was picked.
    if (scope === "whole" && inputs.goal === "peak-1rm") {
      inputs.goal = "strength";
      goalSelect.value = "strength";
    }
    refreshContext();
  });
  refreshContext();

  // The prompt for the current scope: a single-lift block or a whole-body split.
  const buildPrompt = (): string =>
    scope === "whole"
      ? buildWholeBodyPrompt(
          sessions,
          {
            goal: inputs.goal as WholeBodyGoal,
            sessionsBack: inputs.sessionsBack,
            daysPerWeek: inputs.daysPerWeek,
          } satisfies WholeBodyInputs,
          loggedMaxes,
        )
      : buildRoutinePrompt(sessions, inputs, loggedMaxes);

  // ---- Step 2: hand the prompt to Claude ------------------------------------
  let busy = false;
  const openBtn = h("button", { class: "btn btn-primary", type: "button", text: t("Open Claude") });
  openBtn.addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    setStatus(t("Opening Claude…"), "info");
    try {
      const result = await startRoutineInClaude(buildPrompt());
      setStatus(
        result === "shared"
          ? t("Opened the share sheet — pick Claude, then send the prompt.")
          : result === "copied-opened"
            ? t("Copied the prompt and opened Claude — paste it into the chat.")
            : result === "copied"
              ? t("Copied the prompt — open Claude and paste it into a new chat.")
              : t("Downloaded the prompt — open it, copy the text, and paste it into Claude."),
        "ok",
      );
    } catch {
      setStatus(t("Couldn't open Claude. Try copying the prompt manually."), "err");
    } finally {
      busy = false;
    }
  });

  const copyBtn = h("button", { class: "btn", type: "button", text: t("Copy prompt") });
  copyBtn.addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    setStatus(t("Copying the prompt…"), "info");
    try {
      const result = await copyRoutinePrompt(buildPrompt());
      setStatus(
        result === "copied"
          ? t("Copied the prompt — paste it into any AI chat.")
          : t("Downloaded the prompt — open it and paste the text into any AI."),
        "ok",
      );
    } catch {
      setStatus(t("Couldn't copy the prompt. Try again."), "err");
    } finally {
      busy = false;
    }
  });

  // ---- Step 3: paste the block back -----------------------------------------
  const pasteArea = h("textarea", {
    class: "claude-paste",
    rows: "8",
    placeholder: t("Paste the JSON block Claude gave you here…"),
    aria: { label: t("Paste your block from Claude") },
  });

  const addBtn = h("button", { class: "btn btn-accent", type: "button", text: t("Add routine") });
  addBtn.addEventListener("click", () => {
    if (pasteArea.value.trim() === "") {
      setStatus(t("Paste the block from Claude first."), "err");
      return;
    }
    try {
      const stored = saveSheet(parsePlanFromText(pasteArea.value));
      track("claude_routine_imported", { goal: inputs.goal, scope });
      if (loadMode() === "trainer") {
        setSheetFlash(t('Added "{0}" from Claude. Edit it here.').replace("{0}", stored.name), "ok");
        nav.editSheet(cloneSheet(stored));
      } else {
        setEditingSheet(cloneSheet(stored));
        setStatus(t('Saved "{0}". Open Train to run it.').replace("{0}", stored.name), "ok");
        nav.go("train");
      }
    } catch (err) {
      setStatus(
        err instanceof Error
          ? err.message
          : t("Couldn't read that block. Make sure you pasted the whole JSON."),
        "err",
      );
    }
  });

  root.appendChild(
    h("div", { class: "view view-claude-start" }, [
      h("section", { class: "hero" }, [
        h("p", { class: "eyebrow", text: t("Build a strength routine") }),
        h("h1", { class: "display", text: t("Build a routine from your training") }),
        h("p", {
          class: "lede",
          text: t("Turn your training history into a set-based block you can run — for one compound lift or your whole body — then paste it back to save it."),
        }),
      ]),
      h("section", { class: "card" }, [
        h("p", { class: "eyebrow", text: t("Step 1") }),
        h("h2", { class: "section-title", text: t("Scope & goal") }),
        h("label", { class: "field" }, [h("span", { class: "field-label", text: t("Scope") }), scopeSelect]),
        liftField,
        h("label", { class: "field" }, [h("span", { class: "field-label", text: t("Goal") }), goalSelect]),
        h("label", { class: "field" }, [
          h("span", { class: "field-label", text: t("Base it on") }),
          baseSelect,
        ]),
        h("label", { class: "field" }, [
          h("span", { class: "field-label", text: t("Days per week") }),
          daysSelect,
        ]),
        oneRmLine,
        historyLine,
        wholeLine,
      ]),
      h("section", { class: "card" }, [
        h("p", { class: "eyebrow", text: t("Step 2") }),
        h("h2", { class: "section-title", text: t("Ask Claude") }),
        h("p", {
          class: "plan-meta",
          text: t("Opens Claude with a ready-made prompt carrying your history. On a phone, pick Claude from the share sheet; on desktop the prompt is copied and Claude opens in a new tab. Or copy it for any other AI."),
        }),
        h("div", { class: "btn-row" }, [openBtn, copyBtn]),
      ]),
      h("section", { class: "card" }, [
        h("p", { class: "eyebrow", text: t("Step 3") }),
        h("h2", { class: "section-title", text: t("Paste it back") }),
        h("p", {
          class: "plan-meta",
          text: t("Copy the JSON block Claude replies with and paste it here to save it to your routines."),
        }),
        pasteArea,
        h("div", { class: "btn-row" }, [addBtn]),
      ]),
      statusEl,
    ]),
  );

  return () => {};
}
