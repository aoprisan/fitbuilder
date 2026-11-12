import { h } from "../dom";
import { todayIso } from "../health/cutModel";
import { loggedFoodDays, macroSeries, meanOf, weeklyKcal } from "../health/history";
import { dateLocale, registerTranslations, t } from "../i18n";
import type { Cleanup } from "../router";
import { shareFuelHistory } from "../exporters";
import { fill, type FuelCtx } from "./fuelCtx";
import { shareRow } from "./shareButtons";
import { dayLines, legend, rangeChips, responsiveChart, weekBars } from "./historyCharts";

registerTranslations({
  "Calories per day": "Calorii pe zi",
  "Macros per day": "Macronutrienți pe zi",
  "Calories per week": "Calorii pe săptămână",
  "Day by day": "Zi cu zi",
  "Avg {0} kcal/day over {1} logged days · target {2}":
    "Medie {0} kcal/zi în {1} zile înregistrate · țintă {2}",
  "Avg protein {0} g · carbs {1} g · fat {2} g": "Medie proteine {0} g · carbohidrați {1} g · grăsimi {2} g",
  "Nothing logged in this range.": "Nimic înregistrat în acest interval.",
  "No food logged yet — the history starts with the first plate.":
    "Niciun aliment înregistrat încă — istoricul începe cu prima farfurie.",
  "Line — kcal eaten · dashes — daily target · gaps — days not logged":
    "Linie — kcal mâncate · liniuțe — ținta zilnică · goluri — zile neînregistrate",
  "Dashes — protein target": "Liniuțe — ținta de proteine",
  "Bars — kcal eaten that week · ticks — the target for the days logged (red bar = over)":
    "Bare — kcal mâncate în săptămână · repere — ținta pentru zilele înregistrate (bară roșie = peste)",
  "This week {0} kcal over {1} days · budget {2}": "Săptămâna aceasta {0} kcal în {1} zile · buget {2}",
  "Open {0} in Today": "Deschide {0} în Azi",
  "{0} kcal target": "țintă {0} kcal",
  "{0} g protein": "{0} g proteine",
});

const RANGES = [14, 30, 90] as const;
type Range = (typeof RANGES)[number];
const WEEKS: Record<Range, number> = { 14: 8, 30: 12, 90: 26 };

// Survives repaints and remounts while the app is open.
let range: Range = 30;

const n0 = (x: number): string => Math.round(x).toLocaleString(dateLocale());

