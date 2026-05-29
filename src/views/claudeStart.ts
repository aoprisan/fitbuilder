import { buildPlanPrompt, parsePlanFromText, type Goal, type Level, type PlanInputs } from "../claudePlan";
import { h } from "../dom";
import { copyPlanPrompt, startPlanInClaude } from "../exporters";
import { registerTranslations, t } from "../i18n";
import { loadMode } from "../mode";
import type { Cleanup, Nav } from "../router";
import { saveSheet } from "../sheetStorage";
import { setEditingSheet, setSheetFlash } from "../state";
import { cloneSheet } from "../util";

registerTranslations({
  "Training goal": "Obiectiv de antrenament",
  "Build muscle": "Construiește mușchi",
  "Lose fat": "Pierde grăsime",
  "Get stronger": "Devino mai puternic",
  Calisthenics: "Calistenie",
  "Experience level": "Nivel de experiență",
  Beginner: "Începător",
  Intermediate: "Intermediar",
  Advanced: "Avansat",
  "Training days per week": "Zile de antrenament pe săptămână",
  "{0} day / week": "{0} zi / săptămână",
  "{0} days / week": "{0} zile / săptămână",
  "Open Claude": "Deschide Claude",
  "Opening Claude…": "Se deschide Claude…",
  "Opened the share sheet — pick Claude, then send the prompt.":
    "S-a deschis fereastra de partajare — alege Claude, apoi trimite promptul.",
  "Copied the prompt and opened Claude — paste it into the chat.":
    "Promptul a fost copiat și Claude s-a deschis — lipește-l în conversație.",
  "Copied the prompt — open Claude and paste it into a new chat.":
    "Promptul a fost copiat — deschide Claude și lipește-l într-o conversație nouă.",
  "Downloaded the prompt — open it, copy the text, and paste it into Claude.":
    "Promptul a fost descărcat — deschide-l, copiază textul și lipește-l în Claude.",
  "Couldn't open Claude. Try copying the prompt manually.":
    "Nu s-a putut deschide Claude. Încearcă să copiezi promptul manual.",
  "Copy prompt": "Copiază promptul",
  "Copying the prompt…": "Se copiază promptul…",
  "Copied the prompt — paste it into any AI chat.":
    "Promptul a fost copiat — lipește-l în orice conversație AI.",
  "Downloaded the prompt — open it and paste the text into any AI.":
    "Promptul a fost descărcat — deschide-l și lipește textul în orice AI.",
  "Couldn't copy the prompt. Try again.": "Nu s-a putut copia promptul. Încearcă din nou.",
  "Paste the JSON plan Claude gave you here…": "Lipește aici planul JSON pe care ți l-a dat Claude…",
  "Paste your plan from Claude": "Lipește planul tău de la Claude",
  "Add plan": "Adaugă planul",
  "Paste the plan from Claude first.": "Lipește mai întâi planul de la Claude.",
  'Added "{0}" from Claude. Edit it here.': 'Ai adăugat "{0}" de la Claude. Editează-l aici.',
  'Saved "{0}". Open Train to follow it.': 'Salvat "{0}". Deschide Antrenament pentru a-l urma.',
  "Couldn't read that plan. Make sure you pasted the whole JSON.":
    "Nu s-a putut citi acel plan. Asigură-te că ai lipit tot JSON-ul.",
  "Getting started": "Primii pași",
  "Get a plan from Claude": "Obține un plan de la Claude",
  "No coach yet? Tell Claude your goal and it drafts a starting routine. Hand off the prompt, then paste the plan back to save it and follow it from Train.":
    "Încă nu ai antrenor? Spune-i lui Claude obiectivul tău și îți schițează o rutină de început. Trimite promptul, apoi lipește planul înapoi pentru a-l salva și a-l urma din Antrenament.",
  "Step 1": "Pasul 1",
  "Your training": "Antrenamentul tău",
  Goal: "Obiectiv",
  Experience: "Experiență",
  "Days per week": "Zile pe săptămână",
  "Step 2": "Pasul 2",
  "Ask Claude": "Întreabă Claude",
  "Opens Claude with a ready-made prompt. On a phone, pick Claude from the share sheet; on desktop the prompt is copied and Claude opens in a new tab. Or just copy the prompt to use with any other AI.":
    "Deschide Claude cu un prompt gata făcut. Pe telefon, alege Claude din fereastra de partajare; pe desktop promptul este copiat și Claude se deschide într-un tab nou. Sau pur și simplu copiază promptul pentru a-l folosi cu orice alt AI.",
  "Step 3": "Pasul 3",
  "Paste it back": "Lipește-l înapoi",
  "Copy the JSON plan Claude replies with and paste it here to save it to your routines.":
    "Copiază planul JSON cu care răspunde Claude și lipește-l aici pentru a-l salva în rutinele tale.",
});

type StatusKind = "ok" | "err" | "info";

