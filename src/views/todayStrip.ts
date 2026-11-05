import { h } from "../dom";
import { dayLedger } from "../health/crossData";
import { dateLocale, registerTranslations, t } from "../i18n";
import type { Nav } from "../router";
import type { TrainingSession } from "../types";
import { loadSupps, stackStatus } from "../health/suppStore";
import { seedFuelTab } from "./fuel";

registerTranslations({
  "Today's fuel": "Alimentația de azi",
  "Water {0}%": "Apă {0}%",
  "{0} of {1} ml": "{0} din {1} ml",
  "{0} of {1} kcal · {2} of {3} g protein": "{0} din {1} kcal · {2} din {3} g proteine",
  "~{0} g protein after training": "~{0} g proteine după antrenament",
  "+{0} ml for training": "+{0} ml pentru antrenament",
  "Open Water": "Deschide Apă",
  "Open Fuel": "Deschide Nutriție",
  "Supplements {0}/{1}": "Suplimente {0}/{1}",
  "Open supplements": "Deschide suplimentele",
  "All taken": "Toate luate",
  "{0} still to take": "{0} de luat",
});

function bar(fraction: number, cls: string): HTMLElement {
  const fill = h("div", { class: "hl-bar-fill" });
  fill.style.width = `${Math.max(0, Math.min(100, fraction * 100))}%`;
  return h("div", { class: `hl-bar ${cls}`, aria: { hidden: "true" } }, [fill]);
}

/**
 * The Body home's glance at the health journal: today's effective hydration
 * against a goal that grows with today's training, and today's food against
 * the Fuel targets, with the protein to eat after today's training, and — once a supplement stack
 * exists — how much of it is ticked off. Each cell opens its tab.
 */
export function renderTodayStrip(nav: Nav, sessions: TrainingSession[]): HTMLElement {
  const d = dayLedger(undefined, sessions);
  const n0 = (x: number): string => Math.round(x).toLocaleString(dateLocale());
  const waterPct = Math.round((d.hydrationMl / Math.max(1, d.waterGoalMl)) * 100);
  const supps = stackStatus(loadSupps());
  const suppCell =
    supps.total > 0
      ? h(
          "button",
          {
            class: "hl-today-cell hl-today-wide",
            type: "button",
            aria: { label: t("Open supplements") },
            on: {
              click: () => {
                seedFuelTab("supps");
                nav.go("fuel");
              },
            },
          },
          [
            h("span", {
              class: "field-label",
              text: t("Supplements {0}/{1}").replace("{0}", String(supps.done)).replace("{1}", String(supps.total)),
            }),
            bar(supps.done / supps.total, "is-supps"),
            h("span", {
              class: "plan-meta",
              text:
                supps.done >= supps.total
                  ? t("All taken")
                  : t("{0} still to take").replace("{0}", String(supps.total - supps.done)),
            }),
          ],
        )
      : null;
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
            ? h("span", { class: "plan-meta", text: t("~{0} g protein after training").replace("{0}", String(d.training.proteinG)) })
            : null,
        ],
      ),
      suppCell,
    ]),
  ]);
}
