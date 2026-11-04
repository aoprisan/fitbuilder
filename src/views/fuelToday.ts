import { h } from "../dom";
import { dayLedger } from "../health/crossData";
import {
  addDays,
  dayTotals,
  entryMacros,
  foodById,
  type FoodEntry,
  type Meal,
  mealMacros,
  r1,
  todayIso,
  windowOpen,
} from "../health/cutModel";
import { dateLocale, registerTranslations, t } from "../i18n";
import { fill, type FuelCtx } from "./fuelCtx";
import { renderMealClaude, renderMenuClaude, saveMealRow } from "./fuelClaude";

registerTranslations({
  "Previous day": "Ziua precedentă",
  "Next day": "Ziua următoare",
  "Today · {0}": "Azi · {0}",
  "Yesterday · {0}": "Ieri · {0}",
  "Eating window open · closes {0}": "Fereastra de masă deschisă · se închide la {0}",
  "Fasting · window {0}–{1}": "Post · fereastra {0}–{1}",
  "Back to today": "Înapoi la azi",
  Calories: "Calorii",
  Protein: "Proteine",
  Carbs: "Carbohidrați",
  Fat: "Grăsimi",
  "{0} left of {1}": "{0} rămase din {1}",
  "{0} over {1}": "{0} peste {1}",
  "{0} g to go of {1}": "încă {0} g din {1}",
  "Target kept — {0} g": "Țintă atinsă — {0} g",
  "Training & water": "Antrenament și apă",
  "~{0} g in the meal after training": "~{0} g în masa de după antrenament",
  "{0} session(s) · ~{1} kcal burned · ~{2} g protein after training":
    "{0} sesiune(i) · ~{1} kcal arse · ~{2} g proteine după antrenament",
  "No training logged on this day.": "Niciun antrenament înregistrat în această zi.",
  "Water {0} of {1} ml": "Apă {0} din {1} ml",
  "The training fluid is added to the water goal. The protein target already covers training — the post-session amount is when to eat part of it, not extra. The calorie target stays as set — the burn is shown so a training day's hunger makes sense, not to be eaten back.":
    "Lichidele pentru antrenament se adaugă la obiectivul de apă. Ținta de proteine acoperă deja antrenamentul — cantitatea de după sesiune arată când să mănânci o parte din ea, nu în plus. Ținta de calorii rămâne cea setată — arderea e afișată ca să explice foamea dintr-o zi de antrenament, nu ca să fie mâncată înapoi.",
  "Open Water": "Deschide Apă",
  "Set the table": "Pune masa",
  Food: "Aliment",
  Grams: "Grame",
  Add: "Adaugă",
  "Added {0}.": "S-a adăugat {0}.",
  "The plate": "Farfuria",
  "Nothing eaten yet — set the table above.": "Nimic mâncat încă — pune masa mai sus.",
  "(deleted food)": "(aliment șters)",
  "Grams of {0}": "Grame de {0}",
  "Remove {0}": "Șterge {0}",
  "Save the plate as a meal": "Salvează farfuria ca masă",
  "Keeps these foods and grams under Set the table, to log again with one tap.":
    "Păstrează aceste alimente și gramaje la Pune masa, ca să le înregistrezi din nou cu o atingere.",
});

// The day being viewed survives repaints and remounts within a session.
let viewDay: string | null = null;

