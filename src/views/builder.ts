import { clear, h } from "../dom";
import { blankExercise, blankPlan } from "../plan";
import type { Nav } from "../router";
import { state } from "../state";
import { savePlan } from "../storage";
import { EQUIPMENT, EQUIPMENT_LABELS, isBodyweight, type Equipment, type Exercise } from "../types";
import { clonePlan, planToJson, slug, totalSets } from "../util";
import { parsePlanJson, ValidationError } from "../validate";
import { numberField } from "./fields";

type StatusKind = "ok" | "err" | "info";

interface PendingStatus {
  msg: string;
  kind: StatusKind;
}

// Survives the re-mount that an import triggers, so the success message shows
// once on the freshly mounted builder.
let pending: PendingStatus | null = null;

export function mountBuilder(root: HTMLElement, nav: Nav): void {
  // Captured once: state.editing IS this object, so mutations persist and
  // navigating away/back re-reads the same live plan.
  const plan = state.editing;

  const statusEl = h("p", { class: "status", role: "status", aria: { live: "polite" } });
  const setStatus = (msg: string, kind: StatusKind): void => {
    statusEl.textContent = msg;
    statusEl.className = `status status-${kind}`;
  };

  const metaEl = h("p", { class: "plan-meta" });
  const exercisesHost = h("div", { class: "exercises" });

  const renderEquipmentToggle = (ex: Exercise): HTMLElement =>
    h(
      "div",
      { class: "toggle", role: "group", aria: { label: "Equipment" } },
      EQUIPMENT.map((eq: Equipment) =>
        h("button", {
          class: ex.equipment === eq ? "toggle-btn active" : "toggle-btn",
          type: "button",
          text: EQUIPMENT_LABELS[eq],
          aria: { pressed: String(ex.equipment === eq) },
          on: {
            click: () => {
              ex.equipment = eq;
              renderExercises();
            },
          },
        }),
      ),
    );

  const renderSet = (ex: Exercise, setIndex: number): HTMLElement => {
    const ws = ex.sets[setIndex]!;
    return h("div", { class: "set-row" }, [
      h("span", { class: "set-no", text: `Set ${setIndex + 1}` }),
      numberField({
        label: "Reps",
        value: ws.reps,
        step: 1,
        min: 0,
        integer: true,
        onCommit: (n) => {
          ws.reps = n;
        },
      }),
      numberField({
        label: isBodyweight(ex.equipment) ? "Added weight (kg)" : "Weight (kg)",
        value: ws.weightKg,
        step: 2.5,
        min: 0,
        integer: false,
        onCommit: (n) => {
          ws.weightKg = n;
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
            renderExercises();
          },
        },
      }),
    ]);
  };

  const renderExercise = (ex: Exercise, exIndex: number): HTMLElement => {
    const nameInput = h("input", {
      class: "ex-name",
      type: "text",
      value: ex.name,
      placeholder: "Exercise name",
      aria: { label: "Exercise name" },
    });
    nameInput.addEventListener("input", () => {
      ex.name = nameInput.value;
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
              plan.exercises.splice(exIndex, 1);
              renderExercises();
            },
          },
        }),
      ]),
      renderEquipmentToggle(ex),
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
            renderExercises();
          },
        },
      }),
    ]);
  };

  function renderExercises(): void {
    clear(exercisesHost);
    if (plan.exercises.length === 0) {
      exercisesHost.appendChild(
        h("p", { class: "empty", text: "No exercises yet — add one to get started." }),
      );
    } else {
      plan.exercises.forEach((ex, i) => exercisesHost.appendChild(renderExercise(ex, i)));
    }
    metaEl.textContent = `${plan.exercises.length} exercises · ${totalSets(plan)} sets`;
  }

  // ---- Top: plan name + rest ------------------------------------------------
  const nameInput = h("input", {
    class: "plan-name-input",
    type: "text",
    value: plan.name,
    placeholder: "Plan name",
    aria: { label: "Plan name" },
  });
  nameInput.addEventListener("input", () => {
    plan.name = nameInput.value;
  });

  const head = h("section", { class: "card builder-head" }, [
    h("label", { class: "field" }, [
      h("span", { class: "field-label", text: "Plan name" }),
      nameInput,
    ]),
    numberField({
      label: "Rest between sets (seconds)",
      value: plan.restSec,
      step: 5,
      min: 0,
      integer: true,
      onCommit: (n) => {
        plan.restSec = n;
      },
    }),
    metaEl,
  ]);

  // ---- Data: save / export / import ----------------------------------------
  const importFile = h("input", {
    class: "file-input",
    type: "file",
    accept: ".json,application/json",
    aria: { label: "Import plan from JSON file" },
  });
  importFile.addEventListener("change", () => {
    const file = importFile.files?.[0];
    importFile.value = "";
    if (!file) return;
    file
      .text()
      .then((text) => loadFromText(text, `Imported "${file.name}".`))
      .catch(() => setStatus("Could not read that file.", "err"));
  });

  const pasteArea = h("textarea", {
    class: "paste-area",
    rows: "6",
    placeholder: "Paste plan JSON here, then press Load…",
    aria: { label: "Paste plan JSON" },
  });

  function loadFromText(text: string, okMsg: string): void {
    try {
      const imported = parsePlanJson(text);
      pending = { msg: okMsg, kind: "ok" };
      nav.edit(imported); // re-mounts the builder on the imported plan
    } catch (err) {
      const msg = err instanceof ValidationError ? err.message : "Could not import that JSON.";
      setStatus(`Rejected: ${msg}`, "err");
    }
  }

  function downloadJson(): void {
    const blob = new Blob([planToJson(plan)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = h("a", { href: url, download: `${slug(plan.name)}.gymlog.json` });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus("Downloaded JSON file.", "ok");
  }

  function fallbackCopy(json: string): void {
    pasteArea.value = json;
    pasteArea.focus();
    pasteArea.select();
    setStatus("Clipboard unavailable — JSON placed in the paste box; copy it manually.", "info");
  }

  function copyJson(): void {
    const json = planToJson(plan);
    const clip = navigator.clipboard;
    if (clip && typeof clip.writeText === "function") {
      clip.writeText(json).then(
        () => setStatus("Copied JSON to clipboard.", "ok"),
        () => fallbackCopy(json),
      );
    } else {
      fallbackCopy(json);
    }
  }

  const dataSection = h("section", { class: "card data" }, [
    h("h2", { class: "section-title", text: "Save · Export · Import" }),
    h("div", { class: "btn-row" }, [
      h("button", {
        class: "btn btn-primary",
        type: "button",
        text: "Save",
        on: {
          click: () => {
            plan.updatedAt = savePlan(plan).updatedAt;
            setStatus(`Saved "${plan.name}" to this browser.`, "ok");
          },
        },
      }),
      h("button", { class: "btn", type: "button", text: "Download JSON", on: { click: downloadJson } }),
      h("button", { class: "btn", type: "button", text: "Copy JSON", on: { click: copyJson } }),
    ]),
    h("div", { class: "import-grid" }, [
      h("label", { class: "field" }, [
        h("span", { class: "field-label", text: "Import from file" }),
        importFile,
      ]),
      h("div", { class: "field" }, [
        h("span", { class: "field-label", text: "Or paste JSON" }),
        pasteArea,
        h("button", {
          class: "btn btn-small",
          type: "button",
          text: "Load pasted JSON",
          on: { click: () => loadFromText(pasteArea.value, "Loaded pasted plan.") },
        }),
      ]),
    ]),
    statusEl,
  ]);

  // ---- Assemble -------------------------------------------------------------
  const container = h("div", { class: "view view-builder" }, [
    h("h1", { class: "view-title", text: "Builder" }),
    head,
    h("div", { class: "btn-row" }, [
      h("button", {
        class: "btn btn-small",
        type: "button",
        text: "+ Add exercise",
        on: {
          click: () => {
            plan.exercises.push(blankExercise());
            renderExercises();
          },
        },
      }),
    ]),
    exercisesHost,
    dataSection,
    h("div", { class: "btn-row builder-footer" }, [
      h("button", {
        class: "btn btn-accent",
        type: "button",
        text: "Start session ▸",
        on: { click: () => nav.start(clonePlan(plan)) },
      }),
      h("button", {
        class: "btn",
        type: "button",
        text: "+ New plan",
        on: { click: () => nav.edit(blankPlan()) },
      }),
      h("button", {
        class: "btn",
        type: "button",
        text: "View saved",
        on: { click: () => nav.go("saved") },
      }),
    ]),
  ]);

  renderExercises();
  if (pending) {
    setStatus(pending.msg, pending.kind);
    pending = null;
  }
  root.appendChild(container);
}
