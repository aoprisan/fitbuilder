import "./styles.css";
import { clear, h } from "./dom";
import { registerServiceWorker } from "./pwa";
import { sheetToSession } from "./log";
import { clearProgress } from "./liveProgress";
import { saveSession } from "./logStorage";
import type { Cleanup, Nav, ViewName } from "./router";
import { setActiveLog, setEditingSheet, setExecuting, state } from "./state";
import { cloneSheet } from "./util";
import { mountExecute } from "./views/execute";
import { mountHome } from "./views/home";
import { mountLive } from "./views/live";
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
  { name: "sheet", label: "Routines", icon: () => navIcon("M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01") },
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
    editSheet: (sheet) => {
      setEditingSheet(sheet);
      navigate("sheet");
    },
    runSheet: (sheet) => {
      setExecuting(sheet);
      navigate("execute");
    },
    startLive: (sheet) => {
      // If a session with logged work is open, confirm before swapping. The
      // prior session is already persisted, so this only changes activeLog.
      if (state.activeLog && state.activeLog.exercises.some((ex) => ex.sets.length > 0)) {
        const ok = confirm(
          "A live session is in progress. Start a new one from this routine? Your current session is kept in the Live list.",
        );
        if (!ok) return;
      }
      setActiveLog(saveSession(sheetToSession(sheet)));
      clearProgress(); // so mountLive's restore() won't overwrite the new session
      navigate("live");
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
        // The Execute tab runs the current working sheet as a snapshot.
        if (item.name === "execute") nav.runSheet(cloneSheet(state.editingSheet));
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