export function mountClaudeStart(root: HTMLElement, nav: Nav): Cleanup {
  const inputs: PlanInputs = { goal: "muscle", level: "beginner", daysPerWeek: 3 };

  const statusEl = h("p", { class: "status", role: "status", aria: { live: "polite" } });
  const setStatus = (msg: string, kind: StatusKind): void => {
    statusEl.textContent = msg;
    statusEl.className = `status status-${kind}`;
  };

  // ---- Step 1: inputs -------------------------------------------------------
  const goalSelect = h("select", { class: "field-select", aria: { label: t("Training goal") } }, [
    h("option", { value: "muscle", text: t("Build muscle") }),
    h("option", { value: "fat-loss", text: t("Lose fat") }),
    h("option", { value: "strength", text: t("Get stronger") }),
    h("option", { value: "calisthenics", text: t("Calisthenics") }),
  ]);
  goalSelect.addEventListener("change", () => {
    inputs.goal = goalSelect.value as Goal;
  });

  const levelSelect = h("select", { class: "field-select", aria: { label: t("Experience level") } }, [
    h("option", { value: "beginner", text: t("Beginner") }),
    h("option", { value: "intermediate", text: t("Intermediate") }),
    h("option", { value: "advanced", text: t("Advanced") }),
  ]);
  levelSelect.addEventListener("change", () => {
    inputs.level = levelSelect.value as Level;
  });

  const daysSelect = h(
    "select",
    { class: "field-select", aria: { label: t("Training days per week") } },
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

  // ---- Step 2: hand the prompt to Claude ------------------------------------
  let busy = false;
  const openBtn = h("button", { class: "btn btn-primary", type: "button", text: t("Open Claude") });
  openBtn.addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    setStatus(t("Opening Claude…"), "info");
    try {
      const result = await startPlanInClaude(buildPlanPrompt(inputs));
      const msg =
        result === "shared"
          ? t("Opened the share sheet — pick Claude, then send the prompt.")
          : result === "copied-opened"
            ? t("Copied the prompt and opened Claude — paste it into the chat.")
            : result === "copied"
              ? t("Copied the prompt — open Claude and paste it into a new chat.")
              : t("Downloaded the prompt — open it, copy the text, and paste it into Claude.");
      setStatus(msg, "ok");
    } catch {
      setStatus(t("Couldn't open Claude. Try copying the prompt manually."), "err");
    } finally {
      busy = false;
    }
  });

  // Plain copy for use with any other AI agent — no Claude handoff.
  const copyBtn = h("button", { class: "btn", type: "button", text: t("Copy prompt") });
  copyBtn.addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    setStatus(t("Copying the prompt…"), "info");
    try {
      const result = await copyPlanPrompt(buildPlanPrompt(inputs));
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

  // ---- Step 3: paste the plan back ------------------------------------------
  const pasteArea = h("textarea", {
    class: "claude-paste",
    rows: "8",
    placeholder: t("Paste the JSON plan Claude gave you here…"),
    aria: { label: t("Paste your plan from Claude") },
  });

  const addBtn = h("button", { class: "btn btn-accent", type: "button", text: t("Add plan") });
  addBtn.addEventListener("click", () => {
    if (pasteArea.value.trim() === "") {
      setStatus(t("Paste the plan from Claude first."), "err");
      return;
    }
    try {
      const stored = saveSheet(parsePlanFromText(pasteArea.value));
      if (loadMode() === "trainer") {
        // Trainer authors plans: open it in the Routines builder to refine.
        setSheetFlash(t('Added "{0}" from Claude. Edit it here.').replace("{0}", stored.name), "ok");
        nav.editSheet(cloneSheet(stored));
      } else {
        // Student follows plans: drop into Train so they can run the new one.
        // Stage it as the working copy in case they switch to Trainer to edit.
        setEditingSheet(cloneSheet(stored));
        setStatus(t('Saved "{0}". Open Train to follow it.').replace("{0}", stored.name), "ok");
        nav.go("train");
      }
    } catch (err) {
      setStatus(
        err instanceof Error
          ? err.message
          : t("Couldn't read that plan. Make sure you pasted the whole JSON."),
        "err",
      );
    }
  });

  root.appendChild(
    h("div", { class: "view view-claude-start" }, [
      h("section", { class: "hero" }, [
        h("p", { class: "eyebrow", text: t("Getting started") }),
        h("h1", { class: "display", text: t("Get a plan from Claude") }),
        h("p", {
          class: "lede",
          text: t("No coach yet? Tell Claude your goal and it drafts a starting routine. Hand off the prompt, then paste the plan back to save it and follow it from Train."),
        }),
      ]),
      h("section", { class: "card" }, [
        h("p", { class: "eyebrow", text: t("Step 1") }),
        h("h2", { class: "section-title", text: t("Your training") }),
        h("label", { class: "field" }, [
          h("span", { class: "field-label", text: t("Goal") }),
          goalSelect,
        ]),
        h("label", { class: "field" }, [
          h("span", { class: "field-label", text: t("Experience") }),
          levelSelect,
        ]),
        h("label", { class: "field" }, [
          h("span", { class: "field-label", text: t("Days per week") }),
          daysSelect,
        ]),
      ]),
      h("section", { class: "card" }, [
        h("p", { class: "eyebrow", text: t("Step 2") }),
        h("h2", { class: "section-title", text: t("Ask Claude") }),
        h("p", {
          class: "plan-meta",
          text: t("Opens Claude with a ready-made prompt. On a phone, pick Claude from the share sheet; on desktop the prompt is copied and Claude opens in a new tab. Or just copy the prompt to use with any other AI."),
        }),
        h("div", { class: "btn-row" }, [openBtn, copyBtn]),
      ]),
      h("section", { class: "card" }, [
        h("p", { class: "eyebrow", text: t("Step 3") }),
        h("h2", { class: "section-title", text: t("Paste it back") }),
        h("p", {
          class: "plan-meta",
          text: t("Copy the JSON plan Claude replies with and paste it here to save it to your routines."),
        }),
        pasteArea,
        h("div", { class: "btn-row" }, [addBtn]),
      ]),
      statusEl,
    ]),
  );

  return () => {};
}
