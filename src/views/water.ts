import { todayKey } from "../bodyweightStore";
import { append, clear, h } from "../dom";
import { loadBody } from "../health/bodyProfile";
import { trainingOn } from "../health/crossData";
import { DRINK_ORDER, DRINKS, QUICK_SIZES_ML, type DrinkEntry, type DrinkKind } from "../health/drinks";
import {
  alcoholGramsOf,
  BAC_CLEAR_G_PER_L,
  bacAt,
  bacCurve,
  CAFFEINE_CLEAR_MG,
  caffeineAt,
  caffeineClearAt,
  caffeineCurve,
  caffeineMgOf,
  gramsPerLitreToPercent,
  HOUR_MS,
  LOOKBACK_MS,
  soberAt,
  unabsorbedAlcoholG,
  unabsorbedCaffeineMg,
  widmarkR,
} from "../health/metabolism";
import { addDrink, loadWater, removeDrink, setWaterGoal, waterDay, waterDays } from "../health/waterStore";
import { dateLocale, registerTranslations, t } from "../i18n";
import type { Cleanup, Nav } from "../router";
import { decayCurve, glassProgress, glasswareIcon, hydrationMeter } from "./healthSvg";
import { measuresForm } from "./measures";
import { showUndo } from "./snackbar";

registerTranslations({
  Water: "Apă",
  Hydration: "Hidratare",
  "Today's hydration": "Hidratarea de azi",
  Volume: "Volum",
  Effective: "Efectiv",
  "{0} of {1} ml goal": "{0} din obiectivul de {1} ml",
  "Goal kept.": "Obiectiv atins.",
  "Raw volume {0} ml · {1}%": "Volum brut {0} ml · {1}%",
  "Includes +{0} ml for today's training.": "Include +{0} ml pentru antrenamentul de azi.",
  "Daily goal (ml)": "Obiectiv zilnic (ml)",
  "Set goal": "Setează obiectivul",
  "Every drink counts by how well it hydrates: water ×1.0, coffee ×0.7, beer ×0.5. The goal grows with the day's logged training.":
    "Fiecare băutură contează după cât de bine hidratează: apă ×1,0, cafea ×0,7, bere ×0,5. Obiectivul crește cu antrenamentul înregistrat în ziua respectivă.",
  "Pour a drink": "Toarnă o băutură",
  "Drink kind": "Tipul băuturii",
  "Log {0} ml of {1}": "Înregistrează {0} ml de {1}",
  "Logged {0} ml of {1}.": "S-au înregistrat {0} ml de {1}.",
  "Removed {0} ml of {1}.": "S-au șters {0} ml de {1}.",
  "Today's log": "Jurnalul de azi",
  "Nothing logged yet — pour a glass above.": "Nimic înregistrat încă — toarnă un pahar mai sus.",
  Remove: "Șterge",
  "The archive": "Arhiva",
  "The archive is empty — yesterday will appear here.": "Arhiva e goală — ziua de ieri va apărea aici.",
  "{0} ml hydration": "{0} ml hidratare",
  "{0} ml volume": "{0} ml volum",
  "goal kept": "obiectiv atins",
  "trained": "antrenament",
  "What's still in you": "Ce mai ai în organism",
  Caffeine: "Cofeină",
  Alcohol: "Alcool",
  "None logged": "Nimic înregistrat",
  "All clear": "Liber",
  Sober: "Treaz",
  "Needs your build": "Necesită măsurile tale",
  "0 by {0}": "0 până la {0}",
  "Caffeine on board": "Cofeină în organism",
  "Alcohol on board": "Alcool în organism",
  "As of {0}": "La ora {0}",
  "No tea or coffee logged in the last day and a half.":
    "Niciun ceai sau cafea înregistrate în ultima zi și jumătate.",
  "{0} mg still coming up — caffeine takes about 45 min to land.":
    "Încă {0} mg în absorbție — cofeina are nevoie de circa 45 min.",
  "Under {0} mg — less than a bar of dark chocolate, nothing you would feel.":
    "Sub {0} mg — mai puțin decât o tabletă de ciocolată neagră, nimic resimțit.",
  "Half-life 5 h · {0} mg left in 5 h": "Timp de înjumătățire 5 h · {0} mg rămași peste 5 h",
  "Under {0} mg": "Sub {0} mg",
  "Already clear": "Deja liber",
  "{0} · in {1}": "{0} · în {1}",
  "Blood alcohol needs your height and weight — add them and this fills in.":
    "Alcoolemia necesită înălțimea și greutatea ta — adaugă-le și se completează.",
  "Nothing alcoholic logged in the last day and a half.":
    "Nimic alcoolic înregistrat în ultima zi și jumătate.",
  "{0} g of alcohol still being absorbed — this is still climbing.":
    "Încă {0} g de alcool în absorbție — valoarea încă urcă.",
  "Back to zero — nothing left to burn off.": "Înapoi la zero — nu mai e nimic de eliminat.",
  "≈{0} % BAC · burning 0.15 g/L per hour": "≈{0} % alcoolemie · se elimină 0,15 g/L pe oră",
  "Estimated 0": "Estimat 0",
  "Already sober": "Deja treaz",
  Detail: "Detalii",
  Hide: "Ascunde",
  "Caffeine remaining over time": "Cofeina rămasă în timp",
  "Blood alcohol over time": "Alcoolemia în timp",
  "Rough arithmetic — Widmark for alcohol, a five-hour half-life for caffeine, counted clear once under {0} mg. Real metabolism varies with food, sleep, medication and liver. Never a fitness-to-drive test.":
    "Calcule aproximative — Widmark pentru alcool, timp de înjumătățire de cinci ore pentru cofeină, considerată eliminată sub {0} mg. Metabolismul real variază cu mâncarea, somnul, medicamentele și ficatul. Niciodată un test de aptitudine pentru condus.",
  "tomorrow {0}": "mâine {0}",
  "in {0} days, {1}": "peste {0} zile, {1}",
  now: "acum",
  "Today's volume glass": "Paharul de volum de azi",
  "Effective hydration meter": "Indicatorul hidratării efective",
  "NA beer": "Bere fără alcool",
  "Light beer": "Bere light",
  Beer: "Bere",
  "Strong beer": "Bere tare",
  Tea: "Ceai",
  Coffee: "Cafea",
});

