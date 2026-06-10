import { track } from "../analytics";
import { sessionsForSheet } from "../adherence";
import { clear, h } from "../dom";
import { canShareFiles, exportRoutineQrPng, exportSheetPdf, exportSheetPng, shareAdherence, shareRoutineLink, shareSheet } from "../exporters";
import { ImportError, importRoutineFile } from "../import";
import { loadSessions } from "../logStorage";
import { renderRoutineQrCanvas } from "../qr";
import { clearLogo, fileToLogoDataUrl, loadLogo, LogoError, saveLogo } from "../logo";
import type { SelectMode } from "../liveProgress";
import {
  compoundMovements,
  findMovement,
  isCompoundMovement,
  isolationMovementsForMuscle,
  type Movement,
  muscleShares,
} from "../movements";
import type { Cleanup, Nav } from "../router";
import {
  blankRoutine,
  blankRoutineExercise,
  blankSection,
  blankSheet,
  catalogIdentityFor,
  identityFromMovement,
  singleRoutineSheet,
} from "../sheet";
import { deleteSheet, loadSheets, saveSheet } from "../sheetStorage";
import { setSheetFlash, state, takeSheetFlash } from "../state";
import { loadTrainer, saveTrainer } from "../trainer";
import {
  MUSCLE_GROUPS,
  MUSCLE_LABELS,
  type MuscleGroup,
  type Routine,
  type RoutineExercise,
  type RoutineKind,
  type RoutineSection,
  type RoutineSheet,
  type SetTarget,
  type VolumeTarget,
} from "../types";
import {
  cloneSheet,
  formatShortDate,
  routineExerciseCount,
  routineKind,
  sheetToJson,
  slug,
  toSetsTarget,
  toVolumeTarget,
} from "../util";
import { registerTranslations, t } from "../i18n";

