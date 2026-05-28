import { clear, h } from "../dom";
import { lifetimeEffort, type LifetimeEffort } from "../effort";
import { registerTranslations, t } from "../i18n";
import {
  analyzeSessionsInClaude,
  type AnalyzeResult,
  canShareFiles,
  copySessionsPrompt,
  type CopyResult,
  exportStatsPdf,
  exportStatsPng,
  shareStats,
} from "../exporters";
import { loadSessions } from "../logStorage";
import { loadOneRmMaxes } from "../oneRmStore";
import type { Cleanup, Nav } from "../router";
import {
  bestOneRm,
  type BestOneRm,
  buildProgress,
  exerciseKeyLabel,
  presentExerciseKeys,
  type ProgressFilter,
} from "../stats";
import { MUSCLE_LABELS, type TrainingSession } from "../types";
import { formatClock, round2 } from "../util";
import { lineChart } from "./chart";
import { lookbackSlider } from "./lookback";

registerTranslations({
  Stats: "Statistici",
  "How your live sessions trend over time — reps, weight, their combined volume, plus strength and hypertrophy progress. Filter to one exercise to track progressive overload.":
    "Cum evoluează antrenamentele tale în timp — repetări, greutate, volumul lor combinat, plus progresul la forță și hipertrofie. Filtrează un singur exercițiu pentru a urmări supraîncărcarea progresivă.",
  "Weekly volume →": "Volum săptămânal →",
  "weekly training volume per muscle": "volum săptămânal de antrenament pe mușchi",
  "No sessions logged yet. Run a Live session and your progress charts will appear here.":
    "Niciun antrenament înregistrat încă. Pornește un antrenament Live și graficele de progres vor apărea aici.",
  "No sets logged for this exercise yet.":
    "Nicio serie înregistrată pentru acest exercițiu încă.",
  "Go to Live": "Mergi la Live",
  "1 session · {0}": "1 antrenament · {0}",
  "{0} sessions · {1} → {2}": "{0} antrenamente · {1} → {2}",
  Reps: "Repetări",
  reps: "repetări",
  "Total reps logged each session.": "Total repetări înregistrate pe antrenament.",
  "Top weight": "Greutate maximă",
  "Heaviest single set — are you loading more?":
    "Cea mai grea serie — încarci mai mult?",
  Volume: "Volum",
  "Reps × weight combined — total work done.":
    "Repetări × greutate combinate — totalul muncii efectuate.",
  Strength: "Forță",
  "Best estimated 1-rep max (Epley).": "Cea mai bună estimare 1RM (Epley).",
  Hypertrophy: "Hipertrofie",
  "Volume in the 6–20 rep muscle-building range.":
    "Volum în intervalul 6–20 repetări pentru construcția musculară.",
  "Best one-rep max": "Cel mai bun 1RM",
  Logged: "Înregistrat",
  Estimated: "Estimat",
  "Heaviest tested max you've logged beside your best Epley estimate.":
    "Cea mai grea valoare maximă testată pe care ai înregistrat-o, alături de cea mai bună estimare Epley.",
  glass: "pahar",
  glasses: "pahare",
  "{0} {1}": "{0} {1}",
  Bodyweight: "Greutate corporală",
  set: "serie",
  sets: "serii",
  "Lifetime effort": "Efort total",
  "Across {0} {1} · {2} {3}": "În {0} {1} · {2} {3}",
  session: "antrenament",
  sessions: "antrenamente",
  "muscle group": "grup muscular",
  "muscle groups": "grupuri musculare",
  "Effort per muscle": "Efort pe mușchi",
  Hydration: "Hidratare",
  "Total fluid to match every session's effort.":
    "Total lichide pentru a echilibra efortul fiecărui antrenament.",
  "Protein to recover": "Proteine pentru recuperare",
  "Energy burned": "Energie consumată",
  "Export · Share": "Export · Distribuie",
  "Share sends a PNG of these stats to the native share sheet — or save a PNG/PDF.":
    "Distribuie trimite un PNG cu aceste statistici către meniul de partajare — sau salvează un PNG/PDF.",
  "Save a PNG or PDF of this stats report. (Direct share works on phones.)":
    "Salvează un PNG sau PDF al acestui raport de statistici. (Distribuirea directă funcționează pe telefoane.)",
  "Share ▸": "Distribuie ▸",
  "Opened the share sheet — pick WhatsApp.":
    "Meniul de partajare s-a deschis — alege WhatsApp.",
  "Sharing isn't available here, so the PNG was downloaded instead.":
    "Distribuirea nu este disponibilă aici, așa că PNG-ul a fost descărcat în schimb.",
  "Hand your recent training log to an AI for coaching feedback and progression tips.":
    "Oferă jurnalul tău recent de antrenament unui AI pentru feedback de antrenor și sfaturi de progresie.",
  "Ask Claude ▸": "Întreabă Claude ▸",
  "ask Claude about recent logged sessions":
    "întreabă Claude despre antrenamentele recente înregistrate",
  "Copy prompt": "Copiază promptul",
  "copy recent logged sessions as a prompt for any AI":
    "copiază antrenamentele recente ca prompt pentru orice AI",
  "Filter by exercise": "Filtrează după exercițiu",
  "All exercises": "Toate exercițiile",
  Exercise: "Exercițiu",
  // — Status messages —
  "{0}…": "{0}…",
  "{0} ready.": "{0} gata.",
  "Could not {0}. Try again.": "Nu s-a putut {0}. Încearcă din nou.",
  Share: "Distribuie",
  share: "distribuie",
  "Save PNG": "Salvează PNG",
  "save png": "salvează png",
  "Save PDF": "Salvează PDF",
  "save pdf": "salvează pdf",
  "Ask Claude": "Întreabă Claude",
  "ask claude": "întreabă claude",
  // — Analyze / copy result messages —
  "Opened the share sheet — pick Claude to analyse your log.":
    "Meniul de partajare s-a deschis — alege Claude pentru a-ți analiza jurnalul.",
  "Copied your log — paste it into the new Claude chat.":
    "Jurnalul a fost copiat — lipește-l în noua conversație Claude.",
  "Copied to clipboard — open Claude and paste.":
    "Copiat în clipboard — deschide Claude și lipește.",
  "Clipboard unavailable — saved a Markdown file instead.":
    "Clipboard indisponibil — s-a salvat un fișier Markdown în schimb.",
  "Copied the prompt — paste it into any AI (ChatGPT, Gemini, Claude…).":
    "Promptul a fost copiat — lipește-l în orice AI (ChatGPT, Gemini, Claude…).",
});

