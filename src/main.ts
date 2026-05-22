import "./styles.css";
import { clear, h } from "./dom";
import { registerServiceWorker } from "./pwa";
import type { Cleanup, Nav, ViewName } from "./router";
import { setEditing, setEditingSheet, setExecuting, setSession, state } from "./state";
import { clonePlan, cloneSheet } from "./util";
import { mountBuilder } from "./views/builder";
import { mountExecute } from "./views/execute";
import { mountHome } from "./views/home";
import { mountLive } from "./views/live";
import { mountSaved } from "./views/saved";
import { mountSession } from "./views/session";
import { mountSheet } from "./views/sheet";
import { mountStats } from "./views/stats";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Build a stroked 24×24 nav glyph from one or more SVG path `d` strings. */
function navIcon(...paths: string[]): SVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "nav-icon");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.9");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  return svg;
}

const NAV_ITEMS: ReadonlyArray<{ name: ViewName; label: string; icon: () => SVGElement }> = [
  { name: "home", label: "Home", icon: () => navIcon("M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5M9.5 20v-6h5v6") },
  {
    name: "live",
    label: "Live",
    icon: () => navIcon("M3 12h3.5l2.5-7 4 14 2.5-7H21"),
  },
  { name: "builder", label: "Builder", icon: () => navIcon("M4 20h4L18.5 9.5a2 2 0 0 0-3-3L5 17v3zM13.5 6.5l3 3") },
  { name: "sheet", label: "Routines", icon: () => navIcon("M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01") },
  { name: "saved", label: "Saved", icon: () => navIcon("M6 3h12v18l-6-4.5L6 21z") },
  { name: "session", label: "Session", icon: () => navIcon("M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 14V9.5M9.5 2h5M19 6l1.6-1.6") },
  { name: "execute", label: "Execute", icon: () => navIcon("M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM8.5 12l2.5 2.5 5-5") },
];

function boot(): void {
  const app = document.getElementById("app");
  if (!app) throw new Error("Missing #app root element.");

  let cleanup: Cleanup | null = null;
  let currentView: ViewName = "home";

  const viewHost = h("main", { class: "view-host", id: "view" });

  const navButtons = new Map<ViewName, HTMLButtonElement>();

  const nav: Nav = {
    go: (view) => navigate(view),
    edit: (plan) => {
      setEditing(plan);
      navigate("builder");
    },
    start: (plan) => {
      setSession(plan);
      navigate("session");
    },
    editSheet: (sheet) => {
      setEditingSheet(sheet);
      navigate("sheet");
    },
    runSheet: (sheet) => {
      setExecuting(sheet);
      navigate("execute");
    },
  };

  function navigate(view: ViewName): void {
    if (cleanup) {
      cleanup();
      cleanup = null;
    }
    currentView = view;
    for (const [name, btn] of navButtons) {
      const active = name === currentView;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-current", active ? "page" : "false");
    }

    clear(viewHost);
    let result: Cleanup | void;
    switch (view) {
      case "home":
        result = mountHome(viewHost, nav);
        break;
      case "builder":
        result = mountBuilder(viewHost, nav);
        break;
      case "saved":
        result = mountSaved(viewHost, nav);
        break;
      case "session":
        result = mountSession(viewHost, nav);
        break;
      case "sheet":
        result = mountSheet(viewHost, nav);
        break;
      case "execute":
        result = mountExecute(viewHost, nav);
        break;
      case "live":
        result = mountLive(viewHost, nav);
        break;
      case "stats":
        result = mountStats(viewHost, nav);
        break;
    }
    cleanup = typeof result === "function" ? result : null;
    window.scrollTo(0, 0);
  }

  const navRow = h(
    "nav",
    { class: "nav", aria: { label: "Primary" } },
    NAV_ITEMS.map((item) => {
      const btn = h("button", { class: "nav-btn", type: "button", aria: { label: item.label } }, [
        item.icon(),
        h("span", { class: "nav-label", text: item.label }),
      ]);
      btn.addEventListener("click", () => {
        // Session/Execute tabs run the current working plan/sheet as a snapshot.
        if (item.name === "session") nav.start(clonePlan(state.editing));
        else if (item.name === "execute") nav.runSheet(cloneSheet(state.editingSheet));
        else nav.go(item.name);
      });
      navButtons.set(item.name, btn);
      return btn;
    }),
  );

  const header = h("header", { class: "app-header" }, [
    h("button", {
      class: "brand",
      type: "button",
      text: "GYM LOG",
      aria: { label: "Gym Log home" },
      on: { click: () => nav.go("home") },
    }),
    navRow,
  ]);

  app.append(header, viewHost);
  navigate("home");
}

registerServiceWorker();
boot();
