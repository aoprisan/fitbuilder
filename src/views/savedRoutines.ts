import { clear, h } from "../dom";
import { flattenSheet } from "../execute";
import { filterField, matchesFilter } from "./filter";
import { registerTranslations, t } from "../i18n";
import type { Cleanup, Nav } from "../router";
import { loadSheets } from "../sheetStorage";
import type { RoutineSheet } from "../types";
import { cloneSheet, formatShortDate, routineExerciseCount } from "../util";

registerTranslations({
  "Saved routines": "Rutine salvate",
  "Routines your coach shared with you — saved on this device. Run one as a checklist, or start it live to log every set.":
    "Rutine pe care antrenorul ți le-a trimis — salvate pe acest dispozitiv. Rulează una ca listă de bifat sau pornește-o live pentru a înregistra fiecare serie.",
  "No saved routines yet. Open a routine link from your coach to add one here.":
    "Nicio rutină salvată încă. Deschide un link de rutină de la antrenorul tău pentru a adăuga una aici.",
  "{0} routines · {1} exercises": "{0} rutine · {1} exerciții",
  "Created {0}": "Creat {0}",
  "Run ▸": "Rulează ▸",
  "run routine \"{0}\"": "rulează rutina „{0}”",
  "Start live ▸": "Începe live ▸",
  "start a live session from routine \"{0}\"": "începe o sesiune live din rutina „{0}”",
  Steps: "Pași",
  "show the steps in routine \"{0}\"": "arată pașii din rutina „{0}”",
  "Steps in {0}": "Pași în {0}",
  "This routine has no exercises yet.": "Această rutină nu are încă exerciții.",
  Routine: "Rutină",
  Close: "Închide",
  "Filter saved routines": "Filtrează rutinele salvate",
  "No saved routines match this filter.": "Nicio rutină salvată nu se potrivește filtrului.",
  Superset: "Superset",
});

/**
 * The flattened exercise steps of a saved routine, grouped by routine and (for a
 * structured session) section — a read-only preview the student opens before
 * running a plan. Reuses the runner's `flattenSheet`, so it shows exactly what
 * Run / Start live will work through, with each row's target prescription.
 */
function stepsList(sheet: RoutineSheet): HTMLElement {
  const items = flattenSheet(sheet);
  const list = h("div", { class: "steps-list" });
  if (items.length === 0) {
    list.appendChild(h("p", { class: "empty", text: t("This routine has no exercises yet.") }));
    return list;
  }
  let lastRoutine = -1;
  let lastSection = "";
  let stepNo = 0;
  for (const item of items) {
    if (item.routineIndex !== lastRoutine) {
      lastRoutine = item.routineIndex;
      lastSection = "";
      stepNo = 0;
      list.appendChild(h("p", { class: "steps-routine", text: item.routineTitle || t("Routine") }));
    }
    const section = item.sectionTitle ?? "";
    if (section !== lastSection) {
      lastSection = section;
      if (section !== "") list.appendChild(h("p", { class: "steps-section", text: section }));
    }
    stepNo++;
    list.appendChild(
      h("div", { class: "steps-row" }, [
        h("span", { class: "steps-no", text: String(stepNo) }),
        h("div", { class: "steps-body" }, [
          h("span", { class: "steps-name", text: item.name }),
          item.supersetGroup !== undefined
            ? h("span", { class: "ss-chip", title: t("Superset"), text: "SS" })
            : null,
          item.prescription ? h("span", { class: "steps-pres", text: item.prescription }) : null,
        ]),
      ]),
    );
  }
  return list;
}

/**
 * Show a routine's steps in a modal overlay (read-only). Lives on document.body
 * (outside the view), so the caller holds the returned close fn and runs it on
 * teardown. Mirrors the QR overlay in sheet.ts.
 */
function showStepsOverlay(sheet: RoutineSheet): () => void {
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") close();
  };
  function close(): void {
    document.removeEventListener("keydown", onKey);
    overlay.remove();
  }

  const card = h(
    "div",
    {
      class: "qr-overlay__card steps-overlay__card",
      role: "dialog",
      aria: { modal: "true", label: t("Steps in {0}").replace("{0}", String(sheet.name)) },
    },
    [
      h("p", { class: "qr-overlay__title", text: sheet.name }),
      stepsList(sheet),
      h("div", { class: "btn-row qr-overlay__actions" }, [
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

export function mountSavedRoutines(root: HTMLElement, nav: Nav): Cleanup {
  // Newest first — the creation date is the student's most natural sort order
  // (the routine your coach just shared shows up on top).
  const sheets = loadSheets().sort((a, b) =>
    (b.createdAt ?? b.updatedAt ?? "").localeCompare(a.createdAt ?? a.updatedAt ?? ""),
  );

  const head = h("section", { class: "hero" }, [
    h("p", { class: "eyebrow", text: "GYM LOG" }),
    h("h1", { class: "display", text: t("Saved routines") }),
    h("p", {
      class: "lede",
      text: t(
        "Routines your coach shared with you — saved on this device. Run one as a checklist, or start it live to log every set.",
      ),
    }),
  ]);

  // The steps overlay lives on document.body (outside this view), so track it and
  // tear it down on cleanup if the user navigates away while it's open.
  let dismissOverlay: (() => void) | null = null;

  const listHost = h("div", { class: "saved-list saved-sheets" });

  // Name filter above the list — shown once the library is long enough to need
  // one; the list repaints in place per keystroke so the input keeps focus.
  let filter = "";
  const filterEl = filterField(t("Filter saved routines"), (q) => {
    filter = q;
    paintList();
  });
  filterEl.hidden = sheets.length < 4;

  function paintList(): void {
    clear(listHost);
    if (sheets.length === 0) {
      listHost.appendChild(
        h("p", {
          class: "empty",
          text: t("No saved routines yet. Open a routine link from your coach to add one here."),
        }),
      );
      return;
    }
    const shown = sheets.filter((s) => matchesFilter(s.name, filter));
    if (shown.length === 0) {
      listHost.appendChild(
        h("p", { class: "empty", text: t("No saved routines match this filter.") }),
      );
      return;
    }
    for (const s of shown) {
      const exCount = s.routines.reduce((sum, r) => sum + routineExerciseCount(r), 0);
      listHost.appendChild(
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
          ]),
          h("div", { class: "btn-row saved-actions" }, [
            h("button", {
              class: "btn btn-small",
              type: "button",
              text: t("Steps"),
              aria: { label: t('show the steps in routine "{0}"').replace("{0}", String(s.name)) },
              on: {
                click: () => {
                  dismissOverlay?.();
                  dismissOverlay = showStepsOverlay(s);
                },
              },
            }),
            h("button", {
              class: "btn btn-small btn-accent",
              type: "button",
              text: t("Run ▸"),
              aria: { label: t('run routine "{0}"').replace("{0}", String(s.name)) },
              on: { click: () => nav.runSheet(cloneSheet(s)) },
            }),
            h("button", {
              class: "btn btn-small btn-accent",
              type: "button",
              text: t("Start live ▸"),
              aria: {
                label: t('start a live session from routine "{0}"').replace("{0}", String(s.name)),
              },
              on: { click: () => nav.startLive(cloneSheet(s)) },
            }),
          ]),
        ]),
      );
    }
  }

  paintList();
  root.appendChild(h("div", { class: "view view-saved-routines" }, [head, filterEl, listHost]));
  return () => {
    dismissOverlay?.();
  };
}