export function mountStats(root: HTMLElement, nav: Nav): Cleanup {
  const container = h("div", { class: "view view-stats" });
  root.appendChild(container);

  let filter: ProgressFilter = "all";

  // Export / share — the element is reused so its message survives re-renders.
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
  const analyzeMsg = (result: AnalyzeResult): string => {
    switch (result) {
      case "shared":
        return t("Opened the share sheet — pick Claude to analyse your log.");
      case "copied-opened":
        return t("Copied your log — paste it into the new Claude chat.");
      case "copied":
        return t("Copied to clipboard — open Claude and paste.");
      case "downloaded":
        return t("Clipboard unavailable — saved a Markdown file instead.");
    }
  };
  const copyMsg = (result: CopyResult): string => {
    switch (result) {
      case "copied":
        return t("Copied the prompt — paste it into any AI (ChatGPT, Gemini, Claude…).");
      case "downloaded":
        return t("Clipboard unavailable — saved a Markdown file instead.");
    }
  };

  function render(): void {
    clear(container);

    const sessions = loadSessions();
    const keys = presentExerciseKeys(sessions);
    // The filtered exercise may no longer exist (e.g. its session was deleted).
    if (filter !== "all" && !keys.includes(filter)) filter = "all";

    container.append(
      h("h1", { class: "view-title", text: t("Stats") }),
      h("p", {
        class: "lede",
        text: t("How your live sessions trend over time — reps, weight, their combined volume, plus strength and hypertrophy progress. Filter to one exercise to track progressive overload."),
      }),
    );

    if (sessions.length > 0) {
      container.append(
        h("div", { class: "btn-row" }, [
          h("button", {
            class: "btn btn-small",
            type: "button",
            text: t("Weekly volume →"),
            aria: { label: t("weekly training volume per muscle") },
            on: { click: () => nav.go("weekly") },
          }),
        ]),
      );
    }

    const lifetime = lifetimeEffort(sessions);
    if (lifetime.sessions > 0) container.append(renderLifetime(lifetime));

    if (keys.length > 0) container.append(renderFilter(keys));

    const points = buildProgress(sessions, filter);

    if (points.length === 0) {
      container.append(
        h("p", {
          class: "empty",
          text:
            sessions.length === 0
              ? t("No sessions logged yet. Run a Live session and your progress charts will appear here.")
              : t("No sets logged for this exercise yet."),
        }),
        h("div", { class: "btn-row" }, [
          h("button", {
            class: "btn btn-primary",
            type: "button",
            text: t("Go to Live"),
            on: { click: () => nav.go("live") },
          }),
        ]),
      );
      // Lifetime stats may still be worth exporting even when this scope is empty.
      if (sessions.length > 0) container.append(renderExportPanel(sessions));
      return;
    }

    const labels = points.map((p) => p.label);
    const kg = (n: number): string => String(round2(n));
    const best = bestOneRm(sessions, filter, loadOneRmMaxes());

    container.append(
      h("p", {
        class: "stat-range",
        text:
          points.length === 1
            ? t("1 session · {0}").replace("{0}", String(labels[0]))
            : t("{0} sessions · {1} → {2}")
                .replace("{0}", String(points.length))
                .replace("{1}", String(labels[0]))
                .replace("{2}", String(labels[labels.length - 1])),
      }),
    );

    if (best.logged > 0 || best.estimated > 0) container.append(renderOneRmHeadline(best));

    container.append(
      lineChart({
        title: t("Reps"),
        unit: t("reps"),
        values: points.map((p) => p.reps),
        labels,
        color: "var(--signal)",
        hint: t("Total reps logged each session."),
      }),
      lineChart({
        title: t("Top weight"),
        unit: "kg",
        values: points.map((p) => p.topWeight),
        labels,
        color: "var(--navy)",
        hint: t("Heaviest single set — are you loading more?"),
        format: kg,
      }),
      lineChart({
        title: t("Volume"),
        unit: "kg",
        values: points.map((p) => p.volume),
        labels,
        color: "var(--brick)",
        hint: t("Reps × weight combined — total work done."),
        format: kg,
      }),
      lineChart({
        title: t("Strength"),
        unit: "kg",
        values: points.map((p) => p.strength),
        labels,
        color: "var(--pine)",
        hint: t("Best estimated 1-rep max (Epley)."),
        format: kg,
      }),
      lineChart({
        title: t("Hypertrophy"),
        unit: "kg",
        values: points.map((p) => p.hypertrophy),
        labels,
        color: "var(--mustard)",
        hint: t("Volume in the 6–20 rep muscle-building range."),
        format: kg,
      }),
    );

    container.append(renderExportPanel(sessions));
  }

  /**
   * Headline best one-rep max for the current scope: the heaviest tested max the
   * user has logged shown beside the best Epley estimate from their sets. Either
   * reads "—" when nothing qualifies (e.g. bodyweight-only work has no estimate).
   */
  function renderOneRmHeadline(best: BestOneRm): HTMLElement {
    const fmt = (n: number): string => (n > 0 ? `${round2(n)} kg` : "—");
    return h("section", { class: "card onerm-headline" }, [
      h("span", { class: "effort-eyebrow", text: t("Best one-rep max") }),
      h("div", { class: "onerm-grid" }, [
        h("div", { class: "onerm-cell" }, [
          h("span", { class: "field-label", text: t("Logged") }),
          h("span", { class: "onerm-calc", text: fmt(best.logged) }),
        ]),
        h("div", { class: "onerm-cell" }, [
          h("span", { class: "field-label", text: t("Estimated") }),
          h("span", { class: "onerm-calc", text: fmt(best.estimated) }),
        ]),
      ]),
      h("p", {
        class: "onerm-note",
        text: t("Heaviest tested max you've logged beside your best Epley estimate."),
      }),
    ]);
  }

  /**
   * The live-session summary stats (effort, per-muscle work, hydration, protein)
   * pooled across every logged session — the all-time counterpart to the gauge
   * shown during a workout. Per-muscle rows are ranked by effort so the biggest
   * contributors lead, each with a bar showing its share of the busiest muscle.
   */
  function renderLifetime(lifetime: LifetimeEffort): HTMLElement {
    const byEffort = [...lifetime.muscles].sort((a, b) => b.effort - a.effort);
    const topEffort = byEffort[0]?.effort ?? 0;
    const liters = Math.round(lifetime.hydrationMl / 100) / 10;
    const glassCount = Math.round(lifetime.hydrationMl / 250);
    const glasses = t("{0} {1}")
      .replace("{0}", String(glassCount))
      .replace("{1}", glassCount === 1 ? t("glass") : t("glasses"));

    const muscleRows = byEffort.map((m) => {
      const fill = h("div", { class: "muscle-bar-fill" });
      fill.style.width = `${topEffort > 0 ? (m.effort / topEffort) * 100 : 0}%`;
      const detail = `${m.volume > 0 ? `${m.volume} kg` : t("Bodyweight")} · ${formatClock(m.timeSec)} · ${m.sets} ${m.sets === 1 ? t("set") : t("sets")}`;
      return h("div", { class: "muscle-effort" }, [
        h("div", { class: "muscle-row" }, [
          h("span", { class: "muscle-name", text: t(MUSCLE_LABELS[m.muscle]) }),
          h("span", { class: "muscle-stat", text: `${m.effort} pts` }),
        ]),
        h("div", { class: "muscle-bar" }, [fill]),
        h("span", { class: "muscle-detail", text: detail }),
      ]);
    });

    return h("section", { class: "card live-effort lifetime-effort" }, [
      h("div", { class: "effort-head" }, [
        h("span", { class: "effort-eyebrow", text: t("Lifetime effort") }),
        h("span", { class: "effort-tier", text: `${lifetime.points} pts` }),
      ]),
      h("p", {
        class: "effort-meta",
        text: t("Across {0} {1} · {2} {3}")
          .replace("{0}", String(lifetime.sessions))
          .replace("{1}", lifetime.sessions === 1 ? t("session") : t("sessions"))
          .replace("{2}", String(lifetime.muscles.length))
          .replace("{3}", lifetime.muscles.length === 1 ? t("muscle group") : t("muscle groups")),
      }),
      h("div", { class: "summary-muscles" }, [
        h("span", { class: "summary-label", text: t("Effort per muscle") }),
        ...muscleRows,
      ]),
      h("div", { class: "hydration-row" }, [
        h("span", { class: "hydration-label", text: t("Hydration") }),
        h("span", { class: "hydration-figure", text: `≈ ${liters.toFixed(1)} L · ${glasses}` }),
      ]),
      h("p", {
        class: "hydration-note",
        text: t("Total fluid to match every session's effort."),
      }),
      h("div", { class: "protein-row" }, [
        h("span", { class: "protein-label", text: t("Protein to recover") }),
        h("span", { class: "protein-figure", text: `≈ ${lifetime.proteinG} g` }),
      ]),
      h("div", { class: "calories-row" }, [
        h("span", { class: "calories-label", text: t("Energy burned") }),
        h("span", { class: "calories-figure", text: `≈ ${lifetime.caloriesKcal} kcal` }),
      ]),
    ]);
  }

  /**
   * "Export · Share" card — renders the current scope (all exercises or the
   * filtered one) as a PNG/PDF stats report or hands it to the native share
   * sheet. Reads the live `filter`, so it always exports what's on screen.
   */
  function renderExportPanel(sessions: TrainingSession[]): HTMLElement {
    const chronological = [...sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    const lookback = lookbackSlider(chronological.length);
    return h("section", { class: "card live-export" }, [
      h("h2", { class: "section-title", text: t("Export · Share") }),
      h("p", {
        class: "plan-meta",
        text: canShareFiles()
          ? t("Share sends a PNG of these stats to the native share sheet — or save a PNG/PDF.")
          : t("Save a PNG or PDF of this stats report. (Direct share works on phones.)"),
      }),
      h("div", { class: "btn-row" }, [
        h("button", {
          class: "btn btn-small btn-accent",
          type: "button",
          text: t("Share ▸"),
          on: {
            click: () =>
              runExport("Share", async () => {
                const result = await shareStats(sessions, filter);
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
          on: { click: () => runExport("Save PNG", () => exportStatsPng(sessions, filter)) },
        }),
        h("button", {
          class: "btn btn-small",
          type: "button",
          text: "PDF",
          on: { click: () => runExport("Save PDF", () => exportStatsPdf(sessions, filter)) },
        }),
      ]),
      h("p", {
        class: "plan-meta",
        text: t("Hand your recent training log to an AI for coaching feedback and progression tips."),
      }),
      ...(chronological.length > 1 ? [lookback.field] : []),
      h("div", { class: "btn-row" }, [
        h("button", {
          class: "btn btn-small btn-accent",
          type: "button",
          text: t("Ask Claude ▸"),
          aria: { label: t("ask Claude about recent logged sessions") },
          on: {
            click: () =>
              runExport("Ask Claude", async () => {
                setStatus(analyzeMsg(await analyzeSessionsInClaude(lookback.pick(chronological))), "ok");
              }),
          },
        }),
        h("button", {
          class: "btn btn-small",
          type: "button",
          text: t("Copy prompt"),
          aria: { label: t("copy recent logged sessions as a prompt for any AI") },
          on: {
            click: () =>
              runExport("Copy prompt", async () => {
                setStatus(copyMsg(await copySessionsPrompt(lookback.pick(chronological))), "ok");
              }),
          },
        }),
      ]),
      statusEl,
    ]);
  }

  function renderFilter(keys: string[]): HTMLElement {
    const select = h(
      "select",
      { class: "stat-filter-select", aria: { label: t("Filter by exercise") } },
      [
        h("option", { value: "all", text: t("All exercises") }),
        ...keys.map((k) => h("option", { value: k, text: exerciseKeyLabel(k) })),
      ],
    );
    select.value = filter;
    select.addEventListener("change", () => {
      filter = select.value as ProgressFilter;
      render();
    });
    return h("label", { class: "field stat-filter" }, [
      h("span", { class: "field-label", text: t("Exercise") }),
      select,
    ]);
  }

  render();
  return () => {};
}
