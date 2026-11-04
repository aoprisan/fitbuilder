import { append, clear, h } from "../dom";
import {
  buildMealPrompt,
  buildMenuPrompt,
  type EstimateItem,
  lineMacros,
  type MenuMeal,
  type MenuScope,
  parseClaudeReply,
  parseMenuReply,
  resolveItems,
  type TrainingNote,
} from "../health/cutClaude";
import { dayTotals, type Macros, type Meal, r1, sumMacros, ZERO_MACROS } from "../health/cutModel";
import { dateLocale, registerTranslations, t } from "../i18n";
import { flashLine, replyBox, sendRow, sessionDraft, takeSharedReply } from "./claudeBridge";
import { fill, type FuelCtx } from "./fuelCtx";
import { showNotice } from "./snackbar";

registerTranslations({
  "Estimate a meal with Claude": "Estimează o masă cu Claude",
  "Describe it, or snap it": "Descrie-o sau fotografiaz-o",
  "What did you eat?": "Ce ai mâncat?",
  "e.g. chicken shawarma wrap, small ayran": "de ex. shaorma de pui, un ayran mic",
  "Add photo": "Adaugă fotografie",
  "Change photo": "Schimbă fotografia",
  "Remove photo": "Elimină fotografia",
  "Paste Claude's reply": "Lipește răspunsul lui Claude",
  pantry: "cămară",
  replaces: "înlocuiește",
  Drop: "Elimină",
  "Meal · {0} kcal · {1} g protein · {2} g carbs · {3} g fat":
    "Masă · {0} kcal · {1} g proteine · {2} g carbohidrați · {3} g grăsimi",
  "Add to plate": "Adaugă în farfurie",
  "{0} food(s) on the plate.": "{0} aliment(e) în farfurie.",
  "New foods join the pantry at Claude's per-100 g values; names already in the pantry use yours.":
    "Alimentele noi intră în cămară cu valorile lui Claude la 100 g; numele deja existente folosesc valorile tale.",
  "Plan the menu with Claude": "Planifică meniul cu Claude",
  "What should Claude plan?": "Ce să planifice Claude?",
  "A full day": "O zi întreagă",
  "The rest of this day": "Restul acestei zile",
  "Aiming at {0} kcal and {1} g protein, window {2}–{3}.":
    "Țintă: {0} kcal și {1} g proteine, fereastra {2}–{3}.",
  "{0} kcal and {1} g protein left on this day.": "{0} kcal și {1} g proteine rămase în această zi.",
  "Changes · optional": "Modificări · opțional",
  "e.g. swap the schnitzel, no beef this week, add a snack under 200 kcal":
    "de ex. înlocuiește șnițelul, fără vită săptămâna asta, o gustare sub 200 kcal",
  "Paste Claude's menu": "Lipește meniul lui Claude",
  "Day · {0} of {1} kcal · {2} of {3} g protein": "Zi · {0} din {1} kcal · {2} din {3} g proteine",
  "Rest of day · {0} of {1} kcal · {2} of {3} g protein":
    "Restul zilei · {0} din {1} kcal · {2} din {3} g proteine",
  "Put on the plate": "Pune în farfurie",
  "Add to menu": "Adaugă în meniu",
  "Replace menu": "Înlocuiește meniul",
  "Replace all {0} menu meals with these {1}?": "Înlocuiești toate cele {0} mese din meniu cu aceste {1}?",
  "{0} meal(s) on the plate.": "{0} masă(mese) în farfurie.",
  "{0} meal(s) added to the menu.": "{0} masă(mese) adăugate în meniu.",
  "Menu replaced · {0} meal(s).": "Meniu înlocuit · {0} masă(mese).",
  "Meals with a name already on the menu replace it. New foods join the pantry at Claude's values; pantry names use yours.":
    "Mesele cu un nume deja în meniu îl înlocuiesc. Alimentele noi intră în cămară cu valorile lui Claude; numele din cămară folosesc valorile tale.",
  "Training today is included in the prompt.": "Antrenamentul de azi este inclus în prompt.",
});

