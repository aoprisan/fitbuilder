import { buildPlanPrompt, parsePlanFromText, type Goal, type Level, type PlanInputs } from "../claudePlan";
import { h } from "../dom";
import { copyPlanPrompt, startPlanInClaude } from "../exporters";
import { loadMode } from "../mode";
import type { Cleanup, Nav } from "../router";
import { saveSheet } from "../sheetStorage";
import { setEditingSheet, setSheetFlash } from "../state";
import { cloneSheet } from "../util";

type StatusKind = "ok" | "err" | "info";

export function mountClaudeStart(root: HTMLElement, nav: Nav): Cleanup {
  const inputs: PlanInputs = { goal: "muscle", level: "beginner", daysPerWeek: 3 };

  const statusEl = h("p", { class: "status", role: "status", aria: { live: "polite" } });
  const setStatus = (msg: string, kind: StatusKind): void => {
    statusEl.textContent = msg;
    statusEl.className = `status status-${kind}`;
  };

  // ---- Step 1: inputs -------------------------------------------------------
  const goalSelect = h("select", { class: "field-select", aria: { label: "Training goal" } }, [
    h("option", { value: "muscle", text: "Build muscle" }),
    h("option", { value: "fat-loss", text: "Lose fat" }),
    h("option", { value: "strength", text: "Get stronger" }),
    h("option", { value: "calisthenics", text: "Calisthenics" }),
  ]);
  goalSelect.addEventListener("change", () => {
    inputs.goal = goalSelect.value as Goal;
  });

  const levelSelect = h("select", { class: "field-select", aria: { label: "Experience level" } }, [
    h("option", { value: "beginner", text: "Beginner" }),
    h("option", { value: "intermediate", text: "Intermediate" }),
    h("option", { value: "advanced", text: "Advanced" }),
  ]);
  levelSelect.addEventListener("change", () => {
    inputs.level = levelSelect.value as Level;
  });

  const daysSelect = h(
    "select",
    { class: "field-select", aria: { label: "Training days per week" } },
    [1, 2, 3, 4, 5, 6].map((n) =>
      h("option", { value: String(n), text: `${n} ${n === 1 ? "day" : "days"} / week` }),
    ),
  );
  daysSelect.value = String(inputs.daysPerWeek);
  daysSelect.addEventListener("change", () => {
    inputs.daysPerWeek = Number(daysSelect.value);
  });

  // ---- Step 2: hand the prompt to Claude ------------------------------------
  let busy = false;
  const openBtn = h("button", { class: "btn btn-primary", type: "button", text: "Open Claude" });
  openBtn.addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    setStatus("Opening Claude…", "info");
    try {
      const result = await startPlanInClaude(buildPlanPrompt(inputs));
      const msg =
        result === "shared"
          ? "Opened the share sheet — pick Claude, then send the prompt."
          : result === "copied-opened"
            ? "Copied the prompt and opened Claude — paste it into the chat."
            : result === "copied"
              ? "Copied the prompt — open Claude and paste it into a new chat."
              : "Downloaded the prompt — open it, copy the text, and paste it into Claude.";
      setStatus(msg, "ok");
    } catch {
      setStatus("Couldn't open Claude. Try copying the prompt manually.", "err");
    } finally {
      busy = false;
    }
  });

  // Plain copy for use with any other AI agent — no Claude handoff.
  const copyBtn = h("button", { class: "btn", type: "button", text: "Copy prompt" });
  copyBtn.addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    setStatus("Copying the prompt…", "info");
    try {
      const result = await copyPlanPrompt(buildPlanPrompt(inputs));
      setStatus(
        result === "copied"
          ? "Copied the prompt — paste it into any AI chat."
          : "Downloaded the prompt — open it and paste the text into any AI.",
        "ok",
      );
    } catch {
      setStatus("Couldn't copy the prompt. Try again.", "err");
    } finally {
      busy = false;
    }
  });

  // ---- Step 3: paste the plan back ------------------------------------------
  const pasteArea = h("textarea", {
    class: "claude-paste",
    rows: "8",
    placeholder: "Paste the JSON plan Claude gave you here…",
    aria: { label: "Paste your plan from Claude" },
  });

  const addBtn = h("button", { class: "btn btn-accent", type: "button", text: "Add plan" });
  addBtn.addEventListener("click", () => {
    if (pasteArea.value.trim() === "") {
      setStatus("Paste the plan from Claude first.", "err");
      return;
    }
    try {
      const stored = saveSheet(parsePlanFromText(pasteArea.value));
      if (loadMode() === "trainer") {
        // Trainer authors plans: open it in the Routines builder to refine.
        setSheetFlash(`Added "${stored.name}" from Claude. Edit it here.`, "ok");
        nav.editSheet(cloneSheet(stored));
      } else {
        // Student follows plans: drop into Train so they can run the new one.
        // Stage it as the working copy in case they switch to Trainer to edit.
        setEditingSheet(cloneSheet(stored));
        setStatus(`Saved "${stored.name}". Open Train to follow it.`, "ok");
        nav.go("train");
      }
    } catch (err) {
      setStatus(
        err instanceof Error
          ? err.message
          : "Couldn't read that plan. Make sure you pasted the whole JSON.",
        "err",
      );
    }
  });

  root.appendChild(
    h("div", { class: "view view-claude-start" }, [
      h("section", { class: "hero" }, [
        h("p", { class: "eyebrow", text: "Getting started" }),
        h("h1", { class: "display", text: "Get a plan from Claude" }),
        h("p", {
          class: "lede",
          text: "No coach yet? Tell Claude your goal and it drafts a starting routine. Hand off the prompt, then paste the plan back to save it and follow it from Train.",
        }),
      ]),
      h("section", { class: "card" }, [
        h("p", { class: "eyebrow", text: "Step 1" }),
        h("h2", { class: "section-title", text: "Your training" }),
        h("label", { class: "field" }, [
          h("span", { class: "field-label", text: "Goal" }),
          goalSelect,
        ]),
        h("label", { class: "field" }, [
          h("span", { class: "field-label", text: "Experience" }),
          levelSelect,
        ]),
        h("label", { class: "field" }, [
          h("span", { class: "field-label", text: "Days per week" }),
          daysSelect,
        ]),
      ]),
      h("section", { class: "card" }, [
        h("p", { class: "eyebrow", text: "Step 2" }),
        h("h2", { class: "section-title", text: "Ask Claude" }),
        h("p", {
          class: "plan-meta",
          text: "Opens Claude with a ready-made prompt. On a phone, pick Claude from the share sheet; on desktop the prompt is copied and Claude opens in a new tab. Or just copy the prompt to use with any other AI.",
        }),
        h("div", { class: "btn-row" }, [openBtn, copyBtn]),
      ]),
      h("section", { class: "card" }, [
        h("p", { class: "eyebrow", text: "Step 3" }),
        h("h2", { class: "section-title", text: "Paste it back" }),
        h("p", {
          class: "plan-meta",
          text: "Copy the JSON plan Claude replies with and paste it here to save it to your routines.",
        }),
        pasteArea,
        h("div", { class: "btn-row" }, [addBtn]),
      ]),
      statusEl,
    ]),
  );

  return () => {};
}
