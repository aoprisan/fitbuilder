import { h } from "../dom";
import { dayLedger } from "../health/crossData";
import { dateLocale, registerTranslations, t } from "../i18n";
import type { Nav } from "../router";
import type { TrainingSession } from "../types";

registerTranslations({
  "Today's fuel": "Alimentația de azi",
  "Water {0}%": "Apă {0}%",
  "{0} of {1} ml": "{0} din {1} ml",
  "{0} of {1} kcal · {2} of {3} g protein": "{0} din {1} kcal · {2} din {3} g proteine",
  "+{0} g protein for training": "+{0} g proteine pentru antrenament",
  "+{0} ml for training": "+{0} ml pentru antrenament",
  "Open Water": "Deschide Apă",
  "Open Fuel": "Deschide Nutriție",
});

function bar(fraction: number, cls: string): HTMLElement {
  const fill = h("div", { class: "hl-bar-fill" });
  fill.style.width = `${Math.max(0, Math.min(100, fraction * 100))}%`;
  return h("div", { class: `hl-bar ${cls}`, aria: { hidden: "true" } }, [fill]);
}

/**
 * The Body home's glance at the health journal: today's effective hydration
 * against a goal that grows with today's training, and today's food against
 * the Fuel targets (protein topped up by today's training too). Each half opens its tab.
 */
export function renderTodayStrip(nav: Nav, sessions: TrainingSession[]): HTMLElement {
  const d = dayLedger(undefined, sessions);
  const n0 = (x: number): string => Math.round(x).toLocaleString(dateLocale());
  const waterPct = Math.round((d.hydrationMl / Math.max(1, d.waterGoalMl)) * 100);
  return h("section", { class: "card" }, [
    h("p", { class: "eyebrow", text: t("Today's fuel") }),
    h("div", { class: "hl-today-strip" }, [
      h(
        "button",
        { class: "hl-today-cell", type: "button", aria: { label: t("Open Water") }, on: { click: () => nav.go("water") } },
        [
          h("span", { class: "field-label", text: t("Water {0}%").replace("{0}", String(waterPct)) }),
          bar(d.hydrationMl / Math.max(1, d.waterGoalMl), "is-water"),
          h("span", {
            class: "plan-meta",
            text: t("{0} of {1} ml").replace("{0}", n0(d.hydrationMl)).replace("{1}", n0(d.waterGoalMl)),
          }),
          d.training.hydrationMl > 0
            ? h("span", { class: "plan-meta", text: t("+{0} ml for training").replace("{0}", n0(d.training.hydrationMl)) })
            : null,
        ],
      ),
      h(
        "button",
        { class: "hl-today-cell", type: "button", aria: { label: t("Open Fuel") }, on: { click: () => nav.go("fuel") } },
        [
          h("span", { class: "field-label", text: t("Fuel") }),
          bar(d.food.kcal / Math.max(1, d.kcalTarget), "is-kcal"),
          h("span", {
            class: "plan-meta",
            text: t("{0} of {1} kcal · {2} of {3} g protein")
              .replace("{0}", n0(d.food.kcal))
              .replace("{1}", n0(d.kcalTarget))
              .replace("{2}", String(Math.round(d.food.p)))
              .replace("{3}", String(d.proteinTarget)),
          }),
          d.training.proteinG > 0
            ? h("span", { class: "plan-meta", text: t("+{0} g protein for training").replace("{0}", String(d.training.proteinG)) })
            : null,
        ],
      ),
    ]),
  ]);
}
