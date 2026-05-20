import { clear, h } from "../dom";
import type { Nav } from "../router";
import { deletePlan, loadPlans } from "../storage";
import { clonePlan, totalSets } from "../util";

export function mountSaved(root: HTMLElement, nav: Nav): void {
  const listHost = h("div", { class: "saved-list" });

  function render(): void {
    clear(listHost);
    const plans = loadPlans();
    if (plans.length === 0) {
      listHost.appendChild(
        h("p", { class: "empty", text: "No saved plans yet. Build one and press Save." }),
      );
      return;
    }
    plans
      .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
      .forEach((plan) => {
        listHost.appendChild(
          h("section", { class: "card saved-item" }, [
            h("div", { class: "saved-info" }, [
              h("p", { class: "plan-name", text: plan.name }),
              h("p", {
                class: "plan-meta",
                text: `${plan.exercises.length} exercises · ${totalSets(plan)} sets · ${plan.restSec}s rest`,
              }),
            ]),
            h("div", { class: "btn-row saved-actions" }, [
              h("button", {
                class: "btn btn-accent btn-small",
                type: "button",
                text: "Start",
                on: { click: () => nav.start(clonePlan(plan)) },
              }),
              h("button", {
                class: "btn btn-small",
                type: "button",
                text: "Edit",
                on: { click: () => nav.edit(clonePlan(plan)) },
              }),
              h("button", {
                class: "btn btn-small danger",
                type: "button",
                text: "Delete",
                on: {
                  click: () => {
                    const ok = confirm(`Delete "${plan.name}"? This cannot be undone.`);
                    if (!ok) return;
                    deletePlan(plan.id);
                    render();
                  },
                },
              }),
            ]),
          ]),
        );
      });
  }

  const container = h("div", { class: "view view-saved" }, [
    h("h1", { class: "view-title", text: "Saved Plans" }),
    listHost,
  ]);

  render();
  root.appendChild(container);
}
