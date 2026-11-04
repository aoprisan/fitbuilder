import { latestBodyweight } from "../bodyweightStore";
import { h } from "../dom";
import { loadBody, saveBody } from "../health/bodyProfile";
import { todayIso, type CutSettings } from "../health/cutModel";
import { legacyHeightOf, mergeWeighIns, parseCutState, saveCut } from "../health/cutStore";
import { registerTranslations, t } from "../i18n";
import type { FuelCtx } from "./fuelCtx";
import { measuresForm } from "./measures";
import { showNotice } from "./snackbar";

registerTranslations({
  "The terms": "Condițiile",
  "Calories / day": "Calorii / zi",
  "Protein g / day": "Proteine g / zi",
  "Window opens": "Fereastra se deschide",
  "Window closes": "Fereastra se închide",
  "Cut starts": "Începutul definirii",
  "Length · weeks": "Durată · săptămâni",
  "Start weight kg": "Greutate de start kg",
  "Goal weight kg": "Greutate țintă kg",
  "Blank → first weigh-in": "Gol → prima cântărire",
  "Saved.": "Salvat.",
  "At {0} kg, 1.6–2.2 g/kg is {1}–{2} g a day — enough to keep muscle on a cut, training included.":
    "La {0} kg, 1,6–2,2 g/kg înseamnă {1}–{2} g pe zi — suficient ca să păstrezi mușchii la definire, inclusiv antrenamentul.",
  "Log a weigh-in to see a range for your weight (1.6–2.2 g/kg, training included).":
    "Înregistrează o cântărire ca să vezi un interval pentru greutatea ta (1,6–2,2 g/kg, inclusiv antrenamentul).",
  "Your measures": "Măsurile tale",
  "Cut file": "Fișierul definirii",
  "Export JSON": "Exportă JSON",
  "Import JSON": "Importă JSON",
  "Imported.": "Importat.",
  "That file is not a cut file.": "Acel fișier nu este un fișier de definire.",
  "Replace the pantry, menu, food log and terms with this file? Its weigh-ins join your body-weight log.":
    "Înlocuiești cămara, meniul, jurnalul alimentar și condițiile cu acest fișier? Cântăririle lui se adaugă la jurnalul de greutate.",
  "Files from the standalone health journal or cut tracker import as-is. The full-app backup in Settings already includes all of this.":
    "Fișierele din jurnalul de sănătate sau din trackerul de definire separat se importă ca atare. Copia de rezervă din Setări include deja toate acestea.",
});

type Draft = Record<keyof CutSettings, string>;

const FIELDS: ReadonlyArray<{ key: keyof CutSettings; label: string; type: "number" | "time" | "date"; step?: string; hint?: string }> = [
  { key: "kcal", label: "Calories / day", type: "number" },
  { key: "protein", label: "Protein g / day", type: "number" },
  { key: "winStart", label: "Window opens", type: "time" },
  { key: "winEnd", label: "Window closes", type: "time" },
  { key: "startDate", label: "Cut starts", type: "date" },
  { key: "weeks", label: "Length · weeks", type: "number" },
  { key: "startWeight", label: "Start weight kg", type: "number", step: "0.05", hint: "Blank → first weigh-in" },
  { key: "goalWeight", label: "Goal weight kg", type: "number", step: "0.05" },
];

const toDraft = (s: CutSettings): Draft => ({
  kcal: String(s.kcal),
  protein: String(s.protein),
  winStart: s.winStart,
  winEnd: s.winEnd,
  startDate: s.startDate,
  weeks: String(s.weeks),
  startWeight: s.startWeight === null ? "" : String(s.startWeight),
  goalWeight: s.goalWeight === null ? "" : String(s.goalWeight),
});

// Daily protein that preserves muscle in a deficit for someone who lifts; the
// training sessions are inside this range, not on top of it.
const PROTEIN_G_PER_KG_LOW = 1.6;
const PROTEIN_G_PER_KG_HIGH = 2.2;

function proteinHint(): string {
  const kg = latestBodyweight()?.kg;
  if (kg === undefined || !(kg > 0))
    return t("Log a weigh-in to see a range for your weight (1.6–2.2 g/kg, training included).");
  const r5 = (x: number): number => Math.round(x / 5) * 5;
  return t("At {0} kg, 1.6–2.2 g/kg is {1}–{2} g a day — enough to keep muscle on a cut, training included.")
    .replace("{0}", String(Math.round(kg * 10) / 10))
    .replace("{1}", String(r5(kg * PROTEIN_G_PER_KG_LOW)))
    .replace("{2}", String(r5(kg * PROTEIN_G_PER_KG_HIGH)));
}

