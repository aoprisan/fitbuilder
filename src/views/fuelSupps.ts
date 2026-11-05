import { todayKey } from "../bodyweightStore";
import { clear, h } from "../dom";
import {
  clampPerDay,
  creatineRead,
  daysTaken,
  doseOf,
  dosesOn,
  formatDose,
  lastDays,
  loadSupps,
  newSupplement,
  stackStatus,
  streak,
  SUPP_PRESETS,
  SUPP_UNITS,
  updateSupps,
  type SuppState,
  type Supplement,
  type SuppUnit,
} from "../health/suppStore";
import { dateLocale, registerTranslations, t } from "../i18n";
import { fill } from "./fuelCtx";

registerTranslations({
  Supplements: "Suplimente",
  "Today's stack": "Suplimentele de azi",
  "{0} of {1} taken": "{0} din {1} luate",
  "Nothing in your stack yet — add creatine, B vitamins or anything else you take below.":
    "Nimic în listă încă — adaugă mai jos creatină, vitamine B sau orice altceva iei.",
  Take: "Iau",
  "Take {0}": "Iau {0}",
  Undo: "Anulează",
  "Undo the last dose of {0}": "Anulează ultima doză de {0}",
  "{0}-day streak": "{0} zile la rând",
  "The last 14 days": "Ultimele 14 zile",
  "Tap a day to tick it off or clear it.": "Atinge o zi ca s-o bifezi sau s-o golești.",
  "{0} on {1}: taken": "{0} pe {1}: luat",
  "{0} on {1}: not taken": "{0} pe {1}: neluat",
  "{0}/14 days": "{0}/14 zile",
  "Creatine stores": "Rezervele de creatină",
  "Saturated — {0} of the last 28 days. Keep the daily dose going.":
    "Saturate — {0} din ultimele 28 de zile. Continuă doza zilnică.",
  "Filling — {0} of the last 28 days. Daily 3–5 g fills muscle stores in about 3–4 weeks.":
    "Se umplu — {0} din ultimele 28 de zile. Zilnic 3–5 g umplu rezervele musculare în aproximativ 3–4 săptămâni.",
  "Lapsed — no dose this week. Stores drain over a few weeks; just restart the daily dose.":
    "Întrerupt — nicio doză săptămâna asta. Rezervele scad în câteva săptămâni; reia doza zilnică.",
  "Your stack": "Lista ta",
  "Quick add": "Adaugă rapid",
  "Add {0}": "Adaugă {0}",
  "Something else": "Altceva",
  Dose: "Doză",
  Unit: "Unitate",
  "Per day": "Pe zi",
  "Times a day": "De câte ori pe zi",
  "Remove {0} from your stack": "Elimină {0} din listă",
  "Remove {0}? Doses already logged stay in the record.":
    "Elimini {0}? Dozele deja înregistrate rămân în jurnal.",
  "Not medical advice — check doses with a doctor or pharmacist, especially alongside medication or in pregnancy.":
    "Nu este sfat medical — verifică dozele cu un medic sau farmacist, mai ales alături de medicamente sau în sarcină.",
  "Creatine monohydrate": "Creatină monohidrat",
  "Vitamin B12": "Vitamina B12",
  "Vitamin B complex": "Complex de vitamine B",
  "Vitamin D3": "Vitamina D3",
  "Omega-3 (EPA + DHA)": "Omega-3 (EPA + DHA)",
  Magnesium: "Magneziu",
  Zinc: "Zinc",
  "Vitamin C": "Vitamina C",
  Multivitamin: "Multivitamine",
  "Every day, any time — stores fill in ~3–4 weeks at 3–5 g.":
    "În fiecare zi, oricând — rezervele se umplu în ~3–4 săptămâni la 3–5 g.",
  "Morning; worth it on a plant-based diet.": "Dimineața; util mai ales la o dietă vegetală.",
  "Morning, with food.": "Dimineața, cu mâncare.",
  "With a meal that has some fat.": "La o masă care conține și grăsimi.",
  "With a meal.": "La masă.",
  "Evening.": "Seara.",
  "With food, apart from iron or calcium.": "Cu mâncare, separat de fier sau calciu.",
  "Any time.": "Oricând.",
  "With breakfast.": "La micul dejun.",
});

const NOON = 12;