export const fmtMacros = (m: Macros): string =>
  `${Math.round(m.kcal)} kcal · ${r1(m.p)} p · ${r1(m.c)} c · ${r1(m.f)} f`;

const n0 = (x: number): string => Math.round(x).toLocaleString(dateLocale());

// Open state and in-flight replies survive the repaint every logged change triggers.
const openPanels = { meal: false, menu: false };
let mealItems: EstimateItem[] | null = null;
let menuMeals: MenuMeal[] | null = null;
let menuScope: MenuScope = "day";
let photo: File | null = null;

const mealDesc = sessionDraft("gymlog.fuel.meal-draft");
const mealReply = sessionDraft("gymlog.fuel.meal-reply");
const menuChanges = sessionDraft("gymlog.fuel.menu-draft");
const menuReply = sessionDraft("gymlog.fuel.menu-reply");

function panel(kind: "meal" | "menu", title: string, content: HTMLElement[]): HTMLDetailsElement {
  const d = h("details", { class: "hl-claude" }, [
    h("summary", { class: "hl-claude-summary", text: `✦ ${title}` }),
    ...content,
  ]);
  d.open = openPanels[kind];
  d.addEventListener("toggle", () => (openPanels[kind] = d.open));
  return d;
}

function step(n: number, label: string, children: (HTMLElement | null)[]): HTMLElement {
  return h("div", { class: "hl-claude-step" }, [
    h("span", { class: "field-label", text: `${n} · ${label}` }),
    ...children,
  ]);
}

/** Log a Claude estimate: pantry names reuse your foods, the rest join the pantry. */
function logEstimate(ctx: FuelCtx, day: string, items: readonly EstimateItem[]): void {
  ctx.update((s) => {
    const { foods, pairs } = resolveItems(s.foods, items);
    if (!pairs.length) return s;
    const prev = s.days[day]?.entries ?? [];
    return {
      ...s,
      foods,
      days: { ...s.days, [day]: { entries: [...prev, ...pairs.map(([foodId, g]) => ({ foodId, g }))] } },
    };
  });
}

/* ─── estimate one meal ─────────────────────────────────── */

