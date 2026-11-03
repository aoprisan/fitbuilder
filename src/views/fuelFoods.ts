import { h } from "../dom";
import { cloneMeals, DEFAULT_MEALS, foodById, type Food, mealMacros } from "../health/cutModel";
import { registerTranslations, t } from "../i18n";
import { fill, type FuelCtx } from "./fuelCtx";

registerTranslations({
  "The menu": "Meniul",
  "The meals under “Set the table”. Plan new ones with Claude on the Today page.":
    "Mesele de la „Pune masa”. Planifică altele noi cu Claude pe pagina Azi.",
  "No meals on the menu.": "Nicio masă în meniu.",
  "Remove {0} from the menu": "Elimină {0} din meniu",
  "Reset menu": "Resetează meniul",
  "Put back the original five meals? Your current menu is replaced.":
    "Pui înapoi cele cinci mese originale? Meniul curent va fi înlocuit.",
  "The pantry · per 100 g": "Cămara · la 100 g",
  "Values are per 100 g; edit any cell in place. Blank carbs or fat count as 0.":
    "Valorile sunt la 100 g; editează orice celulă direct. Carbohidrații sau grăsimile lăsate goale contează 0.",
  Name: "Nume",
  kcal: "kcal",
  Prot: "Prot",
  Carb: "Carb",
  "New food": "Aliment nou",
  "Delete {0}": "Șterge {0}",
  "{0} per 100 g of {1}": "{0} la 100 g de {1}",
});

const num = (raw: string): number | null => {
  const n = Number(raw.replace(",", "."));
  return raw.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : null;
};

type NumKey = "kcal" | "p" | "c" | "f";

export function renderFuelFoods(host: HTMLElement, ctx: FuelCtx): void {
  const state = ctx.state;

  // ── The menu ──
  const menu = h("section", { class: "card" }, [
    h("h2", { class: "section-title", text: t("The menu") }),
    h("p", { class: "plan-meta plan-note", text: t("The meals under “Set the table”. Plan new ones with Claude on the Today page.") }),
    state.meals.length === 0
      ? h("p", { class: "empty", text: t("No meals on the menu.") })
      : h(
          "ul",
          { class: "hl-list" },
          state.meals.map((m, i) => {
            const tt = mealMacros(state.foods, m);
            return h("li", { class: "hl-row hl-menu-row" }, [
              h("span", { class: "hl-row-name", text: m.name }),
              h("span", {
                class: "hl-row-soft hl-menu-items",
                text: m.items.map(([id, g]) => `${foodById(state.foods, id)?.name ?? t("(deleted food)")} ${g} g`).join(" · "),
              }),
              h("span", { class: "hl-row-soft", text: `${Math.round(tt.kcal)} kcal · ${Math.round(tt.p)} g` }),
              h("button", {
                class: "icon-btn",
                type: "button",
                text: "✕",
                aria: { label: fill(t("Remove {0} from the menu"), m.name) },
                on: { click: () => ctx.update((st) => ({ ...st, meals: st.meals.filter((_, j) => j !== i) })) },
              }),
            ]);
          }),
        ),
    h("div", { class: "btn-row" }, [
      h("button", {
        class: "btn btn-small",
        type: "button",
        text: t("Reset menu"),
        on: {
          click: () => {
            if (confirm(t("Put back the original five meals? Your current menu is replaced.")))
              ctx.update((st) => ({ ...st, meals: cloneMeals(DEFAULT_MEALS) }));
          },
        },
      }),
    ]),
  ]);

  // ── The pantry ──
  const updateFood = (id: string, patch: Partial<Omit<Food, "id">>): void =>
    ctx.update((st) => ({ ...st, foods: st.foods.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));

  const cell = (f: Food, k: NumKey, label: string): HTMLInputElement => {
    const cur = f[k];
    const el = h("input", {
      class: "hl-cell",
      type: "number",
      inputmode: "decimal",
      min: "0",
      step: "0.1",
      placeholder: "—",
      value: cur === undefined ? "" : String(cur),
      aria: { label: fill(t("{0} per 100 g of {1}"), label, f.name) },
    });
    el.addEventListener("change", () => {
      const v = num(el.value);
      if (v !== null && v !== cur) updateFood(f.id, { [k]: v });
      else el.value = cur === undefined ? "" : String(cur);
    });
    return el;
  };

  const rows = state.foods.map((f) => {
    const name = h("input", { class: "hl-cell is-name", type: "text", value: f.name, aria: { label: t("Name") } });
    name.addEventListener("change", () => {
      const v = name.value.trim();
      if (v && v !== f.name) updateFood(f.id, { name: v });
      else name.value = f.name;
    });
    return h("div", { class: "hl-pantry-row" }, [
      name,
      cell(f, "kcal", "kcal"),
      cell(f, "p", t("Protein")),
      cell(f, "c", t("Carbs")),
      cell(f, "f", t("Fat")),
      h("button", {
        class: "icon-btn",
        type: "button",
        text: "✕",
        aria: { label: fill(t("Delete {0}"), f.name) },
        on: { click: () => ctx.update((st) => ({ ...st, foods: st.foods.filter((x) => x.id !== f.id) })) },
      }),
    ]);
  });

  const nName = h("input", { type: "text", placeholder: "—", aria: { label: t("New food") } });
  const nums = (["kcal", "Protein", "Carbs", "Fat"] as const).map((l) =>
    h("input", { type: "number", inputmode: "decimal", min: "0", step: "0.1", placeholder: "—", aria: { label: t(l) } }),
  );
  const addFood = (): void => {
    const clean = nName.value.trim();
    if (!clean) return;
    const [k, p, c, f] = nums.map((el) => num(el.value));
    const food: Food = { id: `f${Date.now().toString(36)}`, name: clean, kcal: k ?? 0, p: p ?? 0 };
    if (c !== null && c !== undefined) food.c = c;
    if (f !== null && f !== undefined) food.f = f;
    ctx.update((st) => ({ ...st, foods: [...st.foods, food] }));
  };

  const pantry = h("section", { class: "card" }, [
    h("h2", { class: "section-title", text: t("The pantry · per 100 g") }),
    h("p", { class: "plan-meta plan-note", text: t("Values are per 100 g; edit any cell in place. Blank carbs or fat count as 0.") }),
    h("div", { class: "hl-pantry" }, [
      h("div", { class: "hl-pantry-row hl-pantry-head", aria: { hidden: "true" } }, [
        h("span", { text: t("Name") }),
        h("span", { text: "kcal" }),
        h("span", { text: t("Prot") }),
        h("span", { text: t("Carb") }),
        h("span", { text: t("Fat") }),
        h("span"),
      ]),
      ...rows,
    ]),
    h("div", { class: "hl-add hl-add-food" }, [
      h("label", { class: "field hl-grow" }, [h("span", { class: "field-label", text: t("New food") }), nName]),
      ...nums.map((el, i) =>
        h("label", { class: "field hl-narrow" }, [
          h("span", { class: "field-label", text: t(["kcal", "Prot", "Carb", "Fat"][i] ?? "") }),
          el,
        ]),
      ),
      h("button", { class: "btn btn-small btn-primary", type: "button", text: t("Add"), on: { click: addFood } }),
    ]),
  ]);

  host.append(menu, pantry);
}
