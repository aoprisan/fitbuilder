import { clear, h } from "../dom";
import { lifetimeEffort, type LifetimeEffort } from "../effort";
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
    setStatus(`${label}…`, "info");
    try {
      await fn();
      setStatus(`${label} ready.`, "ok");
    } catch {
      setStatus(`Could not ${label.toLowerCase()}. Try again.`, "err");
    } finally {
      busy = false;
    }
  }
  const analyzeMsg = (result: AnalyzeResult): string => {
    switch (result) {
      case "shared":
        return "Opened the share sheet — pick Claude to analyse your log.";
      case "copied-opened":
        return "Copied your log — paste it into the new Claude chat.";
      case "copied":
        return "Copied to clipboard — open Claude and paste.";
      case "downloaded":
        return "Clipboard unavailable — saved a Markdown file instead.";
    }
  };
  const copyMsg = (result: CopyResult): string => {
    switch (result) {
      case "copied":
        return "Copied the prompt — paste it into any AI (ChatGPT, Gemini, Claude…).";
      case "downloaded":
        return "Clipboard unavailable — saved a Markdown file instead.";
    }
  };

  function render(): void {
    clear(container);

    const sessions = loadSessions();
    const keys = presentExerciseKeys(sessions);
    // The filtered exercise may no longer exist (e.g. its session was deleted).
    if (filter !== "all" && !keys.includes(filter)) filter = "all";

    container.append(
      h("h1", { class: "view-title", text: "Stats" }),
      h("p", {
        class: "lede",
        text: "How your live sessions trend over time — reps, weight, their combined volume, plus strength and hypertrophy progress. Filter to one exercise to track progressive overload.",
      }),
    );

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
              ? "No sessions logged yet. Run a Live session and your progress charts will appear here."
              : "No sets logged for this exercise yet.",
        }),
        h("div", { class: "btn-row" }, [
          h("button", {
            class: "btn btn-primary",
            type: "button",
            text: "Go to Live",
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
            ? `1 session · ${labels[0]}`
            : `${points.length} sessions · ${labels[0]} → ${labels[labels.length - 1]}`,
      }),
    );

    if (best.logged > 0 || best.estimated > 0) container.append(renderOneRmHeadline(best));

    container.append(
      lineChart({
        title: "Reps",
        unit: "reps",
        values: points.map((p) => p.reps),
        labels,
        color: "var(--signal)",
        hint: "Total reps logged each session.",
      }),
      lineChart({
        title: "Top weight",
        unit: "kg",
        values: points.map((p) => p.topWeight),
        labels,
        color: "var(--navy)",
        hint: "Heaviest single set — are you loading more?",
        format: kg,
      }),
      lineChart({
        title: "Volume",
        unit: "kg",
        values: points.map((p) => p.volume),
        labels,
        color: "var(--brick)",
        hint: "Reps × weight combined — total work done.",
        format: kg,
      }),
      lineChart({
        title: "Strength",
        unit: "kg",
        values: points.map((p) => p.strength),
        labels,
        color: "var(--pine)",
        hint: "Best estimated 1-rep max (Epley).",
        format: kg,
      }),
      lineChart({
        title: "Hypertrophy",
        unit: "kg",
        values: points.map((p) => p.hypertrophy),
        labels,
        color: "var(--mustard)",
        hint: "Volume in the 6–20 rep muscle-building range.",
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
      h("span", { class: "effort-eyebrow", text: "Best one-rep max" }),
      h("div", { class: "onerm-grid" }, [
        h("div", { class: "onerm-cell" }, [
          h("span", { class: "field-label", text: "Logged" }),
          h("span", { class: "onerm-calc", text: fmt(best.logged) }),
        ]),
        h("div", { class: "onerm-cell" }, [
          h("span", { class: "field-label", text: "Estimated" }),
          h("span", { class: "onerm-calc", text: fmt(best.estimated) }),
        ]),
      ]),
      h("p", {
        class: "onerm-note",
        text: "Heaviest tested max you've logged beside your best Epley estimate.",
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
    const glasses = `${glassCount} ${glassCount === 1 ? "glass" : "glasses"}`;

    const muscleRows = byEffort.map((m) => {
      const fill = h("div", { class: "muscle-bar-fill" });
      fill.style.width = `${topEffort > 0 ? (m.effort / topEffort) * 100 : 0}%`;
      const detail = `${m.volume > 0 ? `${m.volume} kg` : "Bodyweight"} · ${formatClock(m.timeSec)} · ${m.sets} ${m.sets === 1 ? "set" : "sets"}`;
      return h("div", { class: "muscle-effort" }, [
        h("div", { class: "muscle-row" }, [
          h("span", { class: "muscle-name", text: MUSCLE_LABELS[m.muscle] }),
          h("span", { class: "muscle-stat", text: `${m.effort} pts` }),
        ]),
        h("div", { class: "muscle-bar" }, [fill]),
        h("span", { class: "muscle-detail", text: detail }),
      ]);
    });

    return h("section", { class: "card live-effort lifetime-effort" }, [
      h("div", { class: "effort-head" }, [
        h("span", { class: "effort-eyebrow", text: "Lifetime effort" }),
        h("span", { class: "effort-tier", text: `${lifetime.points} pts` }),
      ]),
      h("p", {
        class: "effort-meta",
        text: `Across ${lifetime.sessions} ${lifetime.sessions === 1 ? "session" : "sessions"} · ${lifetime.muscles.length} ${lifetime.muscles.length === 1 ? "muscle group" : "muscle groups"}`,
      }),
      h("div", { class: "summary-muscles" }, [
        h("span", { class: "summary-label", text: "Effort per muscle" }),
        ...muscleRows,
      ]),
      h("div", { class: "hydration-row" }, [
        h("span", { class: "hydration-label", text: "Hydration" }),
        h("span", { class: "hydration-figure", text: `≈ ${liters.toFixed(1)} L · ${glasses}` }),
      ]),
      h("p", {
        class: "hydration-note",
        text: "Total fluid to match every session's effort.",
      }),
      h("div", { class: "protein-row" }, [
        h("span", { class: "protein-label", text: "Protein to recover" }),
        h("span", { class: "protein-figure", text: `≈ ${lifetime.proteinG} g` }),
      ]),
      h("div", { class: "calories-row" }, [
        h("span", { class: "calories-label", text: "Energy burned" }),
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
      h("h2", { class: "section-title", text: "Export · Share" }),
      h("p", {
        class: "plan-meta",
        text: canShareFiles()
          ? "Share sends a PNG of these stats to the native share sheet — or save a PNG/PDF."
          : "Save a PNG or PDF of this stats report. (Direct share works on phones.)",
      }),
      h("div", { class: "btn-row" }, [
        h("button", {
          class: "btn btn-small btn-accent",
          type: "button",
          text: "Share ▸",
          on: {
            click: () =>
              runExport("Share", async () => {
                const result = await shareStats(sessions, filter);
                setStatus(
                  result === "shared"
                    ? "Opened the share sheet — pick WhatsApp."
                    : "Sharing isn't available here, so the PNG was downloaded instead.",
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
        text: "Hand your recent training log to an AI for coaching feedback and progression tips.",
      }),
      ...(chronological.length > 1 ? [lookback.field] : []),
      h("div", { class: "btn-row" }, [
        h("button", {
          class: "btn btn-small btn-accent",
          type: "button",
          text: "Analyze in Claude ▸",
          aria: { label: "analyse recent logged sessions in Claude" },
          on: {
            click: () =>
              runExport("Analyze in Claude", async () => {
                setStatus(analyzeMsg(await analyzeSessionsInClaude(lookback.pick(chronological))), "ok");
              }),
          },
        }),
        h("button", {
          class: "btn btn-small",
          type: "button",
          text: "Copy prompt",
          aria: { label: "copy recent logged sessions as a prompt for any AI" },
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
      { class: "stat-filter-select", aria: { label: "Filter by exercise" } },
      [
        h("option", { value: "all", text: "All exercises" }),
        ...keys.map((k) => h("option", { value: k, text: exerciseKeyLabel(k) })),
      ],
    );
    select.value = filter;
    select.addEventListener("change", () => {
      filter = select.value as ProgressFilter;
      render();
    });
    return h("label", { class: "field stat-filter" }, [
      h("span", { class: "field-label", text: "Exercise" }),
      select,
    ]);
  }

  render();
  return () => {};
}