export function renderMealClaude(ctx: FuelCtx, day: string): HTMLElement {
  const shared = takeSharedReply("meal");
  if (shared !== null) {
    mealReply.set(shared);
    mealItems = null;
    openPanels.meal = true;
  }
  const flash = flashLine();
  const preview = h("div", { class: "hl-claude-preview" });

  const desc = h("textarea", {
    class: "hl-textarea",
    rows: "2",
    placeholder: t("e.g. chicken shawarma wrap, small ayran"),
    aria: { label: t("What did you eat?") },
  });
  desc.value = mealDesc.get();
  const send = sendRow({
    prompt: () => buildMealPrompt(desc.value, ctx.state.foods, photo !== null),
    photo: () => photo,
    say: flash.say,
  });
  const syncReady = (): void => send.setDisabled(desc.value.trim() === "" && photo === null);
  desc.addEventListener("input", () => {
    mealDesc.set(desc.value);
    syncReady();
  });

  const photoInput = h("input", { type: "file", accept: "image/*", class: "hl-hidden-file" });
  const photoRow = h("div", { class: "btn-row" });
  const paintPhoto = (): void => {
    clear(photoRow);
    append(photoRow, [
      h("button", {
        class: "btn btn-small",
        type: "button",
        text: photo ? t("Change photo") : t("Add photo"),
        on: { click: () => photoInput.click() },
      }),
      photo
        ? h("button", {
            class: "btn btn-small",
            type: "button",
            text: `${photo.name.length > 22 ? `${photo.name.slice(0, 20)}…` : photo.name} ✕`,
            aria: { label: t("Remove photo") },
            on: {
              click: () => {
                photo = null;
                paintPhoto();
                syncReady();
              },
            },
          })
        : null,
      photoInput,
    ]);
  };
  photoInput.addEventListener("change", () => {
    photo = photoInput.files?.[0] ?? null;
    paintPhoto();
    syncReady();
  });
  paintPhoto();
  syncReady();

  const paintPreview = (): void => {
    clear(preview);
    const items = mealItems ?? [];
    if (!items.length) return;
    const lines = items.map((it) => ({ it, m: lineMacros(ctx.state.foods, it) }));
    const total = lines.reduce<Macros>((acc, l) => sumMacros(acc, l.m), ZERO_MACROS);
    preview.append(
      h(
        "ul",
        { class: "hl-list" },
        lines.map(({ it, m }, i) => {
          const g = h("input", { class: "hl-grams", type: "number", inputmode: "decimal", min: "0", value: String(it.g) });
          g.addEventListener("change", () => {
            mealItems = items.map((x, j) => (j === i ? { ...x, g: Number(g.value) || 0 } : x));
            paintPreview();
          });
          return h("li", { class: "hl-row hl-food-row" }, [
            h("span", { class: "hl-row-name" }, [
              it.name,
              m.inPantry ? h("span", { class: "hl-tag", text: t("pantry") }) : null,
            ]),
            h("span", { class: "hl-row-grams" }, [g, h("span", { class: "hl-row-soft", text: "g" })]),
            h("span", { class: "hl-row-soft", text: fmtMacros(m) }),
            h("button", {
              class: "icon-btn",
              type: "button",
              text: t("Drop"),
              on: {
                click: () => {
                  mealItems = items.filter((_, j) => j !== i);
                  paintPreview();
                },
              },
            }),
          ]);
        }),
      ),
      h("p", {
        class: "plan-meta",
        text: fill(
          t("Meal · {0} kcal · {1} g protein · {2} g carbs · {3} g fat"),
          Math.round(total.kcal),
          Math.round(total.p),
          Math.round(total.c),
          Math.round(total.f),
        ),
      }),
      h("div", { class: "btn-row" }, [
        h("button", {
          class: "btn btn-small btn-accent",
          type: "button",
          text: t("Add to plate"),
          on: {
            click: () => {
              const keep = items.filter((x) => x.g > 0);
              if (!keep.length) return;
              mealItems = null;
              mealReply.set("");
              mealDesc.set("");
              photo = null;
              logEstimate(ctx, day, keep);
              showAfter(fill(t("{0} food(s) on the plate."), keep.length));
            },
          },
        }),
      ]),
      h("p", {
        class: "plan-meta plan-note",
        text: t("New foods join the pantry at Claude's per-100 g values; names already in the pantry use yours."),
      }),
    );
  };

  const reply = replyBox({
    initial: mealReply.get(),
    onReply: (text) => {
      mealReply.set(text);
      read(text);
    },
  });
  const read = (text: string): void => {
    if (!text.trim()) {
      mealItems = null;
      reply.setError(null);
    } else {
      try {
        mealItems = parseClaudeReply(text);
        reply.setError(null);
      } catch (e) {
        mealItems = null;
        reply.setError((e as Error).message);
      }
    }
    paintPreview();
  };
  if (mealItems === null) read(mealReply.get());
  else paintPreview();

  return panel("meal", t("Estimate a meal with Claude"), [
    step(1, t("Describe it, or snap it"), [desc, photoRow, send.el]),
    step(2, t("Paste Claude's reply"), [reply.el]),
    preview,
    flash.el,
  ]);
}

/* ─── plan the menu ─────────────────────────────────────── */

