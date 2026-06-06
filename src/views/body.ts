import type { BodyScene } from "../body3d";
import {
  BODY_METRIC_LABELS,
  BODY_METRICS,
  BODY_MUSCLES,
  type BodyMetric,
  METRIC_LEGEND,
  metricColor,
  metricGradientCss,
  type MuscleScore,
  muscleScores,
} from "../bodyMap";
import { h } from "../dom";
import { registerTranslations, t } from "../i18n";
import { loadSessions } from "../logStorage";
import type { Cleanup, Nav } from "../router";
import { MUSCLE_LABELS, type MuscleGroup } from "../types";

registerTranslations({
  "Muscle map": "Hartă musculară",
  "Body map": "Hartă corporală",
  "Each muscle is shaded by the selected metric. Drag to spin the body; tap a muscle for its reading.":
    "Fiecare mușchi este colorat după valoarea selectată. Rotește corpul cu degetul; atinge un mușchi pentru detalii.",
  Metric: "Valoare",
  Strength: "Forță",
  Hypertrophy: "Hipertrofie",
  Fatigue: "Oboseală",
  Efficiency: "Eficiență",
  "Tap a muscle to see its reading.": "Atinge un mușchi pentru a vedea valoarea.",
  // — legend ends —
  Weaker: "Mai slab",
  Stronger: "Mai puternic",
  Low: "Scăzut",
  High: "Ridicat",
  Fresh: "Odihnit",
  Fatigued: "Obosit",
  Wasteful: "Ineficient",
  Efficient: "Eficient",
  // — legend descriptions —
  "Relative strength per muscle — your best estimated 1-rep max.":
    "Forța relativă pe mușchi — cea mai bună estimare 1RM.",
  "Growth stimulus from hard-set volume over the last 7 days.":
    "Stimulul de creștere din volumul de serii grele din ultimele 7 zile.",
  "How fatigued each muscle is since you last trained it.":
    "Cât de obosit este fiecare mușchi de la ultimul antrenament.",
  "Growth banked per hard set — proximity to failure × dose quality.":
    "Creșterea obținută pe serie grea — apropierea de epuizare × calitatea dozei.",
  // — per-muscle detail (non-numeric reads) —
  "Not trained this week": "Neantrenat săptămâna aceasta",
  "No loaded sets logged": "Nicio serie cu greutate înregistrată",
  "No volume this week": "Niciun volum săptămâna aceasta",
  "Fresh — not trained recently": "Odihnit — neantrenat recent",
  Recovered: "Recuperat",
  // — chrome —
  "No sessions logged yet — train a live session and your body map fills in here.":
    "Niciun antrenament înregistrat încă — fă un antrenament Live și harta corporală se va completa aici.",
  "Start Live Session": "Pornește Antrenament Live",
  "3D view unavailable — showing a list instead.":
    "Vizualizarea 3D nu este disponibilă — se afișează o listă.",
  "← Stats": "← Statistici",
  Weekly: "Săptămânal",
  Recovery: "Recuperare",
});

// The 3D stage is a touch taller than it is wide so the standing figure fits.
const STAGE_ASPECT = 1.15;

/**
 * Body Map view: a rotatable 3D figure whose muscles are colour-coded by one of
 * four toggles (Strength / Hypertrophy / Fatigue / Efficiency). The figure and
 * Three.js are lazy-loaded; if WebGL is unavailable the same colours are shown
 * as a flat per-muscle list so the data is never lost.
 */