const fmt = (n: number): string => Math.round(n).toLocaleString(dateLocale());

function clockOf(ts: number): string {
  return new Date(ts).toLocaleTimeString(dateLocale(), { hour: "2-digit", minute: "2-digit", hour12: false });
}

function dayOffset(ts: number, now: number): number {
  const a = new Date(now);
  const b = new Date(ts);
  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function whenOf(ts: number, now: number): string {
  const days = dayOffset(ts, now);
  const clock = clockOf(ts);
  if (days <= 0) return clock;
  if (days === 1) return t("tomorrow {0}").replace("{0}", clock);
  return t("in {0} days, {1}").replace("{0}", String(days)).replace("{1}", clock);
}

function durationOf(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60_000));
  if (mins < 1) return t("now");
  if (mins < 60) return `${mins}m`;
  const hh = Math.floor(mins / 60);
  const mm = mins % 60;
  return mm === 0 ? `${hh}h` : `${hh}h ${mm}m`;
}

/** The curve's window: from the first dose still mattering, to when it clears (≤ 26 h ahead). */
function windowFor(firstTs: number | null, clearAt: number | null, now: number): { from: number; to: number } {
  const from = Math.min(firstTs ?? now - 2 * HOUR_MS, now - 30 * 60_000);
  const to = Math.min(Math.max(clearAt ?? now + 2 * HOUR_MS, now + 30 * 60_000), now + 26 * HOUR_MS);
  return { from, to };
}

function drinkLabel(kind: DrinkKind): string {
  return t(DRINKS[kind].label);
}

function entryRow(e: DrinkEntry, onRemove?: () => void): HTMLElement {
  const meta = DRINKS[e.kind];
  const kind = h("span", { class: "hl-entry-kind", text: drinkLabel(e.kind) });
  kind.style.color = `var(${meta.accentVar})`;
  return h("li", { class: "hl-row" }, [
    h("span", { class: "hl-row-time", text: clockOf(e.ts) }),
    h("span", { class: "hl-row-main" }, [
      kind,
      h("span", { class: "hl-row-amount", text: `${e.amountMl} ml` }),
      h("span", { class: "hl-row-soft", text: `×${meta.factor.toFixed(1)}` }),
    ]),
    onRemove
      ? h("button", { class: "icon-btn", type: "button", text: t("Remove"), on: { click: onRemove } })
      : h("span"),
  ]);
}