export function renderMenuClaude(ctx: FuelCtx, day: string, training: TrainingNote | null): HTMLElement {
  const shared = takeSharedReply("menu");
  if (shared !== null) {
    menuReply.set(shared);
    menuMeals = null;
    openPanels.menu = true;
  }
  const s = ctx.state.settings;
  const eaten = dayTotals(ctx.state, day);
  const flash = flashLine();
  const preview = h("div", { class: "hl-claude-preview" });

  const changes = h("textarea", {
    class: "hl-textarea",
    rows: "2",
    placeholder: t("e.g. swap the schnitzel, no beef this week, add a snack under 200 kcal"),
    aria: { label: t("Changes · optional") },
  });
  changes.value = menuChanges.get();
  changes.addEventListener("input", () => menuChanges.set(changes.value));

  // The rest of a training day aims at the protein target plus the session's
  // recovery dose; a full-day menu is the standing plan, so it keeps the base.
  const dayProtein = s.protein + (training?.proteinG ?? 0);
  const goals = (): { kcal: number; p: number } =>
    menuScope === "day"
      ? { kcal: s.kcal, p: s.protein }
      : { kcal: Math.max(0, s.kcal - eaten.kcal), p: Math.max(0, dayProtein - eaten.p) };

  const target = h("p", { class: "plan-meta plan-note" });
  const scopeRow = h("div", { class: "toggle hl-toggle", role: "radiogroup", aria: { label: t("What should Claude plan?") } });
  const paintScope = (): void => {
    clear(scopeRow);
    for (const [id, label] of [["day", t("A full day")], ["rest", t("The rest of this day")]] as const) {
      scopeRow.append(
        h("button", {
          class: `toggle-btn${menuScope === id ? " active" : ""}`,
          type: "button",
          role: "radio",
          text: label,
          aria: { checked: String(menuScope === id) },
          on: {
            click: () => {
              menuScope = id;
              paintScope();
              paintPreview();
            },
          },
        }),
      );
    }
    const g = goals();
    target.textContent =
      menuScope === "day"
        ? fill(t("Aiming at {0} kcal and {1} g protein, window {2}–{3}."), n0(s.kcal), s.protein, s.winStart, s.winEnd)
        : fill(t("{0} kcal and {1} g protein left on this day."), n0(g.kcal), Math.round(g.p)) +
          (training ? ` ${t("Training today is included in the prompt.")}` : "");
  };

  const send = sendRow({
    prompt: () =>
      buildMenuPrompt(
        { settings: s, foods: ctx.state.foods, meals: ctx.state.meals, eaten, training },
        menuScope,
        changes.value,
      ),
    say: flash.say,
  });

  const applyMenu = (meals: readonly MenuMeal[], mode: "merge" | "replace"): void =>
    ctx.update((st) => {
      let foods = st.foods;
      const incoming: Meal[] = [];
      meals.forEach((m, i) => {
        const r = resolveItems(foods, m.items, `${Date.now().toString(36)}m${i}`);
        foods = r.foods;
        if (r.pairs.length) incoming.push({ name: m.name, items: r.pairs });
      });
      if (!incoming.length) return st;
      const key = (n: string): string => n.trim().toLowerCase();
      let next: Meal[];
      if (mode === "replace") next = incoming;
      else {
        next = st.meals.map((m) => incoming.find((x) => key(x.name) === key(m.name)) ?? m);
        for (const x of incoming) if (!next.some((m) => key(m.name) === key(x.name))) next.push(x);
      }
      return { ...st, foods, meals: next };
    });

  const done = (msg: string): void => {
    menuMeals = null;
    menuReply.set("");
    menuChanges.set("");
    showAfter(msg);
  };

  const paintPreview = (): void => {
    clear(preview);
    const meals = menuMeals ?? [];
    if (!meals.length) return;
    const rows = meals.map((m) => ({
      meal: m,
      total: m.items.map((it) => lineMacros(ctx.state.foods, it)).reduce<Macros>((a, l) => sumMacros(a, l), ZERO_MACROS),
    }));
    const total = rows.reduce<Macros>((a, r) => sumMacros(a, r.total), ZERO_MACROS);
    const g = goals();
    const off = Math.abs(total.kcal - g.kcal) > g.kcal * 0.05;
    const key = (n: string): string => n.trim().toLowerCase();
    const n = meals.length;
    preview.append(
      h(
        "ul",
        { class: "hl-list" },
        rows.map(({ meal, total: tt }, i) =>
          h("li", { class: "hl-row hl-menu-row" }, [
            h("span", { class: "hl-row-name" }, [
              meal.name,
              ctx.state.meals.some((m) => key(m.name) === key(meal.name)) ? h("span", { class: "hl-tag", text: t("replaces") }) : null,
            ]),
            h("span", { class: "hl-row-soft hl-menu-items", text: meal.items.map((it) => `${it.name} ${it.g} g`).join(" · ") }),
            h("span", { class: "hl-row-soft", text: fmtMacros(tt) }),
            h("button", {
              class: "icon-btn",
              type: "button",
              text: t("Drop"),
              on: {
                click: () => {
                  menuMeals = meals.filter((_, j) => j !== i);
                  paintPreview();
                },
              },
            }),
          ]),
        ),
      ),
      h("p", {
        class: `plan-meta${off ? " hl-off" : ""}`,
        text: fill(
          menuScope === "day" ? t("Day · {0} of {1} kcal · {2} of {3} g protein") : t("Rest of day · {0} of {1} kcal · {2} of {3} g protein"),
          n0(total.kcal),
          n0(g.kcal),
          Math.round(total.p),
          Math.round(g.p),
        ),
      }),
      h("div", { class: "btn-row" }, [
        menuScope === "rest"
          ? h("button", {
              class: "btn btn-small btn-accent",
              type: "button",
              text: t("Put on the plate"),
              on: {
                click: () => {
                  const items = meals.flatMap((m) => m.items);
                  done(fill(t("{0} meal(s) on the plate."), n));
                  logEstimate(ctx, day, items);
                },
              },
            })
          : null,
        h("button", {
          class: `btn btn-small${menuScope === "day" ? " btn-accent" : ""}`,
          type: "button",
          text: t("Add to menu"),
          on: {
            click: () => {
              done(fill(t("{0} meal(s) added to the menu."), n));
              applyMenu(meals, "merge");
            },
          },
        }),
        menuScope === "day"
          ? h("button", {
              class: "btn btn-small",
              type: "button",
              text: t("Replace menu"),
              on: {
                click: () => {
                  if (!confirm(fill(t("Replace all {0} menu meals with these {1}?"), ctx.state.meals.length, n))) return;
                  done(fill(t("Menu replaced · {0} meal(s)."), n));
                  applyMenu(meals, "replace");
                },
              },
            })
          : null,
      ]),
      h("p", {
        class: "plan-meta plan-note",
        text: t(
          "Meals with a name already on the menu replace it. New foods join the pantry at Claude's values; pantry names use yours.",
        ),
      }),
    );
  };

  const reply = replyBox({
    initial: menuReply.get(),
    onReply: (text) => {
      menuReply.set(text);
      read(text);
    },
  });
  const read = (text: string): void => {
    if (!text.trim()) {
      menuMeals = null;
      reply.setError(null);
    } else {
      try {
        menuMeals = parseMenuReply(text);
        reply.setError(null);
      } catch (e) {
        menuMeals = null;
        reply.setError((e as Error).message);
      }
    }
    paintPreview();
  };
  paintScope();
  if (menuMeals === null) read(menuReply.get());
  else paintPreview();

  return panel("menu", t("Plan the menu with Claude"), [
    step(1, t("What should Claude plan?"), [scopeRow, target, changes, send.el]),
    step(2, t("Paste Claude's menu"), [reply.el]),
    preview,
    flash.el,
  ]);
}

/** A confirmation that outlives the repaint a log triggers (the panel is rebuilt). */
function showAfter(msg: string): void {
  showNotice(msg);
}
