import { h } from "../dom";
import { registerTranslations, t } from "../i18n";
import type { Cleanup, Nav } from "../router";
import { loadSheets } from "../sheetStorage";
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
});

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

  const listHost = h("div", { class: "saved-list saved-sheets" });

  if (sheets.length === 0) {
    listHost.appendChild(
      h("p", {
        class: "empty",
        text: t("No saved routines yet. Open a routine link from your coach to add one here."),
      }),
    );
  } else {
    for (const s of sheets) {
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

  root.appendChild(h("div", { class: "view view-saved-routines" }, [head, listHost]));
  return () => {};
}
