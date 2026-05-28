import { clear, h } from "../dom";
import { canShareFiles, exportRoutineQrPng, exportSheetPdf, exportSheetPng, shareRoutineLink, shareSheet } from "../exporters";
import { ImportError, importRoutineFile } from "../import";
import { renderRoutineQrCanvas } from "../qr";
import { clearLogo, fileToLogoDataUrl, loadLogo, LogoError, saveLogo } from "../logo";
import type { Cleanup, Nav } from "../router";
import { blankRoutine, blankRoutineExercise, blankSheet, catalogIdentityFor, singleRoutineSheet } from "../sheet";
import { deleteSheet, loadSheets, saveSheet } from "../sheetStorage";
import { setSheetFlash, state, takeSheetFlash } from "../state";
import { loadTrainer, saveTrainer } from "../trainer";
import type {
  ExerciseTarget,
  PerSetTarget,
  Routine,
  RoutineExercise,
  RoutineSheet,
  SetTarget,
  VolumeTarget,
} from "../types";
import { cloneSheet, sheetToJson, slug } from "../util";
import { registerTranslations, t } from "../i18n";

registerTranslations({
  "QR code for {0}": "Cod QR pentru {0}",
  "Scan to load this routine — or save it as a PNG to print for a group session.":
    "Scanează pentru a încărca rutina — sau salvează ca PNG pentru a o tipări la o sesiune de grup.",
  "Save PNG": "Salvează PNG",
  Close: "Închide",
  sets: "serii",
  reps: "repetări",
  kg: "kg",
  "quick-fill set count for exercise {0}": "completare rapidă număr serii pentru exercițiul {0}",
  "quick-fill reps for exercise {0}": "completare rapidă repetări pentru exercițiul {0}",
  "quick-fill load for exercise {0}": "completare rapidă greutate pentru exercițiul {0}",
  "set {0} reps": "repetări seria {0}",
  BW: "GC",
  "set {0} load kg": "greutate seria {0} kg",
  "remove set {0}": "elimină seria {0}",
  Fill: "Completează",
  "apply quick-fill to exercise {0}": "aplică completarea rapidă la exercițiul {0}",
  "+ set": "+ serie",
  "add a set to exercise {0}": "adaugă o serie la exercițiul {0}",
  "total reps for exercise {0}": "total repetări pentru exercițiul {0}",
  "added load kg for exercise {0}": "greutate adăugată kg pentru exercițiul {0}",
  Total: "Total",
  "reps @": "repetări @",
  "self-paced — any number of sets": "ritm propriu — orice număr de serii",
  Target: "Țintă",
  "Per-set": "Pe serie",
  "Total reps": "Total repetări",
  "{0} target for exercise {1}": "țintă {0} pentru exercițiul {1}",
  "Pick a target mode to make this exercise runnable.":
    "Alege un mod de țintă pentru ca exercițiul să poată fi rulat.",
  "Note: {0}": "Notă: {0}",
  "clear note on exercise {0}": "șterge nota la exercițiul {0}",
  Exercise: "Exercițiu",
  "exercise {0} name": "numele exercițiului {0}",
  "remove exercise {0}": "elimină exercițiul {0}",
  "Routine title": "Titlu rutină",
  "routine {0} title": "titlu rutină {0}",
  "INTERMEDIAR+, PARC, 60-100 antrenamente": "INTERMEDIAR+, PARC, 60-100 antrenamente",
  "routine {0} tags": "etichete rutină {0}",
  Delete: "Șterge",
  "delete routine {0}": "șterge rutina {0}",
  "Tags (comma separated)": "Etichete (separate prin virgulă)",
  "+ Add exercise": "+ Adaugă exercițiu",
  "Run ▸": "Rulează ▸",
  "run routine {0}": "rulează rutina {0}",
  "Start live ▸": "Începe live ▸",
  "start a live session from routine {0}": "începe o sesiune live din rutina {0}",
  "Share ▸": "Distribuie ▸",
  Share: "Distribuie",
  "share routine {0}": "distribuie rutina {0}",
  "Opened the share sheet — pick WhatsApp.": "S-a deschis fereastra de distribuire — alege WhatsApp.",
  "Sharing isn't available here, so the PNG was downloaded instead.":
    "Distribuirea nu e disponibilă aici, așa că PNG-ul a fost descărcat în schimb.",
  "Link ▸": "Link ▸",
  "share an importable link to routine {0}": "distribuie un link importabil către rutina {0}",
  QR: "QR",
  "show a scannable QR code for routine {0}": "arată un cod QR scanabil pentru rutina {0}",
  PNG: "PNG",
  "save routine {0} as PNG": "salvează rutina {0} ca PNG",
  PDF: "PDF",
  "save routine {0} as PDF": "salvează rutina {0} ca PDF",
  Save: "Salvează",
  "save routine {0} to library": "salvează rutina {0} în bibliotecă",
  "Saved \"{0}\" to your library.": "Ai salvat „{0}” în biblioteca ta.",
  "No routines yet — add one to get started.":
    "Nicio rutină încă — adaugă una pentru a începe.",
  "{0} routines · {1} exercises": "{0} rutine · {1} exerciții",
  "Sheet name": "Nume foaie",
  "e.g. Andrei — your name on every routine": "ex. Andrei — numele tău pe fiecare rutină",
  "Trainer name": "Nume antrenor",
  "Remove logo": "Elimină logo-ul",
  "Logo removed — routines show the GYM LOG mark again.":
    "Logo eliminat — rutinele afișează din nou marca GYM LOG.",
  "Upload a PNG logo": "Încarcă un logo PNG",
  "Logo updated — it now brands every routine.":
    "Logo actualizat — acum apare pe fiecare rutină.",
  "Couldn't set that logo.": "Nu am putut seta acel logo.",
  "Current brand logo": "Logo-ul curent al mărcii",
  "No logo yet — routines show the GYM LOG mark.":
    "Niciun logo încă — rutinele afișează marca GYM LOG.",
  Branding: "Branding",
  "Upload a PNG logo to brand every routine — it appears with your name at the top of each export and on the Execute screen.":
    "Încarcă un logo PNG pentru a marca fiecare rutină — apare cu numele tău în partea de sus a fiecărui export și pe ecranul Execută.",
  "{0}…": "{0}…",
  "{0} ready.": "{0} gata.",
  "Could not {0}. Try again.": "Nu am putut {0}. Încearcă din nou.",
  "Building link…": "Se construiește linkul…",
  "Opened the share sheet — send the link in WhatsApp.":
    "S-a deschis fereastra de distribuire — trimite linkul pe WhatsApp.",
  "Routine link copied — paste it into WhatsApp.":
    "Linkul rutinei a fost copiat — lipește-l în WhatsApp.",
  "Copy this link to share: {0}": "Copiază acest link pentru a-l distribui: {0}",
  "Couldn't create a share link. Try again.":
    "Nu am putut crea un link de distribuire. Încearcă din nou.",
  "Building QR…": "Se construiește codul QR…",
  "Save QR PNG": "Salvează QR PNG",
  "Scan the QR to load this routine.": "Scanează codul QR pentru a încărca rutina.",
  "Couldn't build a QR code. Try again.": "Nu am putut crea un cod QR. Încearcă din nou.",
  "Import routines from a spreadsheet or PDF": "Importă rutine dintr-un fișier de calcul sau PDF",
  "Importing \"{0}\"…": "Se importă „{0}”…",
  "Imported {0} {1} · {2} {3}.": "S-au importat {0} {1} · {2} {3}.",
  sheet: "foaie",
  sheets: "foi",
  routine: "rutină",
  routines: "rutine",
  "{0} Opened \"{1}\".": "{0} S-a deschis „{1}”.",
  "Couldn't read that file. Make sure it's a valid .xlsx, .xls, or .pdf.":
    "Nu am putut citi acel fișier. Asigură-te că e un .xlsx, .xls sau .pdf valid.",
  "Or import a chart": "Sau importă un tabel",
  ".xlsx · .xls · text PDF — image-only tabs or pages are skipped.":
    ".xlsx · .xls · PDF text — filele sau paginile doar cu imagini sunt omise.",
  "Export · Share": "Exportă · Distribuie",
  "Share sends a PNG to the native share sheet — pick WhatsApp. Or save a PNG/PDF file.":
    "Distribuirea trimite un PNG către fereastra nativă de distribuire — alege WhatsApp. Sau salvează un fișier PNG/PDF.",
  "Save a PNG or PDF, then attach it in WhatsApp. (Direct share works on phones.)":
    "Salvează un PNG sau PDF, apoi atașează-l în WhatsApp. (Distribuirea directă funcționează pe telefoane.)",
  "Save PDF": "Salvează PDF",
  "No saved sheets yet. Press Save to keep this one.":
    "Nicio foaie salvată încă. Apasă Salvează pentru a o păstra pe aceasta.",
  Open: "Deschide",
  "share an importable link to \"{0}\"": "distribuie un link importabil către „{0}”",
  "show a scannable QR code for \"{0}\"": "arată un cod QR scanabil pentru „{0}”",
  "Delete \"{0}\"? This cannot be undone.": "Ștergi „{0}”? Această acțiune nu poate fi anulată.",
  "Save · Library": "Salvează · Bibliotecă",
  "Saved \"{0}\" to this browser.": "Ai salvat „{0}” în acest browser.",
  "Download JSON": "Descarcă JSON",
  "Downloaded JSON file.": "Fișier JSON descărcat.",
  "New sheet": "Foaie nouă",
  "+ Add routine": "+ Adaugă rutină",
  Edit: "Editează",
  Library: "Bibliotecă",
  Brand: "Marcă",
  "Routines sections": "Secțiuni rutine",
});

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
    { class: "qr-overlay__card", role: "dialog", aria: { modal: "true", label: t("QR code for {0}").replace("{0}", String(title)) } },
    [
      h("p", { class: "qr-overlay__title", text: title }),
      canvas,
      h("p", {
        class: "qr-overlay__hint",
        text: t("Scan to load this routine — or save it as a PNG to print for a group session."),
      }),
      h("div", { class: "btn-row qr-overlay__actions" }, [
        h("button", { class: "btn btn-small btn-primary", type: "button", text: t("Save PNG"), on: { click: onSavePng } }),
        h("button", { class: "btn btn-small", type: "button", text: t("Close"), on: { click: () => close() } }),
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

  // ---- Structured target editor ---------------------------------------------
  // Every exercise carries a structured target in one of two modes, toggled per
  // row: a fixed per-set scheme (sets · reps · load, e.g. "3×10 @ 20kg" or a ramp)
  // or a self-paced rep volume ("50 reps", broken up however the trainee likes).
  // Mode/structure changes re-render; typing into a field mutates in place so
  // focus is kept.
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

  // Switch a row's target to per-set, preserving the rep total / load when coming
  // from a volume target so nothing is silently lost.
  const toPerSet = (cur: ExerciseTarget | undefined): PerSetTarget => {
    if (cur?.kind === "sets") return cur;
    if (cur?.kind === "volume") {
      return {
        kind: "sets",
        sets: [{ reps: cur.totalReps, ...(cur.loadKg !== undefined ? { loadKg: cur.loadKg } : {}) }],
      };
    }
    return { kind: "sets", sets: [{ reps: 10 }] };
  };

  // Switch a row's target to a rep volume, summing an existing per-set scheme.
  const toVolume = (cur: ExerciseTarget | undefined): VolumeTarget => {
    if (cur?.kind === "volume") return cur;
    if (cur?.kind === "sets") {
      const totalReps = cur.sets.reduce((a, t) => a + t.reps, 0) || 10;
      const loadKg = cur.sets.find((t) => t.loadKg !== undefined)?.loadKg;
      return { kind: "volume", totalReps, ...(loadKg !== undefined ? { loadKg } : {}) };
    }
    return { kind: "volume", totalReps: 50 };
  };

  // The per-set sub-editor: quick-fill + one editable row per set.
  const renderPerSet = (ex: RoutineExercise, exIndex: number, sets: SetTarget[]): HTMLElement => {
    const qfSets = numInput("", t("sets"), t("quick-fill set count for exercise {0}").replace("{0}", String(exIndex + 1)));
    const qfReps = numInput("", t("reps"), t("quick-fill reps for exercise {0}").replace("{0}", String(exIndex + 1)));
    const qfLoad = numInput("", t("kg"), t("quick-fill load for exercise {0}").replace("{0}", String(exIndex + 1)));
    qfSets.step = "1";
    qfLoad.step = "2.5";
    const applyQuickFill = (): void => {
      const n = Math.floor(parseFloat(qfSets.value));
      const reps = Math.floor(parseFloat(qfReps.value));
      const load = parseFloat(qfLoad.value);
      if (!Number.isFinite(n) || n < 1 || !Number.isFinite(reps) || reps < 1) return;
      const t: SetTarget = { reps, ...(Number.isFinite(load) && load > 0 ? { loadKg: load } : {}) };
      ex.target = { kind: "sets", sets: Array.from({ length: n }, () => ({ ...t })) };
      renderRoutines();
    };

    const setRow = (st: SetTarget, i: number): HTMLElement => {
      const reps = numInput(String(st.reps), t("reps"), t("set {0} reps").replace("{0}", String(i + 1)));
      reps.step = "1";
      reps.addEventListener("input", () => {
        const n = Math.floor(parseFloat(reps.value));
        if (Number.isFinite(n) && n > 0) st.reps = n;
      });
      const load = numInput(
        st.loadKg !== undefined ? String(st.loadKg) : "",
        t("BW"),
        t("set {0} load kg").replace("{0}", String(i + 1)),
      );
      load.step = "2.5";
      load.addEventListener("input", () => {
        const n = parseFloat(load.value);
        if (Number.isFinite(n) && n > 0) st.loadKg = n;
        else delete st.loadKg;
      });
      return h("div", { class: "rex-set-row" }, [
        h("span", { class: "rex-set-no", text: `${i + 1}` }),
        reps,
        h("span", { class: "rex-set-x", text: t("reps") }),
        load,
        h("span", { class: "rex-set-x", text: t("kg") }),
        h("button", {
          class: "icon-btn danger rex-set-remove",
          type: "button",
          text: "✕",
          aria: { label: t("remove set {0}").replace("{0}", String(i + 1)) },
          disabled: sets.length <= 1,
          on: {
            click: () => {
              if (sets.length <= 1) return;
              sets.splice(i, 1);
              renderRoutines();
            },
          },
        }),
      ]);
    };

    return h("div", { class: "rex-sets" }, [
      h("div", { class: "rex-quickfill" }, [
        qfSets,
        h("span", { class: "rex-set-x", text: "×" }),
        qfReps,
        h("span", { class: "rex-set-x", text: "@" }),
        qfLoad,
        h("button", {
          class: "btn btn-tiny",
          type: "button",
          text: t("Fill"),
          aria: { label: t("apply quick-fill to exercise {0}").replace("{0}", String(exIndex + 1)) },
          on: { click: applyQuickFill },
        }),
      ]),
      h("div", { class: "rex-set-list" }, sets.map((st, i) => setRow(st, i))),
      h("button", {
        class: "btn btn-tiny rex-sets-add",
        type: "button",
        text: t("+ set"),
        aria: { label: t("add a set to exercise {0}").replace("{0}", String(exIndex + 1)) },
        on: {
          click: () => {
            const last = sets[sets.length - 1];
            sets.push(last ? { ...last } : { reps: 10 });
            renderRoutines();
          },
        },
      }),
    ]);
  };

  // The volume sub-editor: a total-rep goal plus an optional added/external load.
  const renderVolume = (exIndex: number, target: VolumeTarget): HTMLElement => {
    const reps = numInput(String(target.totalReps), t("reps"), t("total reps for exercise {0}").replace("{0}", String(exIndex + 1)));
    reps.step = "1";
    reps.addEventListener("input", () => {
      const n = Math.floor(parseFloat(reps.value));
      if (Number.isFinite(n) && n > 0) target.totalReps = n;
    });
    const load = numInput(
      target.loadKg !== undefined ? String(target.loadKg) : "",
      t("BW"),
      t("added load kg for exercise {0}").replace("{0}", String(exIndex + 1)),
    );
    load.step = "2.5";
    load.addEventListener("input", () => {
      const n = parseFloat(load.value);
      if (Number.isFinite(n) && n > 0) target.loadKg = n;
      else delete target.loadKg;
    });
    return h("div", { class: "rex-volume" }, [
      h("span", { class: "rex-set-x", text: t("Total") }),
      reps,
      h("span", { class: "rex-set-x", text: t("reps @") }),
      load,
      h("span", { class: "rex-set-x", text: t("kg") }),
      h("span", { class: "rex-volume-hint", text: t("self-paced — any number of sets") }),
    ]);
  };

  // Mode toggle (Per-set / Total reps) + the matching sub-editor, plus a carried
  // note (e.g. an imported row we couldn't parse) when present.
  const renderEditor = (ex: RoutineExercise, exIndex: number): HTMLElement => {
    const kind = ex.target?.kind;
    const modeBtn = (label: string, active: boolean, onPick: () => void): HTMLElement =>
      h("button", {
        class: `btn btn-tiny rex-mode-btn${active ? " active" : ""}`,
        type: "button",
        text: t(label),
        aria: { pressed: active ? "true" : "false", label: t("{0} target for exercise {1}").replace("{0}", t(label)).replace("{1}", String(exIndex + 1)) },
        on: { click: onPick },
      });
    const toggle = h("div", { class: "rex-mode" }, [
      h("span", { class: "rex-sets-title", text: t("Target") }),
      modeBtn("Per-set", kind === "sets", () => {
        ex.target = toPerSet(ex.target);
        renderRoutines();
      }),
      modeBtn("Total reps", kind === "volume", () => {
        ex.target = toVolume(ex.target);
        renderRoutines();
      }),
    ]);

    const body =
      ex.target?.kind === "sets"
        ? renderPerSet(ex, exIndex, ex.target.sets)
        : ex.target?.kind === "volume"
          ? renderVolume(exIndex, ex.target)
          : h("p", { class: "rex-note-hint", text: t("Pick a target mode to make this exercise runnable.") });

    const note = (ex.note ?? "").trim();
    const noteLine =
      note !== ""
        ? h("div", { class: "rex-note" }, [
            h("span", { class: "rex-note__text", text: t("Note: {0}").replace("{0}", String(note)) }),
            h("button", {
              class: "btn btn-tiny rex-note__clear",
              type: "button",
              text: "✕",
              aria: { label: t("clear note on exercise {0}").replace("{0}", String(exIndex + 1)) },
              on: {
                click: () => {
                  delete ex.note;
                  renderRoutines();
                },
              },
            }),
          ])
        : null;

    return h("div", { class: "rex-structured" }, noteLine ? [toggle, body, noteLine] : [toggle, body]);
  };

  // ---- Exercise row ---------------------------------------------------------
  const renderExerciseRow = (routine: Routine, ex: RoutineExercise, exIndex: number): HTMLElement => {
    const nameInput = h("input", {
      class: "rex-name",
      type: "text",
      value: ex.name,
      placeholder: t("Exercise"),
      aria: { label: t("exercise {0} name").replace("{0}", String(exIndex + 1)) },
    });
    nameInput.addEventListener("input", () => {
      ex.name = nameInput.value;
    });
    // On commit (blur / Enter), re-derive catalog identity from the name so the
    // row picks up exerciseId/muscle/equipment when the trainer writes a curated
    // movement name. Unknown names clear identity rather than stick stale.
    nameInput.addEventListener("change", () => {
      delete ex.exerciseId;
      delete ex.muscle;
      delete ex.equipment;
      delete ex.secondaryMuscles;
      Object.assign(ex, catalogIdentityFor(ex.name));
    });

    const row = h("div", { class: "routine-ex-row" }, [
      h("span", { class: "rex-index", text: String(exIndex + 1) }),
      nameInput,
      h("button", {
        class: "icon-btn danger rex-remove",
        type: "button",
        text: "✕",
        aria: { label: t("remove exercise {0}").replace("{0}", String(exIndex + 1)) },
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

    return h("div", { class: "routine-ex" }, [row, renderEditor(ex, exIndex)]);
  };

  // ---- Routine card ---------------------------------------------------------
  const renderRoutine = (routine: Routine, rIndex: number): HTMLElement => {
    const titleInput = h("input", {
      class: "routine-title-input",
      type: "text",
      value: routine.title,
      placeholder: t("Routine title"),
      aria: { label: t("routine {0} title").replace("{0}", String(rIndex + 1)) },
    });
    titleInput.addEventListener("input", () => {
      routine.title = titleInput.value;
    });

    const tagsInput = h("input", {
      class: "tags-input",
      type: "text",
      value: routine.tags.join(", "),
      placeholder: t("INTERMEDIAR+, PARC, 60-100 antrenamente"),
      aria: { label: t("routine {0} tags").replace("{0}", String(rIndex + 1)) },
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
          text: t("Delete"),
          aria: { label: t("delete routine {0}").replace("{0}", String(rIndex + 1)) },
          on: {
            click: () => {
              sheet.routines.splice(rIndex, 1);
              renderRoutines();
            },
          },
        }),
      ]),
      h("label", { class: "field" }, [
        h("span", { class: "field-label", text: t("Tags (comma separated)") }),
        tagsInput,
      ]),
      h("div", { class: "routine-cols" }, [
        h("span", { class: "rex-col-label rex-col-name", text: t("Exercise") }),
        h("span", { class: "rex-col-label rex-col-pres", text: t("Target") }),
      ]),
      h(
        "div",
        { class: "routine-ex-list" },
        routine.exercises.map((ex, i) => renderExerciseRow(routine, ex, i)),
      ),
      h("button", {
        class: "btn btn-small",
        type: "button",
        text: t("+ Add exercise"),
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
          text: t("Run ▸"),
          aria: { label: t("run routine {0}").replace("{0}", String(rIndex + 1)) },
          on: { click: () => nav.runSheet(singleRoutineSheet(sheet, routine, rIndex)) },
        }),
        h("button", {
          class: "btn btn-small btn-accent",
          type: "button",
          text: t("Start live ▸"),
          aria: { label: t("start a live session from routine {0}").replace("{0}", String(rIndex + 1)) },
          on: { click: () => nav.startLive(singleRoutineSheet(sheet, routine, rIndex)) },
        }),
        h("button", {
          class: "btn btn-small",
          type: "button",
          text: t("Share ▸"),
          aria: { label: t("share routine {0}").replace("{0}", String(rIndex + 1)) },
          on: {
            click: () =>
              runExport(t("Share"), async () => {
                const result = await shareSheet(singleRoutineSheet(sheet, routine, rIndex));
                setStatus(
                  result === "shared"
                    ? t("Opened the share sheet — pick WhatsApp.")
                    : t("Sharing isn't available here, so the PNG was downloaded instead."),
                  "ok",
                );
              }),
          },
        }),
        h("button", {
          class: "btn btn-small",
          type: "button",
          text: t("Link ▸"),
          aria: { label: t("share an importable link to routine {0}").replace("{0}", String(rIndex + 1)) },
          on: { click: () => void shareLinkFor(singleRoutineSheet(sheet, routine, rIndex)) },
        }),
        h("button", {
          class: "btn btn-small",
          type: "button",
          text: t("QR"),
          aria: { label: t("show a scannable QR code for routine {0}").replace("{0}", String(rIndex + 1)) },
          on: { click: () => void showQrFor(singleRoutineSheet(sheet, routine, rIndex)) },
        }),
        h("button", {
          class: "btn btn-small",
          type: "button",
          text: t("PNG"),
          aria: { label: t("save routine {0} as PNG").replace("{0}", String(rIndex + 1)) },
          on: {
            click: () =>
              runExport(t("Save PNG"), () => exportSheetPng(singleRoutineSheet(sheet, routine, rIndex))),
          },
        }),
        h("button", {
          class: "btn btn-small",
          type: "button",
          text: t("PDF"),
          aria: { label: t("save routine {0} as PDF").replace("{0}", String(rIndex + 1)) },
          on: {
            click: () =>
              runExport(t("Save PDF"), () => exportSheetPdf(singleRoutineSheet(sheet, routine, rIndex))),
          },
        }),
        h("button", {
          class: "btn btn-small btn-primary",
          type: "button",
          text: t("Save"),
          aria: { label: t("save routine {0} to library").replace("{0}", String(rIndex + 1)) },
          on: {
            click: () => {
              const saved = saveSheet(singleRoutineSheet(sheet, routine, rIndex));
              setStatus(t("Saved \"{0}\" to your library.").replace("{0}", String(saved.name)), "ok");
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
        h("p", { class: "empty", text: t("No routines yet — add one to get started.") }),
      );
    } else {
      sheet.routines.forEach((r, i) => routinesHost.appendChild(renderRoutine(r, i)));
    }
    metaEl.textContent = t("{0} routines · {1} exercises")
      .replace("{0}", String(sheet.routines.length))
      .replace("{1}", String(exerciseCount()));
  }

  // ---- Sheet name -----------------------------------------------------------
  const nameInput = h("input", {
    class: "plan-name-input",
    type: "text",
    value: sheet.name,
    placeholder: t("Sheet name"),
    aria: { label: t("Sheet name") },
  });
  nameInput.addEventListener("input", () => {
    sheet.name = nameInput.value;
  });

  const head = h("section", { class: "card builder-head" }, [
    h("label", { class: "field" }, [
      h("span", { class: "field-label", text: t("Sheet name") }),
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
    placeholder: t("e.g. Andrei — your name on every routine"),
    aria: { label: t("Trainer name") },
  });
  trainerInput.addEventListener("input", () => {
    saveTrainer(trainerInput.value);
  });

  const logoPreview = h("div", { class: "logo-preview" });
  const removeLogoBtn = h("button", {
    class: "btn btn-small danger",
    type: "button",
    text: t("Remove logo"),
    on: {
      click: () => {
        clearLogo();
        renderLogo();
        setStatus(t("Logo removed — routines show the GYM LOG mark again."), "info");
      },
    },
  });

  const logoFile = h("input", {
    class: "file-input",
    type: "file",
    accept: "image/png",
    aria: { label: t("Upload a PNG logo") },
  });
  logoFile.addEventListener("change", async () => {
    const file = logoFile.files?.[0];
    logoFile.value = ""; // Allow re-selecting the same file later.
    if (!file) return;
    try {
      saveLogo(await fileToLogoDataUrl(file));
      renderLogo();
      setStatus(t("Logo updated — it now brands every routine."), "ok");
    } catch (err) {
      setStatus(err instanceof LogoError ? err.message : t("Couldn't set that logo."), "err");
    }
  });

  function renderLogo(): void {
    clear(logoPreview);
    const url = loadLogo();
    if (url) {
      const img = h("img", { class: "logo-preview-img" });
      img.src = url;
      img.alt = t("Current brand logo");
      logoPreview.appendChild(img);
    } else {
      logoPreview.appendChild(
        h("p", { class: "empty", text: t("No logo yet — routines show the GYM LOG mark.") }),
      );
    }
    removeLogoBtn.hidden = url === null;
  }

  const logoSection = h("section", { class: "card data logo-card" }, [
    h("h2", { class: "section-title", text: t("Branding") }),
    h("label", { class: "field" }, [
      h("span", { class: "field-label", text: t("Trainer name") }),
      trainerInput,
    ]),
    h("p", {
      class: "export-hint",
      text: t("Upload a PNG logo to brand every routine — it appears with your name at the top of each export and on the Execute screen."),
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
    setStatus(t("{0}…").replace("{0}", label), "info");
    try {
      await fn();
      setStatus(t("{0} ready.").replace("{0}", label), "ok");
    } catch {
      setStatus(t("Could not {0}. Try again.").replace("{0}", label.toLowerCase()), "err");
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
    setStatus(t("Building link…"), "info");
    try {
      const { result, url } = await shareRoutineLink(target);
      setStatus(
        result === "shared"
          ? t("Opened the share sheet — send the link in WhatsApp.")
          : result === "copied"
            ? t("Routine link copied — paste it into WhatsApp.")
            : t("Copy this link to share: {0}").replace("{0}", String(url)),
        "ok",
      );
    } catch {
      setStatus(t("Couldn't create a share link. Try again."), "err");
    } finally {
      busy = false;
    }
  }

  async function showQrFor(target: RoutineSheet): Promise<void> {
    if (busy) return;
    busy = true;
    setStatus(t("Building QR…"), "info");
    try {
      const canvas = await renderRoutineQrCanvas(target);
      dismissOverlay?.();
      dismissOverlay = showQrOverlay(canvas, target.name, () => {
        void runExport(t("Save QR PNG"), () => exportRoutineQrPng(target));
      });
      setStatus(t("Scan the QR to load this routine."), "ok");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : t("Couldn't build a QR code. Try again."), "err");
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
    aria: { label: t("Import routines from a spreadsheet or PDF") },
  });
  importFile.addEventListener("change", async () => {
    const file = importFile.files?.[0];
    importFile.value = ""; // Allow re-selecting the same file later.
    if (!file || busy) return;
    busy = true;
    setStatus(t("Importing \"{0}\"…").replace("{0}", String(file.name)), "info");
    try {
      const imported = await importRoutineFile(file);
      let first: RoutineSheet | null = null;
      for (const s of imported) {
        const stored = saveSheet(s);
        if (!first) first = stored;
      }
      renderSaved();
      const routineCount = imported.reduce((n, s) => n + s.routines.length, 0);
      const sheetWord = imported.length === 1 ? t("sheet") : t("sheets");
      const routineWord = routineCount === 1 ? t("routine") : t("routines");
      const summary = t("Imported {0} {1} · {2} {3}.")
        .replace("{0}", String(imported.length))
        .replace("{1}", sheetWord)
        .replace("{2}", String(routineCount))
        .replace("{3}", routineWord);
      if (first) {
        // Opening remounts this view, so hand the confirmation to the next mount.
        setSheetFlash(t("{0} Opened \"{1}\".").replace("{0}", summary).replace("{1}", String(first.name)), "ok");
        nav.editSheet(cloneSheet(first));
      } else {
        setStatus(summary, "ok");
      }
    } catch (err) {
      setStatus(
        err instanceof ImportError
          ? err.message
          : t("Couldn't read that file. Make sure it's a valid .xlsx, .xls, or .pdf."),
        "err",
      );
    } finally {
      busy = false;
    }
  });

  // Folded into the Edit panel as a compact strip — a side door for starting a
  // sheet from a file, kept lighter than the manual build flow below it.
  const importStrip = h("div", { class: "import-strip" }, [
    h("span", { class: "import-strip__label", text: t("Or import a chart") }),
    importFile,
    h("p", {
      class: "import-strip__hint",
      text: t(".xlsx · .xls · text PDF — image-only tabs or pages are skipped."),
    }),
  ]);

  const shareBtn = h("button", {
    class: "btn btn-primary",
    type: "button",
    text: t("Share ▸"),
    on: {
      click: () =>
        runExport(t("Share"), async () => {
          const result = await shareSheet(sheet);
          setStatus(
            result === "shared"
              ? t("Opened the share sheet — pick WhatsApp.")
              : t("Sharing isn't available here, so the PNG was downloaded instead."),
            "ok",
          );
        }),
    },
  });

  const exportSection = h("section", { class: "card data" }, [
    h("h2", { class: "section-title", text: t("Export · Share") }),
    h("p", {
      class: "export-hint",
      text: canShareFiles()
        ? t("Share sends a PNG to the native share sheet — pick WhatsApp. Or save a PNG/PDF file.")
        : t("Save a PNG or PDF, then attach it in WhatsApp. (Direct share works on phones.)"),
    }),
    h("div", { class: "btn-row" }, [
      shareBtn,
      h("button", {
        class: "btn",
        type: "button",
        text: t("Save PNG"),
        on: { click: () => runExport(t("Save PNG"), () => exportSheetPng(sheet)) },
      }),
      h("button", {
        class: "btn",
        type: "button",
        text: t("Save PDF"),
        on: { click: () => runExport(t("Save PDF"), () => exportSheetPdf(sheet)) },
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
        h("p", { class: "empty", text: t("No saved sheets yet. Press Save to keep this one.") }),
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
              text: t("{0} routines · {1} exercises")
                .replace("{0}", String(s.routines.length))
                .replace("{1}", String(exCount)),
            }),
          ]),
          h("div", { class: "btn-row saved-actions" }, [
            h("button", {
              class: "btn btn-small btn-accent",
              type: "button",
              text: t("Run ▸"),
              on: { click: () => nav.runSheet(cloneSheet(s)) },
            }),
            h("button", {
              class: "btn btn-small",
              type: "button",
              text: t("Open"),
              on: { click: () => nav.editSheet(cloneSheet(s)) },
            }),
            h("button", {
              class: "btn btn-small",
              type: "button",
              text: t("Link ▸"),
              aria: { label: t("share an importable link to \"{0}\"").replace("{0}", String(s.name)) },
              on: { click: () => void shareLinkFor(s) },
            }),
            h("button", {
              class: "btn btn-small",
              type: "button",
              text: t("QR"),
              aria: { label: t("show a scannable QR code for \"{0}\"").replace("{0}", String(s.name)) },
              on: { click: () => void showQrFor(s) },
            }),
            h("button", {
              class: "btn btn-small danger",
              type: "button",
              text: t("Delete"),
              on: {
                click: () => {
                  if (!confirm(t("Delete \"{0}\"? This cannot be undone.").replace("{0}", String(s.name)))) return;
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