export function mountBody(root: HTMLElement, nav: Nav): Cleanup {
  const sessions = loadSessions();
  const container = h("div", { class: "view view-body" });
  root.appendChild(container);

  const header = h("section", { class: "card" }, [
    h("p", { class: "eyebrow", text: t("Muscle map") }),
    h("h2", { class: "section-title", text: t("Body map") }),
    h("p", {
      class: "plan-meta",
      text: t("Each muscle is shaded by the selected metric. Drag to spin the body; tap a muscle for its reading."),
    }),
  ]);

  if (sessions.length === 0) {
    container.append(
      header,
      h("section", { class: "card" }, [
        h("p", {
          class: "empty",
          text: t("No sessions logged yet — train a live session and your body map fills in here."),
        }),
        h("div", { class: "btn-row" }, [
          h("button", {
            class: "btn btn-primary",
            type: "button",
            text: t("Start Live Session"),
            on: { click: () => nav.go("live") },
          }),
        ]),
      ]),
    );
    return () => {};
  }

  let metric: BodyMetric = "strength";
  let scores = new Map<MuscleGroup, MuscleScore>();
  let scene: BodyScene | null = null;
  let fallback: { el: HTMLElement; update: () => void } | null = null;
  let disposed = false;

  // — metric toggle (mirrors the segmented mode/theme toggles) —
  const metricButtons = new Map<BodyMetric, HTMLButtonElement>();
  const metricToggle = h(
    "div",
    { class: "mode-toggle bodymap-metrics", role: "group", aria: { label: t("Metric") } },
    BODY_METRICS.map((m) => {
      const btn = h("button", {
        class: "mode-toggle-btn",
        type: "button",
        text: t(BODY_METRIC_LABELS[m]),
      });
      btn.addEventListener("click", () => setMetric(m));
      metricButtons.set(m, btn);
      return btn;
    }),
  );

  const stage = h("div", { class: "bodymap-stage" });
  const readout = h("p", { class: "bodymap-readout", text: t("Tap a muscle to see its reading.") });

  // — legend: a gradient bar with low/high ends and a description —
  const legendBar = h("div", { class: "bodymap-legend-bar" });
  const legendLow = h("span", { class: "bodymap-legend-end" });
  const legendHigh = h("span", { class: "bodymap-legend-end" });
  const legendDesc = h("p", { class: "plan-meta bodymap-legend-desc" });
  const legend = h("div", { class: "bodymap-legend" }, [
    h("div", { class: "bodymap-legend-scale" }, [legendLow, legendBar, legendHigh]),
    legendDesc,
  ]);

  const stageCard = h("section", { class: "card bodymap-card" }, [
    metricToggle,
    stage,
    readout,
    legend,
  ]);

  const navCard = h("section", { class: "card" }, [
    h("div", { class: "btn-row" }, [
      h("button", { class: "btn", type: "button", text: t("← Stats"), on: { click: () => nav.go("stats") } }),
      h("button", { class: "btn", type: "button", text: t("Weekly"), on: { click: () => nav.go("weekly") } }),
      h("button", { class: "btn", type: "button", text: t("Recovery"), on: { click: () => nav.go("recovery") } }),
    ]),
  ]);

  container.append(header, stageCard, navCard);

  function highlightMetric(): void {
    for (const [m, btn] of metricButtons) {
      const active = m === metric;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    }
  }

  /** Recompute scores for the active metric and the matching colour map. */
  function colorsFor(): Map<MuscleGroup, string> {
    scores = muscleScores(metric, sessions);
    const colors = new Map<MuscleGroup, string>();
    for (const [muscle, s] of scores) colors.set(muscle, metricColor(metric, s.value));
    return colors;
  }

  function applyMetric(): void {
    highlightMetric();
    const colors = colorsFor();
    scene?.setColors(colors);
    fallback?.update();
    const lg = METRIC_LEGEND[metric];
    legendLow.textContent = t(lg.lowLabel);
    legendHigh.textContent = t(lg.highLabel);
    legendBar.style.background = metricGradientCss(metric);
    legendDesc.textContent = t(lg.desc);
    readout.textContent = t("Tap a muscle to see its reading.");
  }

  function setMetric(m: BodyMetric): void {
    if (m === metric) return;
    metric = m;
    applyMetric();
  }

  function showReadout(muscle: MuscleGroup | null): void {
    if (muscle === null) {
      readout.textContent = t("Tap a muscle to see its reading.");
      return;
    }
    const s = scores.get(muscle);
    const label = t(MUSCLE_LABELS[muscle]);
    readout.textContent = s ? `${label} — ${t(s.detail)}` : label;
  }

  /** Flat fallback: a swatch + name + reading per muscle, used when WebGL fails. */
  function buildFallback(): { el: HTMLElement; update: () => void } {
    const rows = new Map<MuscleGroup, { swatch: HTMLElement; stat: HTMLElement }>();
    const wrap = h("div", { class: "bodymap-fallback summary-muscles" });
    for (const muscle of BODY_MUSCLES) {
      const swatch = h("span", { class: "bodymap-swatch" });
      const stat = h("span", { class: "muscle-stat bodymap-fallback-stat" });
      const row = h("div", { class: "muscle-row bodymap-fallback-row" }, [
        swatch,
        h("span", { class: "muscle-name", text: t(MUSCLE_LABELS[muscle]) }),
        stat,
      ]);
      row.addEventListener("click", () => showReadout(muscle));
      rows.set(muscle, { swatch, stat });
      wrap.appendChild(row);
    }
    return {
      el: wrap,
      update: () => {
        for (const [muscle, { swatch, stat }] of rows) {
          swatch.style.background = metricColor(metric, scores.get(muscle)?.value ?? null);
          const s = scores.get(muscle);
          stat.textContent = s ? t(s.detail) : "";
        }
      },
    };
  }

  // — lazy-load Three.js and build the figure; fall back to a list on failure —
  const ro = new ResizeObserver(() => {
    if (!scene) return;
    const w = stage.clientWidth || 320;
    scene.resize(w, Math.round(w * STAGE_ASPECT));
  });

  void (async () => {
    try {
      const { createBodyScene } = await import("../body3d");
      if (disposed) return;
      const w = stage.clientWidth || 320;
      scene = createBodyScene(w);
      scene.el.classList.add("bodymap-canvas");
      stage.appendChild(scene.el);
      scene.onPick(showReadout);
      scene.resize(w, Math.round(w * STAGE_ASPECT));
      ro.observe(stage);
      applyMetric();
    } catch {
      if (disposed) return;
      stage.classList.add("is-fallback");
      fallback = buildFallback();
      stage.append(
        h("p", { class: "plan-meta", text: t("3D view unavailable — showing a list instead.") }),
        fallback.el,
      );
      applyMetric();
    }
  })();

  // Paint the legend (and scores) immediately, before the scene finishes loading.
  applyMetric();

  return () => {
    disposed = true;
    ro.disconnect();
    scene?.dispose();
    scene = null;
  };
}