registerTranslations({
  "QR code for {0}": "Cod QR pentru {0}",
  "Report ▸": "Raport ▸",
  'share the adherence report for "{0}"': "partajează raportul de aderență pentru „{0}”",
  "1 run logged": "1 rulare înregistrată",
  "{0} runs logged": "{0} rulări înregistrate",
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
  // — Routine type / structured sections —
  Type: "Tip",
  "Movement list": "Listă de mișcări",
  "Structured session": "Sesiune structurată",
  "+ Movement list": "+ Listă de mișcări",
  "+ Structured session": "+ Sesiune structurată",
  Mode: "Mod",
  Custom: "Personalizat",
  Compound: "Compus",
  "Compound lift": "Exercițiu compus",
  "Muscle group": "Grupă musculară",
  "Muscles worked": "Mușchi lucrați",
  "Pick an exercise": "Alege un exercițiu",
  "exercise {0} movement": "mișcarea exercițiului {0}",
  "Section (e.g. Warm-up)": "Secțiune (ex. Încălzire)",
  "section {0} title": "titlu secțiune {0}",
  "remove section {0}": "elimină secțiunea {0}",
  "+ Add section": "+ Adaugă secțiune",
  "+ Exercise": "+ Exercițiu",
  "A loose list of movements — each with a total-rep goal, done in any number of sets.":
    "O listă liberă de mișcări — fiecare cu un total de repetări, făcut în oricâte serii.",
  "A structured session in sections (warm-up, main, accessory) — every exercise prescribed set by set.":
    "O sesiune structurată pe secțiuni (încălzire, principal, accesoriu) — fiecare exercițiu prescris serie cu serie.",
  "Run ▸": "Rulează ▸",
  "run routine {0}": "rulează rutina {0}",
  "Start live ▸": "Începe live ▸",
  "start a live session from routine {0}": "începe o sesiune live din rutina {0}",
  "Share ▸": "Distribuie ▸",
  Share: "Distribuie",
  "share routine {0}": "distribuie rutina {0}",
  "Export ▾": "Export ▾",
  "Export ▴": "Export ▴",
  "export and share routine {0}": "exportă și distribuie rutina {0}",
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
  "Created {0}": "Creat {0}",
  Brand: "Marcă",
  Routines: "Rutine",
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
    sheet.routines.reduce((sum, r) => sum + routineExerciseCount(r), 0);

  // ---- Structured target editor ---------------------------------------------
  // The target shape is fixed by the routine's kind, not chosen per row: a
  // movement list prescribes a self-paced rep volume ("50 reps"), a structured
  // session prescribes an explicit per-set scheme (sets · reps · load). The kind
  // is fixed at creation. Typing into a field mutates in place so focus is kept;
  // a note-only row stays note-only until edited into a target.
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

  // The per-set sub-editor: quick-fill + one editable row per set. The row's
  // target is attached lazily — a note-only row keeps no target until the trainer
  // edits a set, so imported holds/notes aren't silently turned into "1×10".
  const renderPerSet = (ex: RoutineExercise, exIndex: number): HTMLElement => {
    // Show the row's existing scheme; a stray rep-volume (legacy data) is summed
    // into one set for display and only re-committed as per-set on the next edit.
    const existing =
      ex.target?.kind === "sets"
        ? ex.target.sets
        : ex.target?.kind === "volume"
          ? toSetsTarget(ex.target).sets
          : null;
    const sets: SetTarget[] = existing ?? [{ reps: 10 }];
    const attach = (): void => {
      if (!(ex.target?.kind === "sets" && ex.target.sets === sets)) ex.target = { kind: "sets", sets };
    };
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
        if (Number.isFinite(n) && n > 0) {
          st.reps = n;
          attach();
        }
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
        attach();
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
              attach();
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
            attach();
            renderRoutines();
          },
        },
      }),
    ]);
  };

  // The volume sub-editor: a total-rep goal plus an optional added/external load.
  // Like the per-set editor, the target is attached lazily so a note-only row
  // isn't silently given a rep goal until the trainer actually types one.
  const renderVolume = (ex: RoutineExercise, exIndex: number): HTMLElement => {
    // Show the row's existing goal; a stray per-set scheme (legacy data) is summed
    // into a total for display and only re-committed as a volume on the next edit.
    const existing =
      ex.target?.kind === "volume"
        ? ex.target
        : ex.target?.kind === "sets"
          ? toVolumeTarget(ex.target)
          : null;
    const target: VolumeTarget = existing ?? { kind: "volume", totalReps: 50 };
    const attach = (): void => {
      if (ex.target !== target) ex.target = target;
    };
    const reps = numInput(
      existing ? String(target.totalReps) : "",
      t("reps"),
      t("total reps for exercise {0}").replace("{0}", String(exIndex + 1)),
    );
    reps.step = "1";
    reps.addEventListener("input", () => {
      const n = Math.floor(parseFloat(reps.value));
      if (Number.isFinite(n) && n > 0) {
        target.totalReps = n;
        attach();
      }
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
      attach();
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

  // The target sub-editor for one row. Its shape is dictated by the routine's
  // kind, not chosen per row: a structured session is always per-set, a movement
  // list is always a rep volume. A carried note (e.g. an unparsed import) shows
  // beneath when present.
  const renderEditor = (ex: RoutineExercise, exIndex: number, kind: RoutineKind): HTMLElement => {
    const body = kind === "session" ? renderPerSet(ex, exIndex) : renderVolume(ex, exIndex);

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

    return h("div", { class: "rex-structured" }, noteLine ? [body, noteLine] : [body]);
  };

  // ---- Catalog movement picker (structured sessions) ------------------------
  // A structured-session exercise is catalog-only: it's picked from the same
  // movement catalog the freestyle Live screen uses, so each row carries a
  // muscle / load type / compound-credit identity that flows into the run and
  // the stats. Mirrors Live's "select" UI — a Custom/Compound mode toggle, then
  // muscle + exercise chips (or compound-lift chips with the muscle split).
  //
  // The Custom/Compound mode is per-row UI state (not stored on the routine), so
  // it lives in a WeakMap keyed by the exercise object, which survives the
  // wholesale re-render renderRoutines() does on every edit.
  const rowMode = new WeakMap<RoutineExercise, SelectMode>();

  // A labelled row of chips (single-select), matching Live's renderToggle.
  const chipToggle = (
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

  // The muscle split of a compound lift, as bars summing to 100% (as in Live).
  const renderMuscleShares = (mv: Movement): HTMLElement =>
    h("div", { class: "field" }, [
      h("span", { class: "field-label", text: t("Muscles worked") }),
      h(
        "div",
        { class: "muscle-shares" },
        muscleShares(mv).map((s) => {
          const fill = h("div", { class: "muscle-share-fill" });
          fill.style.width = `${s.pct}%`;
          return h("div", { class: "muscle-share" }, [
            h("span", { class: "muscle-share-name", text: t(MUSCLE_LABELS[s.muscle]) }),
            h("div", { class: "muscle-share-bar" }, [fill]),
            h("span", { class: "muscle-share-pct", text: `${s.pct}%` }),
          ]);
        }),
      ),
    ]);

  const renderMovementPicker = (ex: RoutineExercise, exIndex: number): HTMLElement => {
    const current = ex.exerciseId ? findMovement(ex.exerciseId) : undefined;
    const muscle: MuscleGroup = ex.muscle ?? current?.primaryMuscle ?? "chest";
    const movementId = current?.id ?? isolationMovementsForMuscle(muscle)[0]?.id ?? "";
    const selected = findMovement(movementId);
    // A compound row defaults to the Compound picker — the isolation-only Custom
    // picker can't represent it. Once the user picks a mode, that choice sticks.
    const mode = rowMode.get(ex) ?? (selected && isCompoundMovement(selected) ? "compound" : "custom");

    // Adopt a catalog movement as this row's identity (name + muscle/load/compound).
    const pick = (id: string): void => {
      const mv = findMovement(id);
      if (!mv) return;
      ex.name = mv.name;
      delete ex.exerciseId;
      delete ex.muscle;
      delete ex.equipment;
      delete ex.secondaryMuscles;
      Object.assign(ex, identityFromMovement(mv));
      renderRoutines();
    };
    const pickMuscle = (m: string): void => {
      const first = isolationMovementsForMuscle(m as MuscleGroup)[0];
      if (first) pick(first.id);
    };
    const pickMode = (m: string): void => {
      rowMode.set(ex, m as SelectMode);
      // Keep the selection valid for the new mode. Compound lists only compounds;
      // Custom lists only isolation movements, so each drops a stale selection to
      // the first valid option for the picker it's switching to.
      if (m === "compound" && (!selected || !isCompoundMovement(selected))) {
        const first = compoundMovements()[0];
        if (first) {
          pick(first.id);
          return;
        }
      } else if (m === "custom" && selected && isCompoundMovement(selected)) {
        const first = isolationMovementsForMuscle(muscle)[0];
        if (first) {
          pick(first.id);
          return;
        }
      }
      renderRoutines();
    };

    const body =
      mode === "compound"
        ? [
            chipToggle(
              t("Compound lift"),
              compoundMovements().map((mv) => mv.id),
              (id) => findMovement(id)?.name ?? id,
              movementId,
              pick,
            ),
          ]
        : [
            chipToggle(
              t("Muscle group"),
              MUSCLE_GROUPS,
              (m) => t(MUSCLE_LABELS[m as MuscleGroup]),
              muscle,
              pickMuscle,
            ),
            chipToggle(
              t("Exercise"),
              isolationMovementsForMuscle(muscle).map((mv) => mv.id),
              (id) => findMovement(id)?.name ?? id,
              movementId,
              pick,
            ),
          ];

    return h("div", { class: "rex-picker", aria: { label: t("exercise {0} movement").replace("{0}", String(exIndex + 1)) } }, [
      chipToggle(
        t("Mode"),
        ["custom", "compound"],
        (m) => (m === "compound" ? t("Compound") : t("Custom")),
        mode,
        pickMode,
      ),
      ...body,
      ...(selected && isCompoundMovement(selected) ? [renderMuscleShares(selected)] : []),
    ]);
  };

  // ---- Exercise row ---------------------------------------------------------
  // `list` is the parent exercise array the row lives in — a routine's flat
  // `exercises` for a movement list, or a section's `exercises` for a structured
  // session — so add/remove stays local to whichever block holds the row.
  const renderExerciseRow = (
    list: RoutineExercise[],
    ex: RoutineExercise,
    exIndex: number,
    kind: RoutineKind,
  ): HTMLElement => {
    const removeBtn = h("button", {
      class: "icon-btn danger rex-remove",
      type: "button",
      text: "✕",
      aria: { label: t("remove exercise {0}").replace("{0}", String(exIndex + 1)) },
      disabled: list.length <= 1,
      on: {
        click: () => {
          if (list.length <= 1) return;
          list.splice(exIndex, 1);
          renderRoutines();
        },
      },
    });

    // Structured session: catalog-only. The name is read-only (it comes from the
    // picked movement); the chip picker below the row chooses the movement.
    if (kind === "session") {
      const row = h("div", { class: "routine-ex-row" }, [
        h("span", { class: "rex-index", text: String(exIndex + 1) }),
        h("span", { class: "rex-name-static", text: ex.name || t("Pick an exercise") }),
        removeBtn,
      ]);
      return h("div", { class: "routine-ex" }, [
        row,
        renderMovementPicker(ex, exIndex),
        renderEditor(ex, exIndex, kind),
      ]);
    }

    // Movement list: free-form. A free-text name, matched against the catalog on
    // commit so it still picks up an identity when the trainer types a known name.
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
      removeBtn,
    ]);

    return h("div", { class: "routine-ex" }, [row, renderEditor(ex, exIndex, kind)]);
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

    const kind = routineKind(routine);

    // The kind is fixed at creation (chosen via the two "+ …" buttons) and never
    // switched in place — a movement list and a structured session are different
    // documents (free-form vs catalog-driven), executed differently. So this is a
    // read-only stamp, not a toggle.
    const kindChip = h("div", { class: "field routine-kind" }, [
      h("span", { class: "field-label", text: t("Type") }),
      h("span", {
        class: "routine-kind-chip",
        text: kind === "session" ? t("Structured session") : t("Movement list"),
      }),
      h("p", {
        class: "rex-note-hint",
        text:
          kind === "session"
            ? t("A structured session in sections (warm-up, main, accessory) — every exercise prescribed set by set.")
            : t("A loose list of movements — each with a total-rep goal, done in any number of sets."),
      }),
    ]);

    const colsHead = (): HTMLElement =>
      h("div", { class: "routine-cols" }, [
        h("span", { class: "rex-col-label rex-col-name", text: t("Exercise") }),
        h("span", { class: "rex-col-label rex-col-pres", text: t("Target") }),
      ]);

    // Column rows for one block — a section's or the flat routine's exercises.
    const exerciseList = (listExercises: RoutineExercise[]): HTMLElement =>
      h(
        "div",
        { class: "routine-ex-list" },
        listExercises.map((ex, i) => renderExerciseRow(listExercises, ex, i, kind)),
      );

    const addExerciseBtn = (list: RoutineExercise[]): HTMLElement =>
      h("button", {
        class: "btn btn-small",
        type: "button",
        text: t("+ Add exercise"),
        on: {
          click: () => {
            list.push(blankRoutineExercise(kind));
            renderRoutines();
          },
        },
      });

    // One named section of a structured session — label + its own exercise rows.
    const renderSection = (
      section: RoutineSection,
      sIndex: number,
      sections: RoutineSection[],
    ): HTMLElement => {
      const sectionTitle = h("input", {
        class: "section-title-input",
        type: "text",
        value: section.title,
        placeholder: t("Section (e.g. Warm-up)"),
        aria: { label: t("section {0} title").replace("{0}", String(sIndex + 1)) },
      });
      sectionTitle.addEventListener("input", () => {
        section.title = sectionTitle.value;
      });
      return h("div", { class: "routine-section" }, [
        h("div", { class: "section-head" }, [
          h("span", { class: "section-no", text: String(sIndex + 1) }),
          sectionTitle,
          h("button", {
            class: "icon-btn danger",
            type: "button",
            text: "✕",
            aria: { label: t("remove section {0}").replace("{0}", String(sIndex + 1)) },
            disabled: sections.length <= 1,
            on: {
              click: () => {
                if (sections.length <= 1) return;
                sections.splice(sIndex, 1);
                renderRoutines();
              },
            },
          }),
        ]),
        exerciseList(section.exercises),
        h("div", { class: "section-add" }, [addExerciseBtn(section.exercises)]),
      ]);
    };

    // The card body swaps shape by kind: a flat exercise list, or stacked
    // sections with an "add section" control.
    const body: HTMLElement[] =
      kind === "session"
        ? [
            colsHead(),
            h(
              "div",
              { class: "routine-sections" },
              (routine.sections ?? []).map((s, si) =>
                renderSection(s, si, routine.sections ?? []),
              ),
            ),
            h("button", {
              class: "btn btn-small",
              type: "button",
              text: t("+ Add section"),
              on: {
                click: () => {
                  (routine.sections ??= []).push(blankSection());
                  renderRoutines();
                },
              },
            }),
          ]
        : [colsHead(), exerciseList(routine.exercises), addExerciseBtn(routine.exercises)];

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
      kindChip,
      ...body,
      // Per-routine actions — save, export, or run just this routine. Each builds
      // a fresh single-routine sheet on click, so it reflects live edits. The five
      // "get it out" buttons (Share/Link/QR/PNG/PDF) collapse behind one Export ▾
      // disclosure so Save reads as the primary action and the row stays a single
      // line on mobile; Run/Start-live are demoted to a quieter run group.
      routineActions(routine, rIndex),
    ]);
  };

  /** The grouped action block at the foot of each routine card (see renderRoutine). */
  function routineActions(routine: Routine, rIndex: number): HTMLElement {
    const slice = (): RoutineSheet => singleRoutineSheet(sheet, routine, rIndex);
    const no = String(rIndex + 1);

    const saveBtn = h("button", {
      class: "btn btn-small btn-primary",
      type: "button",
      text: t("Save"),
      aria: { label: t("save routine {0} to library").replace("{0}", no) },
      on: {
        click: () => {
          const saved = saveSheet(slice());
          setStatus(t("Saved \"{0}\" to your library.").replace("{0}", String(saved.name)), "ok");
          renderSaved();
        },
      },
    });

    // The "get it out" cluster — revealed by the Export ▾ toggle below.
    const exportPanel = h("div", { class: "btn-row routine-export", hidden: true }, [
      h("button", {
        class: "btn btn-small",
        type: "button",
        text: t("Share ▸"),
        aria: { label: t("share routine {0}").replace("{0}", no) },
        on: {
          click: () =>
            runExport(t("Share"), async () => {
              const result = await shareSheet(slice());
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
        aria: { label: t("share an importable link to routine {0}").replace("{0}", no) },
        on: { click: () => void shareLinkFor(slice()) },
      }),
      h("button", {
        class: "btn btn-small",
        type: "button",
        text: t("QR"),
        aria: { label: t("show a scannable QR code for routine {0}").replace("{0}", no) },
        on: { click: () => void showQrFor(slice()) },
      }),
      h("button", {
        class: "btn btn-small",
        type: "button",
        text: t("PNG"),
        aria: { label: t("save routine {0} as PNG").replace("{0}", no) },
        on: { click: () => runExport(t("Save PNG"), () => exportSheetPng(slice())) },
      }),
      h("button", {
        class: "btn btn-small",
        type: "button",
        text: t("PDF"),
        aria: { label: t("save routine {0} as PDF").replace("{0}", no) },
        on: { click: () => runExport(t("Save PDF"), () => exportSheetPdf(slice())) },
      }),
    ]);

    const exportToggle = h("button", {
      class: "btn btn-small",
      type: "button",
      text: t("Export ▾"),
      aria: { label: t("export and share routine {0}").replace("{0}", no), expanded: "false" },
    });
    exportToggle.addEventListener("click", () => {
      const open = exportPanel.hidden;
      exportPanel.hidden = !open;
      exportToggle.textContent = open ? t("Export ▴") : t("Export ▾");
      exportToggle.setAttribute("aria-expanded", String(open));
    });

    const runRow = h("div", { class: "btn-row routine-run" }, [
      h("button", {
        class: "btn btn-small btn-accent",
        type: "button",
        text: t("Run ▸"),
        aria: { label: t("run routine {0}").replace("{0}", no) },
        on: { click: () => nav.runSheet(slice()) },
      }),
      h("button", {
        class: "btn btn-small btn-accent",
        type: "button",
        text: t("Start live ▸"),
        aria: { label: t("start a live session from routine {0}").replace("{0}", no) },
        on: { click: () => nav.startLive(slice()) },
      }),
    ]);

    return h("div", { class: "routine-actions" }, [
      h("div", { class: "btn-row routine-actions-primary" }, [saveBtn, exportToggle]),
      exportPanel,
      runRow,
    ]);
  }

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
      track("routine_imported", { via: "file", count: imported.length });
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
    const sessions = loadSessions();
    for (const s of sheets) {
      const exCount = s.routines.reduce((sum, r) => sum + routineExerciseCount(r), 0);
      // Runs a student logged from this sheet (Live "follow" + Execute) — when
      // there are any, the coach can share the adherence report for them.
      const runCount = sessionsForSheet(s.id, sessions).length;
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
            ...(s.createdAt
              ? [
                  h("p", {
                    class: "plan-meta saved-created",
                    text: t("Created {0}").replace("{0}", formatShortDate(s.createdAt)),
                  }),
                ]
              : []),
            ...(runCount > 0
              ? [
                  h("p", {
                    class: "plan-meta",
                    text:
                      runCount === 1
                        ? t("1 run logged")
                        : t("{0} runs logged").replace("{0}", String(runCount)),
                  }),
                ]
              : []),
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
            ...(runCount > 0
              ? [
                  h("button", {
                    class: "btn btn-small",
                    type: "button",
                    text: t("Report ▸"),
                    aria: {
                      label: t('share the adherence report for "{0}"').replace("{0}", String(s.name)),
                    },
                    on: {
                      click: () =>
                        runExport(t("Share"), async () => {
                          const result = await shareAdherence(s, loadSessions());
                          setStatus(
                            result === "shared"
                              ? t("Opened the share sheet — pick WhatsApp.")
                              : t("Sharing isn't available here, so the PNG was downloaded instead."),
                            "ok",
                          );
                        }),
                    },
                  }),
                ]
              : []),
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
    h("h2", { class: "section-title", text: t("Save · Library") }),
    h("div", { class: "btn-row" }, [
      ...(SHOW_SHEET_ACTIONS
        ? [
            h("button", {
              class: "btn btn-primary",
              type: "button",
              text: t("Save"),
              on: {
                click: () => {
                  sheet.updatedAt = saveSheet(sheet).updatedAt;
                  setStatus(t("Saved \"{0}\" to this browser.").replace("{0}", String(sheet.name)), "ok");
                  renderSaved();
                },
              },
            }),
            h("button", {
              class: "btn",
              type: "button",
              text: t("Download JSON"),
              on: {
                click: () => {
                  const blob = new Blob([sheetToJson(sheet)], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = h("a", { href: url, download: `${slug(sheet.name)}.sheet.json` });
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(url);
                  setStatus(t("Downloaded JSON file."), "ok");
                },
              },
            }),
          ]
        : []),
      h("button", {
        class: "btn",
        type: "button",
        text: t("New sheet"),
        on: {
          click: () => {
            track("routine_created");
            nav.editSheet(blankSheet());
          },
        },
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
  // The routine's kind is chosen here, at creation — one button per type — and is
  // fixed thereafter (no in-place switch). A movement list is a free-form chart; a
  // structured session is catalog-driven and run set-by-set.
  const addRoutine = (kind: RoutineKind): void => {
    track("routine_created");
    sheet.routines.push(blankRoutine(kind));
    renderRoutines();
  };
  const addRoutineRow = h("div", { class: "btn-row" }, [
    h("button", {
      class: "btn btn-small",
      type: "button",
      text: t("+ Movement list"),
      on: { click: () => addRoutine("movements") },
    }),
    h("button", {
      class: "btn btn-small",
      type: "button",
      text: t("+ Structured session"),
      on: { click: () => addRoutine("session") },
    }),
    ...(SHOW_SHEET_ACTIONS
      ? [
          h("button", {
            class: "btn btn-small btn-accent",
            type: "button",
            text: t("Run ▸"),
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
    { class: "ledger-tabs", role: "tablist", aria: { label: t("Routines sections") } },
    tabs.map((tab) => {
      const btn = h("button", {
        class: "ledger-tab",
        type: "button",
        role: "tab",
        aria: { label: t(tab.label) },
        on: { click: () => setTab(tab.id) },
      }, [
        h("span", { class: "ledger-tab__no", text: tab.no }),
        h("span", { class: "ledger-tab__label", text: t(tab.label) }),
        ...(tab.badge ? [tab.badge] : []),
      ]);
      tabButtons.set(tab.id, btn);
      return btn;
    }),
  );

  // ---- Assemble -------------------------------------------------------------
  const container = h("div", { class: "view view-sheet" }, [
    h("h1", { class: "view-title", text: t("Routines") }),
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
