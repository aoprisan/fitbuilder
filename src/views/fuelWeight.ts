import { h } from "../dom";
import { loadBody } from "../health/bodyProfile";
import { addDays, avg7, r1, todayIso } from "../health/cutModel";
import { removeMeasurement, setWeighIn } from "../health/cutStore";
import { registerTranslations, t } from "../i18n";
import type { Cleanup } from "../router";
import { fill, type FuelCtx } from "./fuelCtx";
import { navelFigure, weightChart } from "./healthSvg";
import { measuresForm } from "./measures";

registerTranslations({
  "7-day average": "Media pe 7 zile",
  "Weekly rate": "Ritm săptămânal",
  "{0} kg to goal ({1} kg)": "{0} kg până la obiectiv ({1} kg)",
  "Set a goal weight under Targets.": "Setează o greutate țintă în Ținte.",
  "Weigh in to start the average.": "Cântărește-te ca să pornească media.",
  "Needs two weeks of weigh-ins.": "Necesită două săptămâni de cântăriri.",
  "Slower than target (0.5–0.8 kg/wk).": "Mai lent decât ținta (0,5–0,8 kg/săpt.).",
  "Faster than target — watch strength.": "Mai rapid decât ținta — atenție la forță.",
  "On target.": "Conform țintei.",
  "Weigh-in · fasted, morning": "Cântărire · nemâncat, dimineața",
  Date: "Dată",
  "Weigh-ins are the same log as the bodyweight in Settings — they also sharpen the protein and calorie estimates on your sessions.":
    "Cântăririle sunt același jurnal ca greutatea corporală din Setări — îmbunătățesc și estimările de proteine și calorii ale sesiunilor.",
  "The trend": "Tendința",
  "No weigh-ins yet — the line starts with the first.": "Încă nicio cântărire — linia începe cu prima.",
  "Dots — daily weigh-ins · line — 7-day average · dashes — target pace":
    "Puncte — cântăriri zilnice · linie — media pe 7 zile · liniuțe — ritmul țintă",
  " · past the planned end": " · după finalul planificat",
  "Weight trend": "Tendința greutății",
  "Waist at the navel · fortnightly": "Talia la nivelul ombilicului · la două săptămâni",
  "How to measure": "Cum se măsoară",
  navel: "ombilic",
  "Torso with a tape measure level around the waist through the navel":
    "Trunchi cu banda de măsurat orizontală în jurul taliei, prin ombilic",
  "Stand tall, feet together, belly relaxed — don't suck in.":
    "Stai drept, picioarele lipite, abdomenul relaxat — nu-l suge.",
  "Wrap the tape around bare skin, straight across the navel.":
    "Înfășoară banda pe piele, drept peste ombilic.",
  "Check in a mirror that it's level at the back too.": "Verifică în oglindă că e orizontală și la spate.",
  "Snug, not pressing in; read it at the end of a normal breath out.":
    "Strânsă, dar fără să apese; citește la finalul unei expirații normale.",
  "Same time each fortnight — morning, before eating.": "La aceeași oră o dată la două săptămâni — dimineața, înainte de masă.",
  "Waist-to-height needs your height.": "Raportul talie-înălțime necesită înălțimea ta.",
  "Latest {0} cm → waist-to-height {1} · target under 0.5 = {2} cm":
    "Ultima {0} cm → talie-înălțime {1} · țintă sub 0,5 = {2} cm",
  "Target under {0} cm (waist-to-height below 0.5).": "Țintă sub {0} cm (talie-înălțime sub 0,5).",
  "The record": "Registrul",
  "Nothing measured yet.": "Nimic măsurat încă.",
  "Remove measurements for {0}": "Șterge măsurătorile din {0}",
});

