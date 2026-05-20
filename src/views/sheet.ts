import { clear, h } from "../dom";
import { canShareFiles, exportSheetPdf, exportSheetPng, shareSheet } from "../exporters";
import type { Cleanup, Nav } from "../router";
import { blankRoutine, blankRoutineExercise, blankSheet, singleRoutineSheet } from "../sheet";
import { deleteSheet, loadSheets, saveSheet } from "../sheetStorage";
import { state } from "../state";
import type { Routine, RoutineExercise } from "../types";
import { cloneSheet, sheetToJson, slug } from "../util";

type StatusKind = "ok" | "err" | "info";

export function mountSheet(root: HTMLElement, nav: Nav): Cleanup {
  // Captured once: state.editingSheet IS this object, so edits persist across
  // navigation and the export reads exactly what's on screen.
  const sheet = state.editingSheet;

  // Whole-sheet Run/Export/Save are hidden for now — each routine card carries
  // its own actions instead. Flip to true to bring the sheet-wide controls back.
  const SHOW_SHEET_ACTIONS = false;

  const statusEl = h("p", { class: "status", role: "status", aria: { live: "polite" } });
  const setStatus = (msg: string, kind: StatusKind): void => {
    statusEl.textContent = msg;
    statusEl.className = `status status-${kind}`;
  };

  const metaEl = h("p", { class: "plan-meta" });
  const routinesHost = h("div", { class: "routines" });

  const exerciseCount = (): number =>
    sheet.routines.reduce((sum, r) => sum + r.exercises.length, 0);

  // ---- Exercise row ---------------------------------------------------------
  const renderExerciseRow = (routine: Routine, ex: RoutineExercise, exIndex: number): HTMLElement => {
    const nameInput = h("input", {
      class: "rex-name",
      type: "text",
      value: ex.name,
      placeholder: "Exercise",
      aria: { label: `exercise ${exIndex + 1} name` },
    });
    nameInput.addEventListener("input", () => {
      ex.name = nameInput.value;
    });

    const presInput = h("input", {
      class: "rex-pres",
      type: "text",
      value: ex.prescription,
      placeholder: "e.g. 30-50 repetari",
      aria: { label: `exercise ${exIndex + 1} prescription` },
    });
    presInput.addEventListener("input", () => {
      ex.prescription = presInput.value;
    });

    return h("div", { class: "routine-ex-row" }, [
      h("span", { class: "rex-index", text: String(exIndex + 1) }),
      nameInput,
      presInput,
      h("button", {
        class: "icon-btn danger rex-remove",
        type: "button",
        text: "✕",
        aria: { label: `remove exercise ${exIndex + 1}` },
        disabled: routine.exercises.length <= 1,
        on: {
          click: () => {
            if (routine.exercises.length <= 1) return;
            routine.exercises.splice(exIndex, 1);
            renderRoutines();
          },
        },
      }),
    ]);
  };

  // ---- Routine card ---------------------------------------------------------
  const renderRoutine = (routine: Routine, rIndex: number): HTMLElement => {
    const titleInput = h("input", {
      class: "routine-title-input",
      type: "text",
      value: routine.title,
      placeholder: "Routine title",
      aria: { label: `routine ${rIndex + 1} title` },
    });
    titleInput.addEventListener("input", () => {
      routine.title = titleInput.value;
    });

    const tagsInput = h("input", {
      class: "tags-input",
      type: "text",
      value: routine.tags.join(", "),
      placeholder: "INTERMEDIAR+, PARC, 60-100 antrenamente",
      aria: { label: `routine ${rIndex + 1} tags` },
    });
    tagsInput.addEventListener("input", () => {
      routine.tags = tagsInput.value
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t !== "");
    });

    return h("section", { class: "card routine-card" }, [
      h("div", { class: "routine-head" }, [
        h("span", { class: "routine-no", text: `R${rIndex + 1}` }),
        titleInput,
        h("button", {
          class: "icon-btn danger",
          type: "button",
          text: "Delete",
          aria: { label: `delete routine ${rIndex + 1}` },
          on: {
            click: () => {
              sheet.routines.splice(rIndex, 1);
              renderRoutines();
            },
          },
        }),
      ]),
      h("label", { class: "field" }, [
        h("span", { class: "field-label", text: "Tags (comma separated)" }),
        tagsInput,
      ]),
      h("div", { class: "routine-cols" }, [
        h("span", { class: "rex-col-label rex-col-name", text: "Exercise" }),
        h("span", { class: "rex-col-label rex-col-pres", text: "Prescription" }),
      ]),
      h(
        "div",
        { class: "routine-ex-list" },
        routine.exercises.map((ex, i) => renderExerciseRow(routine, ex, i)),
      ),
      h("button", {
        class: "btn btn-small",
        type: "button",
        text: "+ Add exercise",
        on: {
          click: () => {
            routine.exercises.push(blankRoutineExercise());
            renderRoutines();
          },
        },
      }),
      // Per-routine actions — run, export, or save just this routine. Each
      // builds a fresh single-routine sheet on click, so it reflects live edits.
      h("div", { class: "btn-row routine-actions" }, [
        h("button", {
          class: "btn btn-small btn-accent",
          type: "button",
          text: "Run ▸",
          aria: { label: `run routine ${rIndex + 1}` },
          on: { click: () => nav.runSheet(singleRoutineSheet(sheet, routine, rIndex)) },
        }),
        h("button", {
          class: "btn btn-small",
          type: "button",
          text: "Share ▸",
          aria: { label: `share routine ${rIndex + 1}` },
          on: {
            click: () =>
              runExport("Share", async () => {
                const result = await shareSheet(singleRoutineSheet(sheet, routine, rIndex));
                setStatus(
                  result === "shared"
                    ? "Opened the share sheet — pick WhatsApp."
                    : "Sharing isn't available here, so the PNG was downloaded instead.",
                  "ok",
                );
              }),
          },
        }),
        h("button", {
          class: "btn btn-small",
          type: "button",
          text: "PNG",
          aria: { label: `save routine ${rIndex + 1} as PNG` },
          on: {
            click: () =>
              runExport("Save PNG", () => exportSheetPng(singleRoutineSheet(sheet, routine, rIndex))),
          },
        }),
        h("button", {
          class: "btn btn-small",
          type: "button",
          text: "PDF",
          aria: { label: `save routine ${rIndex + 1} as PDF` },
          on: {
            click: () =>
              runExport("Save PDF", () => exportSheetPdf(singleRoutineSheet(sheet, routine, rIndex))),
          },
        }),
        h("button", {
          class: "btn btn-small btn-primary",
          type: "button",
          text: "Save",
          aria: { label: `save routine ${rIndex + 1} to library` },
          on: {
            click: () => {
              const saved = saveSheet(singleRoutineSheet(sheet, routine, rIndex));
              setStatus(`Saved "${saved.name}" to your library.`, "ok");
              renderSaved();
            },
          },
        }),
      ]),
    ]);
  };

  function renderRoutines(): void {
    clear(routinesHost);
    if (sheet.routines.length === 0) {
      routinesHost.appendChild(
        h("p", { class: "empty", text: "No routines yet — add one to get started." }),
      );
    } else {
      sheet.routines.forEach((r, i) => routinesHost.appendChild(renderRoutine(r, i)));
    }
    metaEl.textContent = `${sheet.routines.length} routines · ${exerciseCount()} exercises`;
  }

  // ---- Sheet name -----------------------------------------------------------
  const nameInput = h("input", {
    class: "plan-name-input",
    type: "text",
    value: sheet.name,
    placeholder: "Sheet name",
    aria: { label: "Sheet name" },
  });
  nameInput.addEventListener("input", () => {
    sheet.name = nameInput.value;
  });

  const head = h("section", { class: "card builder-head" }, [
    h("label", { class: "field" }, [
      h("span", { class: "field-label", text: "Sheet name" }),
      nameInput,
    ]),
    metaEl,
  ]);

  // ---- Export ---------------------------------------------------------------
  // Guard against double-taps while the (async) render/encode runs.
  let busy = false;
  async function runExport(label: string, fn: () => Promise<void>): Promise<void> {
    if (busy) return;
    busy = true;
    setStatus(`${label}…`, "info");
    try {
      await fn();
      setStatus(`${label} ready.`, "ok");
    } catch {
      setStatus(`Could not ${label.toLowerCase()}. Try again.`, "err");
    } finally {
      busy = false;
    }
  }

  const shareBtn = h("button", {
    class: "btn btn-primary",
    type: "button",
    text: "Share ▸",
    on: {
      click: () =>
        runExport("Share", async () => {
          const result = await shareSheet(sheet);
          setStatus(
            result === "shared"
              ? "Opened the share sheet — pick WhatsApp."
              : "Sharing isn't available here, so the PNG was downloaded instead.",
            "ok",
          );
        }),
    },
  });

  const exportSection = h("section", { class: "card data" }, [
    h("h2", { class: "section-title", text: "Export · Share" }),
    h("p", {
      class: "export-hint",
      text: canShareFiles()
        ? "Share sends a PNG to the native share sheet — pick WhatsApp. Or save a PNG/PDF file."
        : "Save a PNG or PDF, then attach it in WhatsApp. (Direct share works on phones.)",
    }),
    h("div", { class: "btn-row" }, [
      shareBtn,
      h("button", {
        class: "btn",
        type: "button",
        text: "Save PNG",
        on: { click: () => runExport("Save PNG", () => exportSheetPng(sheet)) },
      }),
      h("button", {
        class: "btn",
        type: "button",
        text: "Save PDF",
        on: { click: () => runExport("Save PDF", () => exportSheetPdf(sheet)) },
      }),
    ]),
  ]);

  // ---- Saved sheets ---------------------------------------------------------
  const savedHost = h("div", { class: "saved-list saved-sheets" });

  function renderSaved(): void {
    clear(savedHost);
    const sheets = loadSheets().sort(
      (a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""),
    );
    if (sheets.length === 0) {
      savedHost.appendChild(
        h("p", { class: "empty", text: "No saved sheets yet. Press Save to keep this one." }),
      );
      return;
    }
    for (const s of sheets) {
      const exCount = s.routines.reduce((sum, r) => sum + r.exercises.length, 0);
      savedHost.appendChild(
        h("section", { class: "card saved-item" }, [
          h("div", { class: "saved-info" }, [
            h("p", { class: "plan-name", text: s.name }),
            h("p", {
              class: "plan-meta",
              text: `${s.routines.length} routines · ${exCount} exercises`,
            }),
          ]),
          h("div", { class: "btn-row saved-actions" }, [
            h("button", {
              class: "btn btn-small btn-accent",
              type: "button",
              text: "Run ▸",
              on: { click: () => nav.runSheet(cloneSheet(s)) },
            }),
            h("button", {
              class: "btn btn-small",
              type: "button",
              text: "Open",
              on: { click: () => nav.editSheet(cloneSheet(s)) },
            }),
            h("button", {
              class: "btn btn-small danger",
              type: "button",
              text: "Delete",
              on: {
                click: () => {
                  if (!confirm(`Delete "${s.name}"? This cannot be undone.`)) return;
                  deleteSheet(s.id);
                  renderSaved();
                },
              },
            }),
          ]),
        ]),
      );
    }
  }

  const dataSection = h("section", { class: "card data" }, [
    h("h2", { class: "section-title", text: "Save · Library" }),
    h("div", { class: "btn-row" }, [
      ...(SHOW_SHEET_ACTIONS
        ? [
            h("button", {
              class: "btn btn-primary",
              type: "button",
              text: "Save",
              on: {
                click: () => {
                  sheet.updatedAt = saveSheet(sheet).updatedAt;
                  setStatus(`Saved "${sheet.name}" to this browser.`, "ok");
                  renderSaved();
                },
              },
            }),
            h("button", {
              class: "btn",
              type: "button",
              text: "Download JSON",
              on: {
                click: () => {
                  const blob = new Blob([sheetToJson(sheet)], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = h("a", { href: url, download: `${slug(sheet.name)}.sheet.json` });
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(url);
                  setStatus("Downloaded JSON file.", "ok");
                },
              },
            }),
          ]
        : []),
      h("button", {
        class: "btn",
        type: "button",
        text: "New sheet",
        on: { click: () => nav.editSheet(blankSheet()) },
      }),
    ]),
    savedHost,
  ]);

  // ---- Assemble -------------------------------------------------------------
  const container = h("div", { class: "view view-sheet" }, [
    h("h1", { class: "view-title", text: "Routines" }),
    head,
    h("div", { class: "btn-row" }, [
      h("button", {
        class: "btn btn-small",
        type: "button",
        text: "+ Add routine",
        on: {
          click: () => {
            sheet.routines.push(blankRoutine());
            renderRoutines();
          },
        },
      }),
      ...(SHOW_SHEET_ACTIONS
        ? [
            h("button", {
              class: "btn btn-small btn-accent",
              type: "button",
              text: "Run ▸",
              on: { click: () => nav.runSheet(cloneSheet(sheet)) },
            }),
          ]
        : []),
    ]),
    routinesHost,
    statusEl,
    ...(SHOW_SHEET_ACTIONS ? [exportSection] : []),
    dataSection,
  ]);

  renderRoutines();
  renderSaved();
  root.appendChild(container);
  return () => {};
}