function dayTitle(day: string, today: string): string {
  const label = new Date(`${day}T12:00:00`).toLocaleDateString(dateLocale(), {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  if (day === today) return fill(t("Today · {0}"), label);
  if (day === addDays(today, -1)) return fill(t("Yesterday · {0}"), label);
  return label;
}

function bar(fraction: number, cls: string): HTMLElement {
  const fillEl = h("div", { class: "hl-bar-fill" });
  fillEl.style.width = `${Math.max(0, Math.min(100, fraction * 100))}%`;
  return h("div", { class: `hl-bar ${cls}`, aria: { hidden: "true" } }, [fillEl]);
}

const n0 = (x: number): string => Math.round(x).toLocaleString(dateLocale());

export function renderFuelToday(host: HTMLElement, ctx: FuelCtx): void {
  const state = ctx.state;
  const s = state.settings;
  const today = todayIso();
  if (viewDay === null || viewDay > today) viewDay = today;
  const day = viewDay;
  const go = (d: string): void => {
    viewDay = d;
    ctx.reload();
  };

  const { kcal, p, c, f } = dayTotals(state, day);
  // The day's training and water, from the other logs. Training raises the
  // water goal; protein keeps its daily target and gets a post-session serving.
  const ledger = dayLedger(day);
  const tr = ledger.training;
  const pTarget = s.protein;
  const kcalLeft = s.kcal - kcal;
  const pLeft = pTarget - p;
  const over = kcal > s.kcal * 1.03;
  const open = windowOpen(s);

  // ── Hero: day navigation, calories + protein against target ──
  const hero = h("section", { class: "card hl-cut-hero" }, [
    h("div", { class: "hl-daynav" }, [
      h("button", {
        class: "icon-btn",
        type: "button",
        text: "‹",
        aria: { label: t("Previous day") },
        on: { click: () => go(addDays(day, -1)) },
      }),
      h("div", { class: "hl-daynav-center" }, [
        h("div", { class: "hl-daynav-title", text: dayTitle(day, today) }),
        day === today
          ? h("span", {
              class: `hl-window ${open ? "is-open" : "is-closed"}`,
              text: open
                ? fill(t("Eating window open · closes {0}"), s.winEnd)
                : fill(t("Fasting · window {0}–{1}"), s.winStart, s.winEnd),
            })
          : h("button", { class: "hl-window is-link", type: "button", text: t("Back to today"), on: { click: () => go(today) } }),
      ]),
      h("button", {
        class: "icon-btn",
        type: "button",
        text: "›",
        disabled: day >= today,
        aria: { label: t("Next day") },
        on: { click: () => go(addDays(day, 1)) },
      }),
    ]),
    h("div", { class: "hl-macros" }, [
      h("div", { class: `hl-macro${over ? " is-over" : ""}` }, [
        h("span", { class: "field-label", text: t("Calories") }),
        h("div", { class: "hl-macro-value", text: `${n0(kcal)} kcal` }),
        bar(kcal / s.kcal, "is-kcal"),
        h("p", {
          class: "plan-meta",
          text: kcalLeft >= 0 ? fill(t("{0} left of {1}"), n0(kcalLeft), n0(s.kcal)) : fill(t("{0} over {1}"), n0(-kcalLeft), n0(s.kcal)),
        }),
      ]),
      h("div", { class: `hl-macro${pLeft <= 0 ? " is-hit" : ""}` }, [
        h("span", { class: "field-label", text: t("Protein") }),
        h("div", { class: "hl-macro-value", text: `${Math.round(p)} g` }),
        bar(p / Math.max(1, pTarget), "is-protein"),
        h("p", {
          class: "plan-meta",
          text: pLeft > 0 ? fill(t("{0} g to go of {1}"), Math.round(pLeft), pTarget) : fill(t("Target kept — {0} g"), pTarget),
        }),
        tr.proteinG > 0 ? h("p", { class: "plan-meta", text: fill(t("~{0} g in the meal after training"), tr.proteinG) }) : null,
      ]),
    ]),
    h("p", { class: "plan-meta", text: `${t("Carbs")} ${Math.round(c)} g · ${t("Fat")} ${Math.round(f)} g` }),
  ]);

  // ── The day's training and water ──
  const cross = h("section", { class: "card hl-cross" }, [
    h("h2", { class: "section-title", text: t("Training & water") }),
    h("p", {
      class: "plan-meta plan-note",
      text: tr.sessions.length
        ? fill(t("{0} session(s) · ~{1} kcal burned · ~{2} g protein after training"), tr.sessions.length, n0(tr.kcal), tr.proteinG)
        : t("No training logged on this day."),
    }),
    bar(ledger.hydrationMl / Math.max(1, ledger.waterGoalMl), "is-water"),
    h("p", { class: "plan-meta", text: fill(t("Water {0} of {1} ml"), n0(ledger.hydrationMl), n0(ledger.waterGoalMl)) }),
    tr.sessions.length
      ? h("p", {
          class: "plan-meta plan-note",
          text: t(
            "The training fluid is added to the water goal. The protein target already covers training — the post-session amount is when to eat part of it, not extra. The calorie target stays as set — the burn is shown so a training day's hunger makes sense, not to be eaten back.",
          ),
        })
      : null,
    h("div", { class: "btn-row" }, [
      h("button", { class: "btn btn-tiny", type: "button", text: t("Open Water"), on: { click: () => ctx.nav.go("water") } }),
    ]),
  ]);

  // ── Set the table: one-tap meals, a single food, Claude ──
  const addMeal = (meal: Meal): void =>
    ctx.update((st) => {
      const known = meal.items.filter(([id]) => st.foods.some((x) => x.id === id));
      if (!known.length) return st;
      const prev = st.days[day]?.entries ?? [];
      return {
        ...st,
        days: { ...st.days, [day]: { entries: [...prev, ...known.map(([foodId, g]) => ({ foodId, g }))] } },
      };
    });

  const select = h(
    "select",
    { class: "hl-select", aria: { label: t("Food") } },
    state.foods.map((x) => h("option", { value: x.id, text: x.name })),
  );
  const grams = h("input", { type: "number", inputmode: "decimal", min: "0", placeholder: "g", aria: { label: t("Grams") } });
  const addFood = (): void => {
    const g = Number(grams.value.replace(",", "."));
    const foodId = select.value;
    if (!foodId || !(g > 0)) return;
    ctx.update((st) => ({
      ...st,
      days: { ...st.days, [day]: { entries: [...(st.days[day]?.entries ?? []), { foodId, g }] } },
    }));
  };
  grams.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addFood();
  });

  const table = h("section", { class: "card" }, [
    h("h2", { class: "section-title", text: t("Set the table") }),
    h(
      "div",
      { class: "hl-meals" },
      state.meals.map((m) => {
        const mm = mealMacros(state.foods, m);
        return h("button", { class: "hl-meal", type: "button", on: { click: () => addMeal(m) } }, [
          h("span", { class: "hl-meal-name", text: m.name }),
          h("span", { class: "hl-row-soft", text: `${Math.round(mm.kcal)} kcal · ${Math.round(mm.p)} g` }),
        ]);
      }),
    ),
    h("div", { class: "hl-add" }, [
      h("label", { class: "field hl-grow" }, [h("span", { class: "field-label", text: t("Food") }), select]),
      h("label", { class: "field hl-narrow" }, [h("span", { class: "field-label", text: t("Grams") }), grams]),
      h("button", { class: "btn btn-small btn-primary", type: "button", text: t("Add"), on: { click: addFood } }),
    ]),
    renderMealClaude(ctx, day),
    renderMenuClaude(ctx, day, tr.sessions.length ? { kcal: tr.kcal, proteinG: tr.proteinG } : null),
  ]);

  // ── The plate ──
  const entries = state.days[day]?.entries ?? [];
  const setGrams = (i: number, g: number): void =>
    ctx.update((st) => mapDay(st, day, (es) => es.map((e, j) => (j === i ? { ...e, g } : e))));
  const remove = (i: number): void => ctx.update((st) => mapDay(st, day, (es) => es.filter((_, j) => j !== i)));

  const plate = h("section", { class: "card" }, [
    h("h2", { class: "section-title", text: t("The plate") }),
    entries.length === 0
      ? h("p", { class: "empty", text: t("Nothing eaten yet — set the table above.") })
      : h(
          "ul",
          { class: "hl-list" },
          entries.map((e, i) => {
            const food = foodById(state.foods, e.foodId);
            const m = entryMacros(state.foods, e);
            const name = food?.name ?? t("(deleted food)");
            const input = h("input", {
              class: "hl-grams",
              type: "number",
              inputmode: "decimal",
              min: "0",
              value: String(e.g),
              aria: { label: fill(t("Grams of {0}"), name) },
            });
            input.addEventListener("change", () => {
              const g = Number(input.value);
              if (g >= 0 && g !== e.g) setGrams(i, g);
              else input.value = String(e.g);
            });
            input.addEventListener("keydown", (ev) => {
              if (ev.key === "Enter") input.blur();
            });
            const hasCF = food?.c !== undefined || food?.f !== undefined;
            return h("li", { class: "hl-row hl-food-row" }, [
              h("span", { class: "hl-row-name", text: name }),
              h("span", { class: "hl-row-grams" }, [input, h("span", { class: "hl-row-soft", text: "g" })]),
              h("span", {
                class: "hl-row-soft",
                text: `${Math.round(m.kcal)} kcal · ${r1(m.p)} p${hasCF ? ` · ${r1(m.c)} c · ${r1(m.f)} f` : ""}`,
              }),
              h("button", {
                class: "icon-btn",
                type: "button",
                text: "✕",
                aria: { label: fill(t("Remove {0}"), name) },
                on: { click: () => remove(i) },
              }),
            ]);
          }),
        ),
    entries.length
      ? h("details", { class: "hl-claude" }, [
          h("summary", { class: "hl-claude-summary", text: t("Save the plate as a meal") }),
          h("p", {
            class: "plan-meta plan-note",
            text: t("Keeps these foods and grams under Set the table, to log again with one tap."),
          }),
          saveMealRow(ctx, "", (st) => ({
            foods: st.foods,
            pairs: (st.days[day]?.entries ?? [])
              .filter((e) => e.g > 0 && st.foods.some((x) => x.id === e.foodId))
              .map((e): [string, number] => [e.foodId, e.g]),
          })),
        ])
      : null,
  ]);

  host.append(hero, cross, table, plate);
}

function mapDay(
  st: import("../health/cutModel").CutState,
  day: string,
  fn: (entries: FoodEntry[]) => FoodEntry[],
): import("../health/cutModel").CutState {
  const entries = fn(st.days[day]?.entries ?? []);
  const days = { ...st.days };
  if (entries.length) days[day] = { entries };
  else delete days[day];
  return { ...st, days };
}