/**
 * Water — the hydration journal. Drinks count by how well they hydrate, the
 * goal grows with the day's logged training (crossData), and the "still in
 * you" panel reads caffeine and blood alcohol off the same log using the
 * shared body measures.
 */
export function mountWater(root: HTMLElement, _nav: Nav): Cleanup {
  void _nav;
  const container = h("div", { class: "view view-water" });
  root.appendChild(container);

  let kind: DrinkKind = "water";
  let loadOpen = false;
  const hero = h("section", { class: "card hl-hero" });
  const loadHost = h("section", { class: "card" });
  const pourHost = h("section", { class: "card" });
  const todayHost = h("section", { class: "card" });
  const archiveHost = h("section", { class: "card" });
  container.append(hero, loadHost, pourHost, todayHost, archiveHost);

  function paintHero(): void {
    const water = loadWater();
    const day = waterDay(water.entries);
    const training = trainingOn();
    const goal = water.dailyGoalMl + training.hydrationMl;
    const pct = goal > 0 ? Math.round((day.hydrationMl / goal) * 100) : 0;
    const volPct = goal > 0 ? Math.round((day.totalMl / goal) * 100) : 0;
    const reached = day.hydrationMl >= goal;

    const goalInput = h("input", {
      type: "number",
      inputmode: "numeric",
      min: "1",
      step: "50",
      value: String(water.dailyGoalMl),
      aria: { label: t("Daily goal (ml)") },
    });
    clear(hero);
    hero.append(
      h("p", { class: "eyebrow", text: t("Today's hydration") }),
      h("div", { class: "hl-hero-grid" }, [
        h("figure", { class: "hl-figure" }, [
          glassProgress(day.totalMl / Math.max(1, goal), t("Today's volume glass")),
          h("figcaption", { class: "plan-meta", text: `${t("Volume")} · ${fmt(day.totalMl)} ml` }),
        ]),
        h("figure", { class: "hl-figure" }, [
          hydrationMeter(day.hydrationMl / Math.max(1, goal), t("Effective hydration meter")),
          h("figcaption", { class: "plan-meta", text: `${t("Effective")} · ${fmt(day.hydrationMl)} ml` }),
        ]),
        h("div", { class: "hl-readout" }, [
          h("div", { class: `hl-big${reached ? " is-hit" : ""}`, text: `${pct}%` }),
          h("p", {
            class: "plan-meta",
            text: t("{0} of {1} ml goal").replace("{0}", fmt(day.hydrationMl)).replace("{1}", fmt(goal)),
          }),
          reached ? h("p", { class: "plan-meta hl-hit", text: t("Goal kept.") }) : null,
          h("p", {
            class: "plan-meta",
            text: t("Raw volume {0} ml · {1}%").replace("{0}", fmt(day.totalMl)).replace("{1}", String(volPct)),
          }),
          training.hydrationMl > 0
            ? h("p", {
                class: "plan-meta plan-note hl-link-note",
                text: t("Includes +{0} ml for today's training.").replace("{0}", fmt(training.hydrationMl)),
              })
            : null,
        ]),
      ]),
      h("details", { class: "hl-details" }, [
        h("summary", { text: t("Daily goal (ml)") }),
        h("p", {
          class: "plan-meta plan-note",
          text: t(
            "Every drink counts by how well it hydrates: water ×1.0, coffee ×0.7, beer ×0.5. The goal grows with the day's logged training.",
          ),
        }),
        h("div", { class: "hl-inline" }, [
          goalInput,
          h("button", {
            class: "btn btn-small",
            type: "button",
            text: t("Set goal"),
            on: {
              click: () => {
                const n = Number(goalInput.value);
                if (!Number.isFinite(n) || n <= 0) return;
                setWaterGoal(n);
                paintHero();
              },
            },
          }),
        ]),
      ]),
    );
  }

  function paintLoad(): void {
    const entries = loadWater().entries;
    const body = loadBody();
    // A drink can be logged between clock ticks; never let the clock lag behind it.
    const now = entries.reduce((m, e) => Math.max(m, e.ts), Date.now());

    const dosed = entries.filter((e) => caffeineMgOf(e) > 0 && e.ts >= now - LOOKBACK_MS);
    const mgNow = caffeineAt(dosed, now);
    const cClear = caffeineClearAt(dosed, now);
    const cPending = unabsorbedCaffeineMg(dosed, now);
    const cFirst = dosed.length ? Math.min(...dosed.map((e) => e.ts)) : null;
    const cWin = windowFor(cFirst, cClear, now);
    const caffeineIsClear = mgNow < CAFFEINE_CLEAR_MG && cPending < 1;

    const drinks = entries.filter((e) => alcoholGramsOf(e) > 0 && e.ts >= now - LOOKBACK_MS);
    const bacNow = bacAt(entries, now, body);
    const sober = soberAt(entries, now, body);
    const aPending = unabsorbedAlcoholG(entries, now);
    const aFirst = drinks.length ? Math.min(...drinks.map((e) => e.ts)) : null;
    const aWin = windowFor(aFirst, sober, now);
    const bacIsClear = bacNow !== null && bacNow <= BAC_CLEAR_G_PER_L && aPending < 1;
    const r = widmarkR(body);

    const caffeineBrief = !dosed.length
      ? t("None logged")
      : caffeineIsClear
        ? t("All clear")
        : `${Math.round(mgNow)} mg${cClear === null ? "" : ` · ${t("0 by {0}").replace("{0}", whenOf(cClear, now))}`}`;
    const alcoholBrief =
      bacNow === null
        ? t("Needs your build")
        : !drinks.length
          ? t("None logged")
          : bacIsClear
            ? t("Sober")
            : `${bacNow.toFixed(2)} g/L${sober === null ? "" : ` · ${t("0 by {0}").replace("{0}", whenOf(sober, now))}`}`;

    const chip = (key: string, value: string, ok: boolean): HTMLElement =>
      h("span", { class: "hl-chip" }, [
        h("span", { class: "hl-chip-key", text: key }),
        h("span", { class: `hl-chip-val${ok ? " is-clear" : ""}`, text: value }),
      ]);

    const toggle = h(
      "button",
      {
        class: "hl-load-toggle",
        type: "button",
        aria: { expanded: String(loadOpen) },
        on: {
          click: () => {
            loadOpen = !loadOpen;
            paintLoad();
          },
        },
      },
      [
        h("span", { class: "hl-chips" }, [
          chip(t("Caffeine"), caffeineBrief, caffeineIsClear),
          chip(t("Alcohol"), alcoholBrief, bacIsClear),
        ]),
        h("span", { class: "hl-load-hint", text: `${loadOpen ? t("Hide") : t("Detail")} ${loadOpen ? "−" : "+"}` }),
      ],
    );

    const card = (
      title: string,
      accentVar: string,
      value: string,
      clearState: boolean,
      sub: string,
      curve: SVGElement | null,
      footKey: string,
      footVal: string,
      extra: HTMLElement | null = null,
    ): HTMLElement => {
      const el = h("article", { class: "hl-load-card" }, [
        h("header", { class: "hl-load-head" }, [
          h("span", { class: "field-label", text: title }),
          h("span", { class: "plan-meta", text: t("As of {0}").replace("{0}", clockOf(now)) }),
        ]),
        h("div", { class: `hl-load-value${clearState ? " is-clear" : ""}`, text: value }),
        h("p", { class: "plan-meta plan-note", text: sub }),
        extra,
        curve ?? h("div", { class: "hl-curve-empty" }),
        h("footer", { class: "hl-load-foot" }, [
          h("span", { text: footKey }),
          h("strong", { text: footVal }),
        ]),
      ]);
      el.style.setProperty("--hl-accent", `var(${accentVar})`);
      return el;
    };

    const caffeineCard = card(
      t("Caffeine on board"),
      "--drink-coffee",
      `${mgNow < 10 ? mgNow.toFixed(1) : Math.round(mgNow)} mg`,
      caffeineIsClear,
      !dosed.length
        ? t("No tea or coffee logged in the last day and a half.")
        : cPending >= 1
          ? t("{0} mg still coming up — caffeine takes about 45 min to land.").replace("{0}", String(Math.round(cPending)))
          : caffeineIsClear
            ? t("Under {0} mg — less than a bar of dark chocolate, nothing you would feel.").replace("{0}", String(CAFFEINE_CLEAR_MG))
            : t("Half-life 5 h · {0} mg left in 5 h").replace("{0}", String(Math.round(mgNow / 2))),
      dosed.length ? decayCurve(caffeineCurve(dosed, cWin.from, cWin.to), now, cClear, "--drink-coffee", t("Caffeine remaining over time")) : null,
      t("Under {0} mg").replace("{0}", String(CAFFEINE_CLEAR_MG)),
      !dosed.length || cClear === null
        ? "—"
        : caffeineIsClear
          ? t("Already clear")
          : t("{0} · in {1}").replace("{0}", whenOf(cClear, now)).replace("{1}", durationOf(cClear - now)),
    );

    let alcoholCard: HTMLElement;
    if (bacNow === null) {
      alcoholCard = card(
        t("Alcohol on board"),
        "--drink-beer",
        "—",
        false,
        t("Blood alcohol needs your height and weight — add them and this fills in."),
        null,
        t("Estimated 0"),
        "—",
        measuresForm({ onSaved: paintLoad }).el,
      );
    } else {
      const curve = drinks.length ? bacCurve(entries, aWin.from, aWin.to, body) : null;
      alcoholCard = card(
        t("Alcohol on board"),
        "--drink-beer",
        `${bacNow.toFixed(2)} g/L`,
        bacIsClear,
        !drinks.length
          ? t("Nothing alcoholic logged in the last day and a half.")
          : aPending >= 1
            ? t("{0} g of alcohol still being absorbed — this is still climbing.").replace("{0}", String(Math.round(aPending)))
            : bacIsClear
              ? t("Back to zero — nothing left to burn off.")
              : t("≈{0} % BAC · burning 0.15 g/L per hour").replace("{0}", gramsPerLitreToPercent(bacNow).toFixed(3)),
        curve ? decayCurve(curve, now, sober, "--drink-beer", t("Blood alcohol over time")) : null,
        t("Estimated 0"),
        !drinks.length || sober === null
          ? "—"
          : bacIsClear
            ? t("Already sober")
            : t("{0} · in {1}").replace("{0}", whenOf(sober, now)).replace("{1}", durationOf(sober - now)),
      );
    }

    clear(loadHost);
    append(loadHost, [
      h("h2", { class: "section-title", text: t("What's still in you") }),
      toggle,
      loadOpen
        ? h("div", { class: "hl-load-detail" }, [
            h("div", { class: "hl-load-cards" }, [caffeineCard, alcoholCard]),
            h("p", {
              class: "plan-meta plan-note",
              text:
                t(
                  "Rough arithmetic — Widmark for alcohol, a five-hour half-life for caffeine, counted clear once under {0} mg. Real metabolism varies with food, sleep, medication and liver. Never a fitness-to-drive test.",
                ).replace("{0}", String(CAFFEINE_CLEAR_MG)) + (r ? ` (r ≈ ${r.toFixed(2)})` : ""),
            }),
          ])
        : null,
    ]);
  }

  function paintPour(): void {
    const meta = DRINKS[kind];
    const tabs = h(
      "div",
      { class: "toggle hl-drink-tabs", role: "tablist", aria: { label: t("Drink kind") } },
      DRINK_ORDER.map((k) => {
        const m = DRINKS[k];
        const btn = h("button", {
          class: `toggle-btn${k === kind ? " active" : ""}`,
          type: "button",
          role: "tab",
          aria: { selected: String(k === kind) },
          on: {
            click: () => {
              kind = k;
              paintPour();
            },
          },
        }, [
          h("span", { class: "hl-tab-label", text: drinkLabel(k) }),
          h("span", { class: "hl-tab-factor", text: `×${m.factor.toFixed(1)}${m.note ? ` · ${m.note}` : ""}` }),
        ]);
        btn.style.setProperty("--hl-accent", `var(${m.accentVar})`);
        return btn;
      }),
    );
    const sizes = h(
      "div",
      { class: "hl-quick" },
      QUICK_SIZES_ML.map((ml) =>
        h(
          "button",
          {
            class: "hl-quick-btn",
            type: "button",
            aria: { label: t("Log {0} ml of {1}").replace("{0}", String(ml)).replace("{1}", drinkLabel(kind)) },
            on: { click: () => pour(ml) },
          },
          [glasswareIcon(ml), h("span", { class: "hl-quick-amount", text: ml >= 1000 ? `${ml / 1000} L` : `${ml} ml` })],
        ),
      ),
    );
    sizes.style.setProperty("--hl-accent", `var(${meta.accentVar})`);
    clear(pourHost);
    pourHost.append(h("h2", { class: "section-title", text: t("Pour a drink") }), tabs, sizes);
  }

  function pour(ml: number): void {
    const entry = addDrink(ml, kind);
    if (!entry) return;
    paintAll();
    showUndo(
      t("Logged {0} ml of {1}.").replace("{0}", String(ml)).replace("{1}", drinkLabel(kind)),
      () => {
        removeDrink(entry.id);
        paintAll();
      },
    );
  }

  function paintToday(): void {
    const day = waterDay(loadWater().entries);
    clear(todayHost);
    todayHost.append(h("h2", { class: "section-title", text: t("Today's log") }));
    if (!day.entries.length) {
      todayHost.append(h("p", { class: "empty", text: t("Nothing logged yet — pour a glass above.") }));
      return;
    }
    todayHost.append(
      h(
        "ul",
        { class: "hl-list" },
        day.entries.map((e) =>
          entryRow(e, () => {
            removeDrink(e.id);
            paintAll();
            showUndo(
              t("Removed {0} ml of {1}.").replace("{0}", String(e.amountMl)).replace("{1}", drinkLabel(e.kind)),
              () => {
                addDrink(e.amountMl, e.kind, e.ts);
                paintAll();
              },
            );
          }),
        ),
      ),
    );
  }

  function paintArchive(): void {
    const water = loadWater();
    const today = todayKey();
    const days = waterDays(water.entries).filter((d) => d.date !== today);
    clear(archiveHost);
    archiveHost.append(h("h2", { class: "section-title", text: t("The archive") }));
    if (!days.length) {
      archiveHost.append(h("p", { class: "empty", text: t("The archive is empty — yesterday will appear here.") }));
      return;
    }
    for (const d of days.slice(0, 60)) {
      const training = trainingOn(d.date);
      const goal = water.dailyGoalMl + training.hydrationMl;
      const kept = d.hydrationMl >= goal;
      const label = new Date(`${d.date}T12:00:00`).toLocaleDateString(dateLocale(), {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
      archiveHost.append(
        h("details", { class: "hl-day" }, [
          h("summary", {}, [
            h("span", { class: "hl-day-label", text: label }),
            h("span", { class: `hl-day-total${kept ? " is-hit" : ""}` }, [
              h("span", {
                text:
                  t("{0} ml hydration").replace("{0}", fmt(d.hydrationMl)) +
                  (kept ? ` · ${t("goal kept")}` : "") +
                  (training.sessions.length ? ` · ${t("trained")}` : ""),
              }),
              h("span", { class: "hl-row-soft", text: t("{0} ml volume").replace("{0}", fmt(d.totalMl)) }),
            ]),
          ]),
          h("ul", { class: "hl-list" }, d.entries.map((e) => entryRow(e))),
        ]),
      );
    }
  }

  function paintAll(): void {
    paintHero();
    paintLoad();
    paintPour();
    paintToday();
    paintArchive();
  }

  paintAll();
  // Caffeine and alcohol move with the clock; keep the panel live while open.
  const tick = window.setInterval(() => {
    // Skip while the user is typing in the panel (the measures form lives there).
    if (!document.hidden && !loadHost.contains(document.activeElement)) paintLoad();
  }, 30_000);
  return () => window.clearInterval(tick);
}
