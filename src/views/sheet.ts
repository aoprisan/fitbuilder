import { clear, h } from "../dom";
import { canShareFiles, exportRoutineQrPng, exportSheetPdf, exportSheetPng, shareRoutineLink, shareSheet } from "../exporters";
import { ImportError, importRoutineFile } from "../import";
import { renderRoutineQrCanvas } from "../qr";
import { clearLogo, fileToLogoDataUrl, loadLogo, LogoError, saveLogo } from "../logo";
import type { Cleanup, Nav } from "../router";
import { blankRoutine, blankRoutineExercise, blankSheet, singleRoutineSheet } from "../sheet";
import { deleteSheet, loadSheets, saveSheet } from "../sheetStorage";
import { setSheetFlash, state, takeSheetFlash } from "../state";
import { loadTrainer, saveTrainer } from "../trainer";
import type { Routine, RoutineExercise, RoutineSheet, SetTarget } from "../types";
import { cloneSheet, sheetToJson, slug } from "../util";

type StatusKind = "ok" | "err" | "info";

/**
 * Show a routine's QR code in a modal overlay (scan to load, or save to print
 * for a group session). Lives on document.body, so the caller must hold the
 * returned close fn and call it on view teardown. Returns a no-op disposer.
 */
function showQrOverlay(canvas: HTMLCanvasElement, title: string, onSavePng: () => void): () => void {
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") close();
  };
  function close(): void {
    document.removeEventListener("keydown", onKey);
    overlay.remove();
  }

  canvas.classList.add("qr-overlay__canvas");
  const card = h(
    "div",
    { class: "qr-overlay__card", role: "dialog", aria: { modal: "true", label: `QR code for ${title}` } },
    [
      h("p", { class: "qr-overlay__title", text: title }),
      canvas,
      h("p", {
        class: "qr-overlay__hint",
        text: "Scan to load this routine — or save it as a PNG to print for a group session.",
      }),
      h("div", { class: "btn-row qr-overlay__actions" }, [
        h("button", { class: "btn btn-small btn-primary", type: "button", text: "Save PNG", on: { click: onSavePng } }),
        h("button", { class: "btn btn-small", type: "button", text: "Close", on: { click: () => close() } }),
      ]),
    ],
  );
  const overlay = h(
    "div",
    { class: "qr-overlay", on: { click: (e) => { if (e.target === overlay) close(); } } },
    [card],
  );
  document.addEventListener("keydown", onKey);
  document.body.appendChild(overlay);
  return close;
}

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

  // ---- Per-set structured target editor -------------------------------------
  // Optional: a trainer can prescribe sets/reps/load (e.g. "deadlift 3×10 @ 20kg",
  // or a ramp "12,10,8 @ 60/70/80"). When present these drive the Execute runner;
  // when absent the row stays pure free-text. Structure changes re-render; typing
  // into a set's reps/kg mutates in place so focus is kept.
  const numInput = (value: string, placeholder: string, label: string): HTMLInputElement =>
    h("input", {
      class: "rex-set-input",
      type: "number",
      inputmode: "decimal",
      min: "0",
      step: "1",
      value,
      placeholder,
      aria: { label },
    });

  const renderStructured = (ex: RoutineExercise, exIndex: number): HTMLElement => {
    const targets = ex.setTargets;

    if (!targets || targets.length === 0) {
      return h("div", { class: "rex-structured" }, [
        h("button", {
          class: "btn btn-small rex-sets-add",
          type: "button",
          text: "+ Sets · reps · load",
          aria: { label: `add structured sets to exercise ${exIndex + 1}` },
          on: {
            click: () => {
              ex.setTargets = [{ reps: 10 }];
              renderRoutines();
            },
          },
        }),
      ]);
    }

    // Quick-fill: materialize N identical sets, which can then be tweaked per row.
    const qfSets = numInput("", "sets", `quick-fill set count for exercise ${exIndex + 1}`);
    const qfReps = numInput("", "reps", `quick-fill reps for exercise ${exIndex + 1}`);
    const qfLoad = numInput("", "kg", `quick-fill load for exercise ${exIndex + 1}`);
    qfSets.step = "1";
    qfLoad.step = "2.5";
    const applyQuickFill = (): void => {
      const sets = Math.floor(parseFloat(qfSets.value));
      const reps = Math.floor(parseFloat(qfReps.value));
      const load = parseFloat(qfLoad.value);
      if (!Number.isFinite(sets) || sets < 1 || !Number.isFinite(reps) || reps < 1) return;
      const target: SetTarget = {
        reps,
        ...(Number.isFinite(load) && load > 0 ? { loadKg: load } : {}),
      };
      ex.setTargets = Array.from({ length: sets }, () => ({ ...target }));
      renderRoutines();
    };

    const setRow = (t: SetTarget, i: number): HTMLElement => {
      const reps = numInput(String(t.reps), "reps", `set ${i + 1} reps`);
      reps.step = "1";
      reps.addEventListener("input", () => {
        const n = Math.floor(parseFloat(reps.value));
        if (Number.isFinite(n) && n > 0) t.reps = n;
      });
      const load = numInput(t.loadKg !== undefined ? String(t.loadKg) : "", "BW", `set ${i + 1} load kg`);
      load.step = "2.5";
      load.addEventListener("input", () => {
        const n = parseFloat(load.value);
        if (Number.isFinite(n) && n > 0) t.loadKg = n;
        else delete t.loadKg;
      });
      return h("div", { class: "rex-set-row" }, [
        h("span", { class: "rex-set-no", text: `${i + 1}` }),
        reps,
        h("span", { class: "rex-set-x", text: "reps" }),
        load,
        h("span", { class: "rex-set-x", text: "kg" }),
        h("button", {
          class: "icon-btn danger rex-set-remove",
          type: "button",
          text: "✕",
          aria: { label: `remove set ${i + 1}` },
          on: {
            click: () => {
              targets.splice(i, 1);
              if (targets.length === 0) delete ex.setTargets;
              renderRoutines();
            },
          },
        }),
      ]);
    };

    return h("div", { class: "rex-structured" }, [
      h("div", { class: "rex-sets-head" }, [
        h("span", { class: "rex-sets-title", text: "Per-set targets" }),
        h("button", {
          class: "btn btn-tiny rex-sets-clear",
          type: "button",
          text: "Use free text",
          aria: { label: `remove structured sets from exercise ${exIndex + 1}` },
          on: {
            click: () => {
              delete ex.setTargets;
              renderRoutines();
            },
          },
        }),
      ]),
      h("div", { class: "rex-quickfill" }, [
        qfSets,
        h("span", { class: "rex-set-x", text: "×" }),
        qfReps,
        h("span", { class: "rex-set-x", text: "@" }),
        qfLoad,
        h("button", {
          class: "btn btn-tiny",
          type: "button",
          text: "Fill",
          aria: { label: `apply quick-fill to exercise ${exIndex + 1}` },
          on: { click: applyQuickFill },
        }),
      ]),
      h("div", { class: "rex-set-list" }, targets.map((t, i) => setRow(t, i))),
      h("button", {
        class: "btn btn-tiny rex-sets-add",
        type: "button",
        text: "+ set",
        aria: { label: `add a set to exercise ${exIndex + 1}` },
        on: {
          click: () => {
            const last = targets[targets.length - 1];
            targets.push(last ? { ...last } : { reps: 10 });
            renderRoutines();
          },
        },
      }),
    ]);
  };

  // ---- Exercise row ---------------------------------------------------------
  const renderExerciseRow = (routine: Routine, ex: RoutineExercise, exIndex: number): HTMLElement => {
    const structured = !!(ex.setTargets && ex.setTargets.length > 0);

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
      placeholder: structured ? "Optional note" : "e.g. 30-50 repetari",
      aria: { label: `exercise ${exIndex + 1} prescription` },
    });
    presInput.addEventListener("input", () => {
      ex.prescription = presInput.value;
    });

    const row = h("div", { class: "routine-ex-row" }, [
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

    return h("div", { class: "routine-ex" }, [row, renderStructured(ex, exIndex)]);
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
          class: "btn btn-small btn-accent",
          type: "button",
          text: "Start live ▸",
          aria: { label: `start a live session from routine ${rIndex + 1}` },
          on: { click: () => nav.startLive(singleRoutineSheet(sheet, routine, rIndex)) },
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
          text: "Link ▸",
          aria: { label: `share an importable link to routine ${rIndex + 1}` },
          on: { click: () => void shareLinkFor(singleRoutineSheet(sheet, routine, rIndex)) },
        }),
        h("button", {
          class: "btn btn-small",
          type: "button",
          text: "QR",
          aria: { label: `show a scannable QR code for routine ${rIndex + 1}` },
          on: { click: () => void showQrFor(singleRoutineSheet(sheet, routine, rIndex)) },
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

  // ---- Branding: trainer name + logo ----------------------------------------
  // Global settings (stored in this browser) that brand every routine — shown
  // on every export and on the Execute screen.
  const trainerInput = h("input", {
    class: "trainer-input",
    type: "text",
    value: loadTrainer(),
    placeholder: "e.g. Andrei — your name on every routine",
    aria: { label: "Trainer name" },
  });
  trainerInput.addEventListener("input", () => {
    saveTrainer(trainerInput.value);
  });

  const logoPreview = h("div", { class: "logo-preview" });
  const removeLogoBtn = h("button", {
    class: "btn btn-small danger",
    type: "button",
    text: "Remove logo",
    on: {
      click: () => {
        clearLogo();
        renderLogo();
        setStatus("Logo removed — routines show the GYM LOG mark again.", "info");
      },
    },
  });

  const logoFile = h("input", {
    class: "file-input",
    type: "file",
    accept: "image/png",
    aria: { label: "Upload a PNG logo" },
  });
  logoFile.addEventListener("change", async () => {
    const file = logoFile.files?.[0];
    logoFile.value = ""; // Allow re-selecting the same file later.
    if (!file) return;
    try {
      saveLogo(await fileToLogoDataUrl(file));
      renderLogo();
      setStatus("Logo updated — it now brands every routine.", "ok");
    } catch (err) {
      setStatus(err instanceof LogoError ? err.message : "Couldn't set that logo.", "err");
    }
  });

  function renderLogo(): void {
    clear(logoPreview);
    const url = loadLogo();
    if (url) {
      const img = h("img", { class: "logo-preview-img" });
      img.src = url;
      img.alt = "Current brand logo";
      logoPreview.appendChild(img);
    } else {
      logoPreview.appendChild(
        h("p", { class: "empty", text: "No logo yet — routines show the GYM LOG mark." }),
      );
    }
    removeLogoBtn.hidden = url === null;
  }

  const logoSection = h("section", { class: "card data logo-card" }, [
    h("h2", { class: "section-title", text: "Branding" }),
    h("label", { class: "field" }, [
      h("span", { class: "field-label", text: "Trainer name" }),
      trainerInput,
    ]),
    h("p", {
      class: "export-hint",
      text: "Upload a PNG logo to brand every routine — it appears with your name at the top of each export and on the Execute screen.",
    }),
    logoPreview,
    h("div", { class: "btn-row" }, [logoFile, removeLogoBtn]),
  ]);

  // ---- Export ---------------------------------------------------------------
  // Guard against double-taps while the (async) render/encode runs.
  let busy = false;
  // The QR overlay lives on document.body (outside this view), so track it and
  // tear it down on cleanup if the user navigates away while it's open.
  let dismissOverlay: (() => void) | null = null;
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

  // Share/QR a routine as an importable link. Used by both the per-routine cards
  // (live single-routine slices) and the saved-library cards (whole sheets). Not
  // runExport: the share/copy outcome IS the status, which runExport would clobber.
  async function shareLinkFor(target: RoutineSheet): Promise<void> {
    if (busy) return;
    busy = true;
    setStatus("Building link…", "info");
    try {
      const { result, url } = await shareRoutineLink(target);
      setStatus(
        result === "shared"
          ? "Opened the share sheet — send the link in WhatsApp."
          : result === "copied"
            ? "Routine link copied — paste it into WhatsApp."
            : `Copy this link to share: ${url}`,
        "ok",
      );
    } catch {
      setStatus("Couldn't create a share link. Try again.", "err");
    } finally {
      busy = false;
    }
  }

  async function showQrFor(target: RoutineSheet): Promise<void> {
    if (busy) return;
    busy = true;
    setStatus("Building QR…", "info");
    try {
      const canvas = await renderRoutineQrCanvas(target);
      dismissOverlay?.();
      dismissOverlay = showQrOverlay(canvas, target.name, () => {
        void runExport("Save QR PNG", () => exportRoutineQrPng(target));
      });
      setStatus("Scan the QR to load this routine.", "ok");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Couldn't build a QR code. Try again.", "err");
    } finally {
      busy = false;
    }
  }

  // ---- Import ---------------------------------------------------------------
  // Read an .xlsx/.xls or .pdf wall-chart into routine sheets, save them all to
  // the library, and open the first for editing. The heavy parsers load on
  // demand (see ../import), so they never weigh down the initial app load.
  const importFile = h("input", {
    class: "file-input",
    type: "file",
    accept: ".xlsx,.xls,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    aria: { label: "Import routines from a spreadsheet or PDF" },
  });
  importFile.addEventListener("change", async () => {
    const file = importFile.files?.[0];
    importFile.value = ""; // Allow re-selecting the same file later.
    if (!file || busy) return;
    busy = true;
    setStatus(`Importing "${file.name}"…`, "info");
    try {
      const imported = await importRoutineFile(file);
      let first: RoutineSheet | null = null;
      for (const s of imported) {
        const stored = saveSheet(s);
        if (!first) first = stored;
      }
      renderSaved();
      const routineCount = imported.reduce((n, s) => n + s.routines.length, 0);
      const sheetWord = imported.length === 1 ? "sheet" : "sheets";
      const routineWord = routineCount === 1 ? "routine" : "routines";
      const summary = `Imported ${imported.length} ${sheetWord} · ${routineCount} ${routineWord}.`;
      if (first) {
        // Opening remounts this view, so hand the confirmation to the next mount.
        setSheetFlash(`${summary} Opened "${first.name}".`, "ok");
        nav.editSheet(cloneSheet(first));
      } else {
        setStatus(summary, "ok");
      }
    } catch (err) {
      setStatus(
        err instanceof ImportError
          ? err.message
          : "Couldn't read that file. Make sure it's a valid .xlsx, .xls, or .pdf.",
        "err",
      );
    } finally {
      busy = false;
    }
  });

  // Folded into the Edit panel as a compact strip — a side door for starting a
  // sheet from a file, kept lighter than the manual build flow below it.
  const importStrip = h("div", { class: "import-strip" }, [
    h("span", { class: "import-strip__label", text: "Or import a chart" }),
    importFile,
    h("p", {
      class: "import-strip__hint",
      text: ".xlsx · .xls · text PDF — image-only tabs or pages are skipped.",
    }),
  ]);

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
  // Oxblood count stamp on the Library tab; kept in sync by renderSaved().
  const libraryBadge = h("span", { class: "ledger-tab__badge", aria: { hidden: "true" } });

  function renderSaved(): void {
    clear(savedHost);
    const sheets = loadSheets().sort(
      (a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""),
    );
    libraryBadge.textContent = String(sheets.length);
    libraryBadge.hidden = sheets.length === 0;
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
              class: "btn btn-small",
              type: "button",
              text: "Link ▸",
              aria: { label: `share an importable link to "${s.name}"` },
              on: { click: () => void shareLinkFor(s) },
            }),
            h("button", {
              class: "btn btn-small",
              type: "button",
              text: "QR",
              aria: { label: `show a scannable QR code for "${s.name}"` },
              on: { click: () => void showQrFor(s) },
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

  // ---- Sub-nav: ledger index tabs -------------------------------------------
  // The Routines view does four distinct jobs — editing the working sheet,
  // importing one, browsing the saved library, and setting global branding.
  // Splitting them behind tabs keeps the core editing surface clean (it's the
  // default) and stops Import/Brand from crowding every visit on mobile. The
  // working copy lives in `sheet`, so switching tabs just toggles visibility —
  // no remount, no lost edits.
  const addRoutineRow = h("div", { class: "btn-row" }, [
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
  ]);

  const panelEdit = h("div", { class: "ledger-panel", role: "tabpanel" }, [
    head,
    importStrip,
    addRoutineRow,
    routinesHost,
  ]);
  const panelLibrary = h("div", { class: "ledger-panel", role: "tabpanel" }, [
    dataSection,
    ...(SHOW_SHEET_ACTIONS ? [exportSection] : []),
  ]);
  const panelBrand = h("div", { class: "ledger-panel", role: "tabpanel" }, [logoSection]);

  type TabId = "edit" | "library" | "brand";
  const tabs: ReadonlyArray<{ id: TabId; no: string; label: string; panel: HTMLElement; badge?: HTMLElement }> = [
    { id: "edit", no: "01", label: "Edit", panel: panelEdit },
    { id: "library", no: "02", label: "Library", panel: panelLibrary, badge: libraryBadge },
    { id: "brand", no: "03", label: "Brand", panel: panelBrand },
  ];

  const tabButtons = new Map<TabId, HTMLButtonElement>();
  const setTab = (id: TabId): void => {
    for (const t of tabs) {
      const on = t.id === id;
      t.panel.hidden = !on;
      const btn = tabButtons.get(t.id);
      if (btn) {
        btn.classList.toggle("active", on);
        btn.setAttribute("aria-selected", on ? "true" : "false");
      }
    }
  };

  const tabsBar = h(
    "div",
    { class: "ledger-tabs", role: "tablist", aria: { label: "Routines sections" } },
    tabs.map((t) => {
      const btn = h("button", {
        class: "ledger-tab",
        type: "button",
        role: "tab",
        aria: { label: t.label },
        on: { click: () => setTab(t.id) },
      }, [
        h("span", { class: "ledger-tab__no", text: t.no }),
        h("span", { class: "ledger-tab__label", text: t.label }),
        ...(t.badge ? [t.badge] : []),
      ]);
      tabButtons.set(t.id, btn);
      return btn;
    }),
  );

  // ---- Assemble -------------------------------------------------------------
  const container = h("div", { class: "view view-sheet" }, [
    h("h1", { class: "view-title", text: "Routines" }),
    tabsBar,
    statusEl,
    panelEdit,
    panelLibrary,
    panelBrand,
  ]);

  renderRoutines();
  renderLogo();
  renderSaved();
  setTab("edit");
  // Surface any message queued by an action that remounted this view (e.g. import).
  const flash = takeSheetFlash();
  if (flash) setStatus(flash.msg, flash.kind);
  root.appendChild(container);
  return () => {
    dismissOverlay?.();
  };
}