function timeOf(ts: number): string {
  return new Date(ts).toLocaleTimeString(dateLocale(), { hour: "2-digit", minute: "2-digit" });
}

/** A day key → a timestamp on that day: now for today, noon for a past day. */
function tsFor(date: string): number {
  if (date === todayKey()) return Date.now();
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, NOON).getTime();
}

function noteFor(s: Supplement): string | null {
  const p = SUPP_PRESETS.find((x) => x.kind === s.kind);
  return p ? t(p.note) : null;
}

const num = (raw: string): number | null => {
  const n = Number(raw.replace(",", "."));
  return raw.trim() !== "" && Number.isFinite(n) && n > 0 ? n : null;
};

function unitSelect(value: SuppUnit, label: string, onPick: (u: SuppUnit) => void): HTMLSelectElement {
  const sel = h(
    "select",
    { class: "hl-select hl-supp-unit", aria: { label } },
    SUPP_UNITS.map((u) => h("option", { value: u, text: u })),
  );
  sel.value = value;
  sel.addEventListener("change", () => {
    const u = SUPP_UNITS.find((x) => x === sel.value);
    if (u) onPick(u);
  });
  return sel;
}

/**
 * Fuel → Supplements: the vitamins and supplements the user takes (creatine,
 * B vitamins, D3, …), ticked off each day, with a 14-day grid, streaks and a
 * creatine-store read. Keeps its own store (`gymlog.supplements`) and repaints
 * itself in place.
 */
