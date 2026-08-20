import type { BodyScene } from "../body3d";
import {
  BODY_METRIC_LABELS,
  BODY_METRICS,
  type BodyMetric,
  METRIC_LEGEND,
  metricColor,
  metricGradientCss,
  type MuscleScore,
  muscleScores,
} from "../bodyMap";
import { h } from "../dom";
import { readEffort } from "../effort";
import {
  canShareFiles,
  exportBodyMapPdf,
  exportBodyMapPng,
  shareBodyMap,
} from "../exporters";
import { registerTranslations, t } from "../i18n";
import { newTrainingSession } from "../log";
import { clearProgress, loadProgress } from "../liveProgress";
import { getSession, loadSessions, saveSession } from "../logStorage";
import { muscleRecovery, overallStatus, recoveryColor, systemicRecovery } from "../recovery";
import type { Cleanup, Nav } from "../router";
import { setActiveLog, state } from "../state";
import { MUSCLE_LABELS, type MuscleGroup, type TrainingSession } from "../types";
import {
  formatDuration,
  formatSessionDate,
  sessionDurationSec,
  sessionSetCount,
} from "../util";
import { buildBodySvg } from "./bodySvg";

registerTranslations({
  // — Readiness header · start CTA · last session —
  Readiness: "Pregătire",
  Rested: "Odihnit",
  Ready: "Pregătit",
  Recovering: "În recuperare",
  "Rest up": "Odihnește-te",
  "Fully rested — good to train hard.": "Complet odihnit — poți antrena tare.",
  "~{0}h until fully rested": "~{0}h până la odihnă completă",
  "▶ Start session": "▶ Start sesiune",
  "▶ Resume session": "▶ Reia sesiunea",
  "Last session · {0}": "Ultima sesiune · {0}",
  "{0} sets": "{0} serii",
  "History ▸": "Istoric ▸",
  "Untitled session": "Sesiune fără titlu",
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
  "3D view unavailable — showing a flat diagram instead.":
    "Vizualizarea 3D nu este disponibilă — se afișează o diagramă plată.",
  "← Stats": "← Statistici",
  Weekly: "Săptămânal",
  Recovery: "Recuperare",
  // — export · share —
  "Export · Share": "Export · Distribuie",
  "Share sends a PNG of your body map (front, back & side) to the native share sheet — or save a PNG/PDF.":
    "Distribuie trimite un PNG al hărții corporale (față, spate și lateral) către meniul de partajare — sau salvează un PNG/PDF.",
  "Save a PNG or PDF of this body map. (Direct share works on phones.)":
    "Salvează un PNG sau PDF al acestei hărți corporale. (Distribuirea directă funcționează pe telefoane.)",
  "Share ▸": "Distribuie ▸",
  "Opened the share sheet — pick WhatsApp.":
    "Meniul de partajare s-a deschis — alege WhatsApp.",
  "Sharing isn't available here, so the PNG was downloaded instead.":
    "Distribuirea nu este disponibilă aici, așa că PNG-ul a fost descărcat în schimb.",
  Share: "Distribuie",
  share: "distribuie",
  "Save PNG": "Salvează PNG",
  "save png": "salvează png",
  "Save PDF": "Salvează PDF",
  "save pdf": "salvează pdf",
  "{0}…": "{0}…",
  "{0} ready.": "{0} gata.",
  "Could not {0}. Try again.": "Nu s-a putut {0}. Încearcă din nou.",
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

  // ── Readiness header — the "what state is my body in?" read that leads the
  // home screen: systemic readiness as a status word + tinted percentage, with
  // the muscles still on their recovery clocks (soonest-ready first).
  const systemic = systemicRecovery(sessions);
  const recovering = muscleRecovery(sessions).filter(
    (r) => r.lastTrainedAt !== null && r.recovered < 1,
  );
  const pctChip = h("span", {
    class: "readiness-pct",
    text: `${Math.round(systemic.readiness * 100)}%`,
  });
  pctChip.style.background = recoveryColor(systemic.readiness);
  const musclesLine =
    recovering.length > 0
      ? recovering
          .slice(0, 3)
          .map((r) => `${t(MUSCLE_LABELS[r.muscle])} ~${r.hoursRemaining}h`)
          .join(" · ")
      : t("Fully rested — good to train hard.");
  const header = h("section", { class: "card readiness-card" }, [
    h("div", { class: "readiness-head" }, [
      h("div", {}, [
        h("p", { class: "eyebrow", text: t("Readiness") }),
        h("h2", { class: "readiness-status", text: t(overallStatus(systemic.readiness)) }),
      ]),
      pctChip,
    ]),
    h("p", { class: "plan-meta", text: musclesLine }),
    ...(systemic.hoursRemaining > 0
      ? [
          h("p", {
            class: "plan-meta",
            text: t("~{0}h until fully rested").replace("{0}", String(systemic.hoursRemaining)),
          }),
        ]
      : []),
  ]);

  // ── Primary action — start a fresh session, or resume the one in flight
  // (a mid-set snapshot or an open session that hasn't been ended yet).
  const progress = loadProgress();
  const inFlight = (progress ? getSession(progress.sessionId) : null) ?? state.activeLog;
  const startSession = (): void => {
    setActiveLog(saveSession(newTrainingSession()));
    clearProgress();
    nav.go("live");
  };
  const cta = h("div", { class: "btn-row" }, [
    h("button", {
      class: "btn btn-accent btn-jumbo",
      type: "button",
      text: inFlight ? t("▶ Resume session") : t("▶ Start session"),
      on: { click: () => (inFlight ? nav.go("live") : startSession()) },
    }),
  ]);

  if (sessions.length === 0) {
    container.append(
      header,
      cta,
      h("section", { class: "card" }, [
        h("p", {
          class: "empty",
          text: t("No sessions logged yet — train a live session and your body map fills in here."),
        }),
      ]),
    );
    return () => {};
  }

  // ── Last session — the quick "what did I do?" recall, linking into History.
  const past = [...sessions]
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .find((s) => sessionSetCount(s) > 0);
  const lastCard = past
    ? (() => {
        const durSec = sessionDurationSec(past);
        const metaBits = [
          t("{0} sets").replace("{0}", String(sessionSetCount(past))),
          ...(durSec !== null ? [formatDuration(durSec)] : []),
          readEffort(past, sessions).label,
        ];
        return h("section", { class: "card last-session-card" }, [
          h("p", {
            class: "eyebrow",
            text: t("Last session · {0}").replace("{0}", formatSessionDate(past.startedAt)),
          }),
          h("p", { class: "plan-name", text: past.name || t("Untitled session") }),
          h("p", { class: "plan-meta", text: metaBits.join(" · ") }),
          h("div", { class: "btn-row" }, [
            h("button", {
              class: "btn btn-small",
              type: "button",
              text: t("History ▸"),
              on: { click: () => nav.go("history") },
            }),
          ]),
        ]);
      })()
    : null;

  let metric: BodyMetric = "fatigue";
  let scores = new Map<MuscleGroup, MuscleScore>();
  let scene: BodyScene | null = null;
  let fallback: { el: Element; update: () => void } | null = null;
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
    h("p", {
      class: "plan-meta",
      text: t("Each muscle is shaded by the selected metric. Drag to spin the body; tap a muscle for its reading."),
    }),
    metricToggle,
    stage,
    readout,
    legend,
  ]);

  container.append(
    header,
    cta,
    stageCard,
    ...(lastCard ? [lastCard] : []),
    renderExportPanel(sessions, () => metric),
  );

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

  // — lazy-load Three.js and build the figure; fall back to an SVG body on failure —
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
      fallback = buildBodySvg({
        colorFor: (m) => metricColor(metric, scores.get(m)?.value ?? null),
        onPick: showReadout,
      });
      stage.append(
        h("p", { class: "plan-meta", text: t("3D view unavailable — showing a flat diagram instead.") }),
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

/**
 * "Export · Share" card — renders the body map (front/back/side figures) for the
 * currently selected metric as a PNG/PDF or hands it to the native share sheet.
 * Mirrors the recovery and stats export panels. `getMetric` is read at click time
 * so the export always matches the toggle the user is looking at.
 */
function renderExportPanel(sessions: TrainingSession[], getMetric: () => BodyMetric): HTMLElement {
  const statusEl = h("p", { class: "status", role: "status", aria: { live: "polite" } });
  const setStatus = (msg: string, kind: "ok" | "err" | "info"): void => {
    statusEl.textContent = msg;
    statusEl.className = `status status-${kind}`;
  };
  let busy = false;
  async function runExport(label: string, fn: () => Promise<void>): Promise<void> {
    if (busy) return;
    busy = true;
    setStatus(t("{0}…").replace("{0}", t(label)), "info");
    try {
      await fn();
      setStatus(t("{0} ready.").replace("{0}", t(label)), "ok");
    } catch {
      setStatus(t("Could not {0}. Try again.").replace("{0}", t(label.toLowerCase())), "err");
    } finally {
      busy = false;
    }
  }

  return h("section", { class: "card live-export" }, [
    h("h2", { class: "section-title", text: t("Export · Share") }),
    h("p", {
      class: "plan-meta",
      text: canShareFiles()
        ? t("Share sends a PNG of your body map (front, back & side) to the native share sheet — or save a PNG/PDF.")
        : t("Save a PNG or PDF of this body map. (Direct share works on phones.)"),
    }),
    h("div", { class: "btn-row" }, [
      h("button", {
        class: "btn btn-small btn-accent",
        type: "button",
        text: t("Share ▸"),
        on: {
          click: () =>
            runExport("Share", async () => {
              const result = await shareBodyMap(getMetric(), sessions);
              setStatus(
                result === "shared"
                  ? t("Opened the share sheet — pick WhatsApp.")
                  : t("Sharing isn't available here, so the PNG was downloaded instead."),
                "ok",
              );
            }),
        },
      }),
      h("button", {
        class: "btn btn-small",
        type: "button",
        text: "PNG",
        on: { click: () => runExport("Save PNG", () => exportBodyMapPng(getMetric(), sessions)) },
      }),
      h("button", {
        class: "btn btn-small",
        type: "button",
        text: "PDF",
        on: { click: () => runExport("Save PDF", () => exportBodyMapPdf(getMetric(), sessions)) },
      }),
    ]),
    statusEl,
  ]);
}
