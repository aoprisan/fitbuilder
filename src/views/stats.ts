import { clear, h } from "../dom";
import { loadSessions } from "../logStorage";
import type { Cleanup, Nav } from "../router";
import {
  buildProgress,
  exerciseKeyLabel,
  presentExerciseKeys,
  type ProgressFilter,
} from "../stats";
import { round2 } from "../util";
import { lineChart } from "./chart";

export function mountStats(root: HTMLElement, nav: Nav): Cleanup {
  const container = h("div", { class: "view view-stats" });
  root.appendChild(container);

  let filter: ProgressFilter = "all";

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
      return;
    }

    const labels = points.map((p) => p.label);
    const kg = (n: number): string => String(round2(n));

    container.append(
      h("p", {
        class: "stat-range",
        text:
          points.length === 1
            ? `1 session · ${labels[0]}`
            : `${points.length} sessions · ${labels[0]} → ${labels[labels.length - 1]}`,
      }),
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