/** Fuel → History: calories and macros per day, calories per week, and every logged day. */
export function renderFuelHistory(host: HTMLElement, ctx: FuelCtx): Cleanup {
  const state = ctx.state;
  const s = state.settings;
  const today = todayIso();
  const days = loggedFoodDays(state);
  const disposers: Array<() => void> = [];

  if (days.length === 0) {
    host.append(
      h("section", { class: "card" }, [
        h("h2", { class: "section-title", text: t("Calories per day") }),
        h("p", { class: "empty", text: t("No food logged yet — the history starts with the first plate.") }),
      ]),
    );
    return () => undefined;
  }

  const series = macroSeries(state, today, range);
  const dates = series.map((d) => d.date);
  const kcal = series.map((d) => (d.value ? Math.round(d.value.kcal) : null));
  const prot = series.map((d) => (d.value ? Math.round(d.value.p) : null));
  const carb = series.map((d) => (d.value ? Math.round(d.value.c) : null));
  const fat = series.map((d) => (d.value ? Math.round(d.value.f) : null));
  const loggedN = kcal.filter((v) => v !== null).length;
  const avgK = meanOf(kcal);

  const chips = h("section", { class: "card hl-range-card" }, [
    rangeChips(range, RANGES, (r) => {
      range = r as Range;
      ctx.reload();
    }),
    shareRow((format) => shareFuelHistory(range, format)),
  ]);

  // ── Calories per day ──
  const kChart = responsiveChart(
    (w) =>
      dayLines(
        {
          dates,
          series: [{ values: kcal, cls: "hl-hist-kcal" }],
          target: { value: s.kcal, label: fill(t("{0} kcal target"), n0(s.kcal)) },
          label: t("Calories per day"),
        },
        w,
      ),
    t("Nothing logged in this range."),
  );
  disposers.push(kChart.dispose);
  const kCard = h("section", { class: "card" }, [
    h("h2", { class: "section-title", text: t("Calories per day") }),
    avgK !== null
      ? h("p", { class: "plan-meta plan-note", text: fill(t("Avg {0} kcal/day over {1} logged days · target {2}"), n0(avgK), loggedN, n0(s.kcal)) })
      : null,
    kChart.el,
    h("p", { class: "plan-meta plan-note", text: t("Line — kcal eaten · dashes — daily target · gaps — days not logged") }),
  ]);

  // ── Macros per day ──
  const mChart = responsiveChart(
    (w) =>
      dayLines(
        {
          dates,
          series: [
            { values: prot, cls: "hl-hist-p" },
            { values: carb, cls: "hl-hist-c" },
            { values: fat, cls: "hl-hist-f" },
          ],
          target: { value: s.protein, label: fill(t("{0} g protein"), n0(s.protein)) },
          label: t("Macros per day"),
        },
        w,
      ),
    t("Nothing logged in this range."),
  );
  disposers.push(mChart.dispose);
  const [ap, ac, af] = [meanOf(prot), meanOf(carb), meanOf(fat)];
  const mCard = h("section", { class: "card" }, [
    h("h2", { class: "section-title", text: t("Macros per day") }),
    ap !== null
      ? h("p", { class: "plan-meta plan-note", text: fill(t("Avg protein {0} g · carbs {1} g · fat {2} g"), n0(ap), n0(ac ?? 0), n0(af ?? 0)) })
      : null,
    legend([
      { cls: "hl-hist-p", label: t("Protein") },
      { cls: "hl-hist-c", label: t("Carbs") },
      { cls: "hl-hist-f", label: t("Fat") },
    ]),
    mChart.el,
    h("p", { class: "plan-meta plan-note", text: t("Dashes — protein target") }),
  ]);

  // ── Calories per week ──
  const weeks = weeklyKcal(state, today, WEEKS[range]);
  const wChart = responsiveChart(
    (w) =>
      weekBars(
        weeks.map((wk) => ({ start: wk.start, value: wk.kcal, budget: wk.loggedDays ? s.kcal * wk.loggedDays : null })),
        w,
        t("Calories per week"),
      ),
    t("Nothing logged in this range."),
  );
  disposers.push(wChart.dispose);
  const thisWeek = weeks[weeks.length - 1];
  const wCard = h("section", { class: "card" }, [
    h("h2", { class: "section-title", text: t("Calories per week") }),
    thisWeek && thisWeek.loggedDays
      ? h("p", {
          class: "plan-meta plan-note",
          text: fill(t("This week {0} kcal over {1} days · budget {2}"), n0(thisWeek.kcal), thisWeek.loggedDays, n0(s.kcal * thisWeek.loggedDays)),
        })
      : null,
    wChart.el,
    h("p", {
      class: "plan-meta plan-note",
      text: t("Bars — kcal eaten that week · ticks — the target for the days logged (red bar = over)"),
    }),
  ]);

  // ── Day by day ──
  const list = h("section", { class: "card" }, [
    h("h2", { class: "section-title", text: t("Day by day") }),
    h(
      "ul",
      { class: "hl-list" },
      days.slice(0, 120).map(({ date, totals }) => {
        const label = new Date(`${date}T12:00:00`).toLocaleDateString(dateLocale(), {
          weekday: "short",
          day: "numeric",
          month: "short",
        });
        const over = totals.kcal > s.kcal * 1.03;
        return h("li", {}, [
          h(
            "button",
            {
              class: "hl-row hl-hist-row",
              type: "button",
              aria: { label: fill(t("Open {0} in Today"), label) },
              on: { click: () => ctx.openDay(date) },
            },
            [
              h("span", { class: "hl-row-time", text: label }),
              h("span", { class: `hl-row-amount${over ? " is-fast" : ""}`, text: `${n0(totals.kcal)} kcal` }),
              h("span", {
                class: "hl-row-soft",
                text: `P ${n0(totals.p)} · C ${n0(totals.c)} · F ${n0(totals.f)} g`,
              }),
            ],
          ),
        ]);
      }),
    ),
  ]);

  host.append(chips, kCard, mCard, wCard, list);
  return () => disposers.forEach((d) => d());
}
