import { h } from "../dom";
import { forceAppUpdate } from "../pwa";
import type { Nav } from "../router";
import { state } from "../state";
import { formatSessionDate, totalSets } from "../util";

export function mountHome(root: HTMLElement, nav: Nav): void {
  const plan = state.editing;

  const hero = h("section", { class: "hero" }, [
    h("p", { class: "eyebrow", text: "GYM LOG" }),
    h("h1", { class: "display", text: "Exercise Builder" }),
    h("p", {
      class: "lede",
      text: "Build a workout plan, save or export it as JSON for other tools, then run a live, beeping training session straight from it.",
    }),
    h("div", { class: "btn-row" }, [
      h("button", {
        class: "btn btn-primary",
        text: "Start Live Session",
        on: { click: () => nav.go("live") },
      }),
      h("button", {
        class: "btn",
        text: "Progress Stats",
        on: { click: () => nav.go("stats") },
      }),
      h("button", {
        class: "btn",
        text: "Open Builder",
        on: { click: () => nav.go("builder") },
      }),
      h("button", {
        class: "btn",
        text: "Routine Sheets",
        on: { click: () => nav.go("sheet") },
      }),
      h("button", {
        class: "btn btn-accent",
        text: "Run Current Plan",
        on: { click: () => nav.start(plan) },
      }),
    ]),
  ]);

  const card = h("section", { class: "card current-plan" }, [
    h("h2", { class: "section-title", text: "Current plan" }),
    h("p", { class: "plan-name", text: plan.name }),
    h("p", {
      class: "plan-meta",
      text: `${plan.exercises.length} exercises · ${totalSets(plan)} sets · ${plan.restSec}s rest`,
    }),
  ]);

  const steps = h("section", { class: "card" }, [
    h("h2", { class: "section-title", text: "How it works" }),
    h("ol", { class: "steps" }, [
      h("li", { text: "Build & tweak your plan in the Builder." }),
      h("li", { text: "Save it, download the JSON, or copy it for another tool." }),
      h("li", { text: "Start a session and train set-by-set with rest countdowns." }),
      h("li", { text: "Or build a Routine Sheet and share it as a PNG/PDF on WhatsApp." }),
    ]),
  ]);

  const updateBtn = h("button", {
    class: "btn btn-small",
    text: "Update app",
    aria: { label: "Update app to the latest version" },
  });
  updateBtn.addEventListener("click", () => {
    updateBtn.disabled = true;
    updateBtn.textContent = "Updating…";
    void forceAppUpdate();
  });

  const updateCard = h("section", { class: "card" }, [
    h("h2", { class: "section-title", text: "Updates" }),
    h("p", {
      class: "plan-meta",
      text: "Pull the latest version and refresh this installed copy.",
    }),
    h("div", { class: "btn-row" }, [updateBtn]),
    h("p", { class: "build-stamp", text: `Build ${formatSessionDate(__BUILD_TIME__)}` }),
  ]);

  root.appendChild(h("div", { class: "view view-home" }, [hero, card, steps, updateCard]));
}