export function renderFuelSupps(host: HTMLElement): void {
  let state: SuppState = loadSupps();

  const change = (fn: (s: SuppState) => SuppState): void => {
    const y = window.scrollY;
    state = updateSupps(fn);
    paint();
    window.scrollTo(0, y);
  };

  const take = (s: Supplement, date = todayKey()): void =>
    change((st) => ({ ...st, doses: [...st.doses, doseOf(s, tsFor(date))] }));
  const undoLast = (s: Supplement): void => {
    const last = dosesOn(state.doses, todayKey(), s.id).at(-1);
    if (last) change((st) => ({ ...st, doses: st.doses.filter((d) => d.id !== last.id) }));
  };
  const clearDay = (s: Supplement, date: string): void => {
    const ids = new Set(dosesOn(state.doses, date, s.id).map((d) => d.id));
    change((st) => ({ ...st, doses: st.doses.filter((d) => !ids.has(d.id)) }));
  };
  const patch = (id: string, p: Partial<Omit<Supplement, "id">>): void =>
    change((st) => ({ ...st, stack: st.stack.map((x) => (x.id === id ? { ...x, ...p } : x)) }));

  // ── Today ──
  function todayCard(): HTMLElement {
    const status = stackStatus(state);
    const rows = state.stack.map((s) => {
      const taken = dosesOn(state.doses, todayKey(), s.id);
      const done = taken.length >= s.perDay;
      const run = streak(state.doses, s.id);
      const note = noteFor(s);
      const meta = [
        formatDose(s.dose, s.unit) + (s.perDay > 1 ? ` · ${taken.length}/${s.perDay}` : ""),
        taken.length ? `✓ ${taken.map((d) => timeOf(d.ts)).join(", ")}` : "",
        run > 1 ? fill(t("{0}-day streak"), run) : "",
      ].filter(Boolean);
      return h("li", { class: `hl-row hl-supp-row${done ? " is-done" : ""}` }, [
        h("span", { class: "hl-supp-check", aria: { hidden: "true" }, text: done ? "✓" : "○" }),
        h("div", { class: "hl-supp-main" }, [
          h("span", { class: "hl-row-name", text: s.name }),
          h("span", { class: "hl-row-soft", text: meta.join(" · ") }),
          note ? h("span", { class: "hl-row-soft hl-supp-note", text: note }) : null,
        ]),
        done
          ? h("button", {
              class: "btn btn-small",
              type: "button",
              text: t("Undo"),
              aria: { label: fill(t("Undo the last dose of {0}"), s.name) },
              on: { click: () => undoLast(s) },
            })
          : h("button", {
              class: "btn btn-small btn-primary",
              type: "button",
              text: t("Take"),
              aria: { label: fill(t("Take {0}"), s.name) },
              on: { click: () => take(s) },
            }),
      ]);
    });
    return h("section", { class: "card" }, [
      h("p", { class: "eyebrow", text: t("Supplements") }),
      h("h2", { class: "section-title", text: t("Today's stack") }),
      state.stack.length
        ? h("p", { class: "plan-meta", text: fill(t("{0} of {1} taken"), status.done, status.total) })
        : null,
      state.stack.length
        ? h("ul", { class: "hl-list" }, rows)
        : h("p", { class: "empty", text: t("Nothing in your stack yet — add creatine, B vitamins or anything else you take below.") }),
    ]);
  }

  // ── The last 14 days ──
  function gridCard(): HTMLElement | null {
    if (!state.stack.length) return null;
    const days = lastDays(14);
    const loc = dateLocale();
    const dayLabel = (d: string): string =>
      new Date(tsFor(d)).toLocaleDateString(loc, { weekday: "short", day: "numeric", month: "short" });
    const today = todayKey();
    const head = h(
      "div",
      { class: "hl-supp-grid-row hl-supp-grid-head", aria: { hidden: "true" } },
      days.map((d) => h("span", { class: d === today ? "is-today" : "", text: String(Number(d.slice(8))) })),
    );
    const rows = state.stack.map((s) =>
      h("div", { class: "hl-supp-grid-row" }, [
        h("div", { class: "hl-supp-grid-label" }, [
          h("span", { class: "hl-supp-grid-name", text: s.name }),
          h("span", { class: "hl-row-soft hl-supp-grid-count", text: fill(t("{0}/14 days"), daysTaken(state.doses, s.id, days)) }),
        ]),
        ...days.map((d) => {
          const n = dosesOn(state.doses, d, s.id).length;
          const on = n > 0;
          const full = n >= s.perDay;
          return h("button", {
            class: `hl-supp-cell${on ? " is-on" : ""}${on && !full ? " is-part" : ""}${d === today ? " is-today" : ""}`,
            type: "button",
            aria: {
              label: fill(on ? t("{0} on {1}: taken") : t("{0} on {1}: not taken"), s.name, dayLabel(d)),
              pressed: String(on),
            },
            on: { click: () => (on ? clearDay(s, d) : take(s, d)) },
          });
        }),
      ]),
    );

    const creatine = state.stack.filter((s) => s.kind === "creatine");
    const reads = creatine.map((s) => {
      const r = creatineRead(state.doses, s.id);
      const text =
        r.read === "saturated"
          ? t("Saturated — {0} of the last 28 days. Keep the daily dose going.")
          : r.read === "loading"
            ? t("Filling — {0} of the last 28 days. Daily 3–5 g fills muscle stores in about 3–4 weeks.")
            : t("Lapsed — no dose this week. Stores drain over a few weeks; just restart the daily dose.");
      return h("div", { class: `hl-supp-creatine is-${r.read}` }, [
        h("span", { class: "field-label", text: creatine.length > 1 ? s.name : t("Creatine stores") }),
        h("p", { class: "plan-meta plan-note", text: fill(text, r.days) }),
      ]);
    });

    return h("section", { class: "card" }, [
      h("h2", { class: "section-title", text: t("The last 14 days") }),
      h("div", { class: "hl-supp-grid" }, [head, ...rows]),
      h("p", { class: "plan-meta plan-note", text: t("Tap a day to tick it off or clear it.") }),
      ...reads,
    ]);
  }

  // ── The stack editor ──
  function stackCard(): HTMLElement {
    const items = state.stack.map((s) => {
      const name = h("input", { class: "hl-cell is-name", type: "text", value: s.name, aria: { label: t("Name") } });
      name.addEventListener("change", () => {
        const v = name.value.trim();
        if (v && v !== s.name) patch(s.id, { name: v });
        else name.value = s.name;
      });
      const dose = h("input", {
        class: "hl-cell",
        type: "number",
        inputmode: "decimal",
        min: "0",
        step: "any",
        value: String(s.dose),
        aria: { label: `${t("Dose")} · ${s.name}` },
      });
      dose.addEventListener("change", () => {
        const v = num(dose.value);
        if (v !== null && v !== s.dose) patch(s.id, { dose: v });
        else dose.value = String(s.dose);
      });
      const per = h("input", {
        class: "hl-cell",
        type: "number",
        inputmode: "numeric",
        min: "1",
        max: "6",
        step: "1",
        value: String(s.perDay),
        aria: { label: `${t("Times a day")} · ${s.name}` },
      });
      per.addEventListener("change", () => {
        const v = num(per.value);
        if (v !== null && clampPerDay(v) !== s.perDay) patch(s.id, { perDay: clampPerDay(v) });
        else per.value = String(s.perDay);
      });
      return h("div", { class: "hl-supp-edit-row" }, [
        name,
        dose,
        unitSelect(s.unit, `${t("Unit")} · ${s.name}`, (u) => patch(s.id, { unit: u })),
        per,
        h("button", {
          class: "icon-btn",
          type: "button",
          text: "✕",
          aria: { label: fill(t("Remove {0} from your stack"), s.name) },
          on: {
            click: () => {
              if (confirm(fill(t("Remove {0}? Doses already logged stay in the record."), s.name)))
                change((st) => ({ ...st, stack: st.stack.filter((x) => x.id !== s.id) }));
            },
          },
        }),
      ]);
    });

    const have = new Set(state.stack.map((s) => s.kind));
    const presets = SUPP_PRESETS.filter((p) => !have.has(p.kind));
    const quick = presets.length
      ? h("div", { class: "hl-supp-quick" }, [
          h("span", { class: "field-label", text: t("Quick add") }),
          h(
            "div",
            { class: "hl-supp-chips" },
            presets.map((p) =>
              h("button", {
                class: "btn btn-small",
                type: "button",
                text: `+ ${t(p.name)} · ${formatDose(p.dose, p.unit)}`,
                aria: { label: fill(t("Add {0}"), t(p.name)) },
                on: {
                  click: () =>
                    change((st) => ({
                      ...st,
                      stack: [...st.stack, newSupplement({ kind: p.kind, name: t(p.name), dose: p.dose, unit: p.unit, perDay: 1 })],
                    })),
                },
              }),
            ),
          ),
        ])
      : null;

    // Custom item.
    const cName = h("input", { type: "text", placeholder: "—", aria: { label: t("Something else") } });
    const cDose = h("input", { type: "number", inputmode: "decimal", min: "0", step: "any", placeholder: "—", aria: { label: t("Dose") } });
    let cUnit: SuppUnit = "mg";
    const cUnitSel = unitSelect(cUnit, t("Unit"), (u) => (cUnit = u));
    const cPer = h("input", { type: "number", inputmode: "numeric", min: "1", max: "6", step: "1", value: "1", aria: { label: t("Times a day") } });
    const addCustom = (): void => {
      const n = cName.value.trim();
      const d = num(cDose.value);
      if (!n || d === null) return;
      change((st) => ({
        ...st,
        stack: [...st.stack, newSupplement({ kind: "other", name: n, dose: d, unit: cUnit, perDay: num(cPer.value) ?? 1 })],
      }));
    };

    return h("section", { class: "card" }, [
      h("h2", { class: "section-title", text: t("Your stack") }),
      items.length
        ? h("div", { class: "hl-supp-edit" }, [
            h("div", { class: "hl-supp-edit-row hl-pantry-head", aria: { hidden: "true" } }, [
              h("span", { text: t("Name") }),
              h("span", { text: t("Dose") }),
              h("span", { text: t("Unit") }),
              h("span", { text: t("Per day") }),
              h("span"),
            ]),
            ...items,
          ])
        : null,
      quick,
      h("div", { class: "hl-add" }, [
        h("label", { class: "field hl-grow" }, [h("span", { class: "field-label", text: t("Something else") }), cName]),
        h("label", { class: "field hl-narrow" }, [h("span", { class: "field-label", text: t("Dose") }), cDose]),
        h("label", { class: "field hl-narrow" }, [h("span", { class: "field-label", text: t("Unit") }), cUnitSel]),
        h("label", { class: "field hl-narrow" }, [h("span", { class: "field-label", text: t("Per day") }), cPer]),
        h("button", { class: "btn btn-small btn-primary", type: "button", text: t("Add"), on: { click: addCustom } }),
      ]),
      h("p", {
        class: "plan-meta plan-note",
        text: t(
          "Not medical advice — check doses with a doctor or pharmacist, especially alongside medication or in pregnancy.",
        ),
      }),
    ]);
  }

  function paint(): void {
    clear(host);
    const grid = gridCard();
    host.append(todayCard(), ...(grid ? [grid] : []), stackCard());
  }
  paint();
}
