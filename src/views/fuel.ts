import { clear, h } from "../dom";
import { cutWeek, type CutState } from "../health/cutModel";
import { loadCut, updateCut } from "../health/cutStore";
import { peekSharedReply } from "../health/cutClaude";
import { registerTranslations, t } from "../i18n";
import type { Cleanup, Nav } from "../router";
import { fill, type FuelCtx } from "./fuelCtx";
import { renderFuelFoods } from "./fuelFoods";
import { renderFuelTerms } from "./fuelTerms";
import { renderFuelToday, resetFuelDay } from "./fuelToday";
import { renderFuelWeight } from "./fuelWeight";

registerTranslations({
  Fuel: "Nutriție",
  "The cut": "Definirea",
  "Week {0} of {1}": "Săptămâna {0} din {1}",
  "Starts {0}": "Începe pe {0}",
  "Cut done · {0} wk": "Definire încheiată · {0} săpt.",
  Today: "Azi",
  Weight: "Greutate",
  Foods: "Alimente",
  Targets: "Ținte",
  "Fuel pages": "Paginile Nutriție",
});

type Tab = "today" | "weight" | "foods" | "terms";
const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: "today", label: "Today" },
  { id: "weight", label: "Weight" },
  { id: "foods", label: "Foods" },
  { id: "terms", label: "Targets" },
];

// Survives remounts (language switch, a trip to another tab and back).
let lastTab: Tab = "today";

function weekText(state: CutState): string {
  const w = cutWeek(state.settings);
  if (w.kind === "before") return fill(t("Starts {0}"), state.settings.startDate);
  if (w.kind === "done") return fill(t("Cut done · {0} wk"), state.settings.weeks);
  return fill(t("Week {0} of {1}"), w.week, state.settings.weeks);
}

/**
 * Fuel — the cut: calories and macros against a daily target, the eating
 * window, weigh-ins (the shared body-weight log) and waist, the pantry and
 * menu, and Claude estimates. Four sub-pages under one tab.
 */
export function mountFuel(root: HTMLElement, nav: Nav): Cleanup {
  const container = h("div", { class: "view view-fuel" });
  root.appendChild(container);

  // A Claude reply shared into the PWA lands on Today, where its panel opens.
  if (peekSharedReply() !== null) lastTab = "today";
  resetFuelDay();

  let state = loadCut();
  const sub = h("p", { class: "plan-meta" });
  const tabRow = h("div", { class: "toggle hl-subtabs", role: "tablist", aria: { label: t("Fuel pages") } });
  const body = h("div", { class: "hl-fuel-body" });

  const ctx: FuelCtx = {
    nav,
    get state() {
      return state;
    },
    update(fn) {
      state = updateCut(fn);
      paint();
    },
    reload() {
      state = loadCut();
      paint();
    },
  };

  function paintTabs(): void {
    clear(tabRow);
    for (const tb of TABS) {
      tabRow.append(
        h("button", {
          class: `toggle-btn${tb.id === lastTab ? " active" : ""}`,
          type: "button",
          role: "tab",
          text: t(tb.label),
          aria: { selected: String(tb.id === lastTab) },
          on: {
            click: () => {
              if (tb.id === lastTab) return;
              lastTab = tb.id;
              paint();
              window.scrollTo(0, 0);
            },
          },
        }),
      );
    }
  }

  let tabCleanup: Cleanup | null = null;
  function paint(): void {
    // Keep the scroll position across a repaint of the same tab.
    const y = window.scrollY;
    sub.textContent = weekText(state);
    paintTabs();
    tabCleanup?.();
    tabCleanup = null;
    clear(body);
    let result: Cleanup | void;
    switch (lastTab) {
      case "today":
        result = renderFuelToday(body, ctx);
        break;
      case "weight":
        result = renderFuelWeight(body, ctx);
        break;
      case "foods":
        result = renderFuelFoods(body, ctx);
        break;
      case "terms":
        result = renderFuelTerms(body, ctx);
        break;
    }
    tabCleanup = typeof result === "function" ? result : null;
    window.scrollTo(0, y);
  }

  container.append(
    h("section", { class: "card hl-fuel-head" }, [
      h("p", { class: "eyebrow", text: t("Fuel") }),
      h("h2", { class: "plan-name", text: t("The cut") }),
      sub,
      tabRow,
    ]),
    body,
  );
  paint();
  return () => tabCleanup?.();
}