export function renderFuelTerms(host: HTMLElement, ctx: FuelCtx): void {
  const draft = toDraft(ctx.state.settings);
  const inputs = FIELDS.map((f) => {
    const el = h("input", {
      type: f.type,
      placeholder: "—",
      value: draft[f.key],
      ...(f.step ? { step: f.step } : {}),
      ...(f.type === "number" ? { inputmode: "decimal" } : {}),
    });
    el.addEventListener("input", () => (draft[f.key] = el.value));
    return h("label", { class: "field" }, [
      h("span", { class: "field-label", text: t(f.label) }),
      el,
      f.hint ? h("span", { class: "plan-meta plan-note", text: t(f.hint) }) : null,
      f.key === "protein" ? h("span", { class: "plan-meta plan-note", text: proteinHint() }) : null,
    ]);
  });

  const save = (): void => {
    const n = (v: string, fallback: number): number => {
      const x = Number(v.replace(",", "."));
      return Number.isFinite(x) && x > 0 ? x : fallback;
    };
    const opt = (v: string): number | null => {
      const x = Number(v.replace(",", "."));
      return v.trim() !== "" && Number.isFinite(x) && x > 0 ? x : null;
    };
    ctx.update((st) => {
      const s = st.settings;
      return {
        ...st,
        settings: {
          kcal: Math.round(n(draft.kcal, s.kcal)),
          protein: Math.round(n(draft.protein, s.protein)),
          winStart: draft.winStart || s.winStart,
          winEnd: draft.winEnd || s.winEnd,
          startDate: draft.startDate || s.startDate,
          weeks: Math.round(n(draft.weeks, s.weeks)),
          startWeight: opt(draft.startWeight),
          goalWeight: opt(draft.goalWeight),
        },
      };
    });
    showNotice(t("Saved."));
  };

  const terms = h("section", { class: "card" }, [
    h("h2", { class: "section-title", text: t("The terms") }),
    h("div", { class: "hl-terms" }, inputs),
    h("div", { class: "btn-row" }, [
      h("button", { class: "btn btn-small btn-primary", type: "button", text: t("Save"), on: { click: save } }),
    ]),
  ]);

  const measures = h("section", { class: "card" }, [
    h("h2", { class: "section-title", text: t("Your measures") }),
    measuresForm({ withNote: true, onSaved: () => ctx.reload() }).el,
  ]);

  // ── Import / export the cut on its own ──
  const file = h("input", { type: "file", accept: "application/json,.json", class: "hl-hidden-file" });
  file.addEventListener("change", () => {
    const f = file.files?.[0];
    file.value = "";
    if (!f) return;
    void f.text().then((text) => {
      let raw: unknown;
      let next;
      try {
        raw = JSON.parse(text);
        next = parseCutState(raw);
      } catch {
        showNotice(t("That file is not a cut file."));
        return;
      }
      if (!confirm(t("Replace the pantry, menu, food log and terms with this file? Its weigh-ins join your body-weight log."))) return;
      saveCut(next);
      mergeWeighIns(next.weights);
      const height = legacyHeightOf(raw);
      if (height !== null && loadBody().heightCm === null) saveBody({ heightCm: height });
      showNotice(t("Imported."));
      ctx.reload();
    });
  });
  const exportJson = (): void => {
    const blob = new Blob([JSON.stringify(ctx.state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = h("a", { href: url, download: `cut-${todayIso()}.json` });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };
  const data = h("section", { class: "card" }, [
    h("h2", { class: "section-title", text: t("Cut file") }),
    h("div", { class: "btn-row" }, [
      h("button", { class: "btn btn-small", type: "button", text: t("Export JSON"), on: { click: exportJson } }),
      h("button", { class: "btn btn-small", type: "button", text: t("Import JSON"), on: { click: () => file.click() } }),
      file,
    ]),
    h("p", {
      class: "plan-meta plan-note",
      text: t(
        "Files from the standalone health journal or cut tracker import as-is. The full-app backup in Settings already includes all of this.",
      ),
    }),
  ]);

  host.append(terms, measures, data);
}