export function renderFuelWeight(host: HTMLElement, ctx: FuelCtx): Cleanup {
  const state = ctx.state;
  const s = state.settings;
  const today = todayIso();
  const a = avg7(state, today);
  const prev = avg7(state, addDays(today, -7));
  const rate = a !== null && prev !== null ? a - prev : null;
  const tone = rate === null ? "" : rate > -0.3 ? "is-slow" : rate < -1.0 ? "is-fast" : "is-on";
  const rateHint =
    rate === null
      ? t("Needs two weeks of weigh-ins.")
      : rate > -0.3
        ? t("Slower than target (0.5–0.8 kg/wk).")
        : rate < -1.0
          ? t("Faster than target — watch strength.")
          : t("On target.");

  const dateInput = (): HTMLInputElement => {
    const el = h("input", { type: "date", value: today, max: today, class: "hl-date", aria: { label: t("Date") } });
    return el;
  };
  const wDate = dateInput();
  const kg = h("input", { type: "number", inputmode: "decimal", step: "0.05", min: "20", max: "400", placeholder: "kg" });
  const saveWeight = (): void => {
    const v = Number(kg.value.replace(",", "."));
    if (!(v >= 20 && v <= 400)) return;
    setWeighIn(wDate.value || today, v);
    ctx.reload();
  };

  const stats = h("section", { class: "card hl-cut-hero" }, [
    h("div", { class: "hl-macros" }, [
      h("div", { class: "hl-macro" }, [
        h("span", { class: "field-label", text: t("7-day average") }),
        h("div", { class: "hl-macro-value", text: a !== null ? `${r1(a).toFixed(1)} kg` : "—" }),
        h("p", {
          class: "plan-meta plan-note",
          text:
            a !== null && s.goalWeight !== null
              ? fill(t("{0} kg to goal ({1} kg)"), r1(a - s.goalWeight).toFixed(1), s.goalWeight)
              : s.goalWeight === null
                ? t("Set a goal weight under Targets.")
                : t("Weigh in to start the average."),
        }),
      ]),
      h("div", { class: "hl-macro" }, [
        h("span", { class: "field-label", text: t("Weekly rate") }),
        h("div", {
          class: `hl-macro-value ${tone}`,
          text: rate !== null ? `${rate > 0 ? "+" : rate < 0 ? "−" : ""}${Math.abs(rate).toFixed(2)} kg/wk` : "—",
        }),
        h("p", { class: `plan-meta plan-note ${tone}`, text: rateHint }),
      ]),
    ]),
    h("div", { class: "hl-add" }, [
      h("label", { class: "field" }, [h("span", { class: "field-label", text: t("Weigh-in · fasted, morning") }), wDate]),
      h("label", { class: "field hl-narrow" }, [h("span", { class: "field-label", text: "kg" }), kg]),
      h("button", { class: "btn btn-small btn-primary", type: "button", text: t("Save"), on: { click: saveWeight } }),
    ]),
    h("p", {
      class: "plan-meta plan-note",
      text: t(
        "Weigh-ins are the same log as the bodyweight in Settings — they also sharpen the protein and calorie estimates on your sessions.",
      ),
    }),
  ]);

  // ── Trend chart, redrawn at the card's width ──
  const chartHost = h("div", { class: "hl-chart" });
  const end = s.startDate ? addDays(s.startDate, s.weeks * 7) : today;
  const drawChart = (): void => {
    const w = Math.round(chartHost.getBoundingClientRect().width);
    const chart = weightChart(state, today, w, t("Weight trend"));
    chartHost.replaceChildren(
      chart ?? h("p", { class: "empty", text: t("No weigh-ins yet — the line starts with the first.") }),
    );
  };
  const trend = h("section", { class: "card" }, [
    h("h2", { class: "section-title", text: t("The trend") }),
    chartHost,
    h("p", {
      class: "plan-meta plan-note",
      text: t("Dots — daily weigh-ins · line — 7-day average · dashes — target pace") + (today > end ? t(" · past the planned end") : ""),
    }),
  ]);
  const ro = new ResizeObserver(() => drawChart());
  ro.observe(chartHost);

  // ── Waist ──
  const body = loadBody();
  const height = body.heightCm;
  const waistDate = dateInput();
  const cm = h("input", { type: "number", inputmode: "decimal", step: "0.5", min: "30", max: "250", placeholder: "cm" });
  const latestWaist = Object.entries(state.waist).sort((x, y) => (x[0] < y[0] ? 1 : -1))[0];
  let wthLine: HTMLElement;
  if (height === null) {
    wthLine = h("div", {}, [
      h("p", { class: "plan-meta plan-note", text: t("Waist-to-height needs your height.") }),
      measuresForm({ onSaved: () => ctx.reload() }).el,
    ]);
  } else if (latestWaist) {
    const ratio = latestWaist[1] / height;
    wthLine = h("p", {
      class: `plan-meta plan-note ${ratio < 0.5 ? "is-on" : "is-slow"}`,
      text: fill(t("Latest {0} cm → waist-to-height {1} · target under 0.5 = {2} cm"), latestWaist[1], ratio.toFixed(3), Math.round(height / 2)),
    });
  } else {
    wthLine = h("p", { class: "plan-meta plan-note", text: fill(t("Target under {0} cm (waist-to-height below 0.5)."), Math.round(height / 2)) });
  }
  const waist = h("section", { class: "card" }, [
    h("h2", { class: "section-title", text: t("Waist at the navel · fortnightly") }),
    h("details", { class: "hl-details" }, [
      h("summary", { text: t("How to measure") }),
      h("div", { class: "hl-navel-wrap" }, [
        navelFigure(t("Torso with a tape measure level around the waist through the navel"), t("navel")),
        h(
          "ol",
          { class: "hl-steps" },
          [
            "Stand tall, feet together, belly relaxed — don't suck in.",
            "Wrap the tape around bare skin, straight across the navel.",
            "Check in a mirror that it's level at the back too.",
            "Snug, not pressing in; read it at the end of a normal breath out.",
            "Same time each fortnight — morning, before eating.",
          ].map((x) => h("li", { text: t(x) })),
        ),
      ]),
    ]),
    h("div", { class: "hl-add" }, [
      h("label", { class: "field" }, [h("span", { class: "field-label", text: t("Date") }), waistDate]),
      h("label", { class: "field hl-narrow" }, [h("span", { class: "field-label", text: "cm" }), cm]),
      h("button", {
        class: "btn btn-small btn-primary",
        type: "button",
        text: t("Save"),
        on: {
          click: () => {
            const v = Number(cm.value.replace(",", "."));
            if (!(v >= 30 && v <= 250)) return;
            const day = waistDate.value || today;
            ctx.update((st) => ({ ...st, waist: { ...st.waist, [day]: v } }));
          },
        },
      }),
    ]),
    wthLine,
  ]);

  // ── The record ──
  const dates = [...new Set([...Object.keys(state.weights), ...Object.keys(state.waist)])].sort().reverse();
  const record = h("section", { class: "card" }, [
    h("h2", { class: "section-title", text: t("The record") }),
    dates.length === 0
      ? h("p", { class: "empty", text: t("Nothing measured yet.") })
      : h(
          "ul",
          { class: "hl-list" },
          dates.slice(0, 120).map((d) =>
            h("li", { class: "hl-row hl-record" }, [
              h("span", { class: "hl-row-time", text: d }),
              h("span", { class: "hl-row-amount", text: state.weights[d] !== undefined ? `${state.weights[d]} kg` : "" }),
              h("span", { class: "hl-row-soft", text: state.waist[d] !== undefined ? `${state.waist[d]} cm` : "" }),
              h("button", {
                class: "icon-btn",
                type: "button",
                text: "✕",
                aria: { label: fill(t("Remove measurements for {0}"), d) },
                on: {
                  click: () => {
                    removeMeasurement(d);
                    ctx.reload();
                  },
                },
              }),
            ]),
          ),
        ),
  ]);

  host.append(stats, trend, waist, record);
  return () => ro.disconnect();
}
