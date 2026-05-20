import "./styles.css";
import { clear, h } from "./dom";
import type { Cleanup, Nav, ViewName } from "./router";
import { setEditing, setEditingSheet, setSession, state } from "./state";
import { clonePlan } from "./util";
import { mountBuilder } from "./views/builder";
import { mountHome } from "./views/home";
import { mountSaved } from "./views/saved";
import { mountSession } from "./views/session";
import { mountSheet } from "./views/sheet";

const NAV_ITEMS: ReadonlyArray<{ name: ViewName; label: string }> = [
  { name: "home", label: "Home" },
  { name: "builder", label: "Builder" },
  { name: "sheet", label: "Routines" },
  { name: "saved", label: "Saved" },
  { name: "session", label: "Session" },
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
    }
    cleanup = typeof result === "function" ? result : null;
    window.scrollTo(0, 0);
  }

  const navRow = h(
    "nav",
    { class: "nav", aria: { label: "Primary" } },
    NAV_ITEMS.map((item) => {
      const btn = h("button", { class: "nav-btn", type: "button", text: item.label });
      btn.addEventListener("click", () => {
        // The Session tab always runs the current working plan as a snapshot.
        if (item.name === "session") nav.start(clonePlan(state.editing));
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

boot();
