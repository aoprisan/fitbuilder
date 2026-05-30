import "./styles.css";
import { clear, h } from "./dom";
import { registerServiceWorker } from "./pwa";
import { sheetToSession } from "./log";
import { clearProgress } from "./liveProgress";
import { saveSession } from "./logStorage";
import type { Cleanup, Nav, ViewName } from "./router";
import { importRoutineFromUrl, urlWithoutRoutine } from "./shareRoutine";
import { saveSheet } from "./sheetStorage";
import { setActiveLog, setEditingSheet, setExecuting, setSheetFlash, state } from "./state";
import { type AppMode, loadMode, saveMode } from "./mode";
import { getTheme, setTheme, type Theme, THEMES } from "./theme";
import { getLang, type Lang, onLangChange, setLang, t } from "./i18n";
import { cloneSheet } from "./util";
import { mountClaudeStart } from "./views/claudeStart";
import { mountExecute } from "./views/execute";
import { mountHome } from "./views/home";
import { mountLive } from "./views/live";
import { mountRecovery } from "./views/recovery";
import { mountSheet } from "./views/sheet";
import { mountStats } from "./views/stats";
import { mountTrain } from "./views/train";
import { mountWeekly } from "./views/weekly";

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

/** Same stroked glyph as navIcon, but under an arbitrary class (e.g. the gear). */
function glyph(cls: string, ...paths: string[]): SVGElement {
  const svg = navIcon(...paths);
  svg.setAttribute("class", cls);
  return svg;
}

interface NavItem {
  name: ViewName;
  label: string;
  icon: () => SVGElement;
}

const NAV_HOME: NavItem = {
  name: "home",
  label: "Home",
  icon: () => navIcon("M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5M9.5 20v-6h5v6"),
};
const NAV_TRAIN: NavItem = {
  name: "train",
  label: "Train",
  icon: () => navIcon("M2 10v4", "M5 7v10", "M19 7v10", "M22 10v4", "M5 12h14"),
};
const NAV_ROUTINES: NavItem = {
  name: "sheet",
  label: "Routines",
  icon: () => navIcon("M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"),
};
const NAV_STATS: NavItem = {
  name: "stats",
  label: "Stats",
  icon: () => navIcon("M4 20h16", "M7 20v-6", "M12 20V8", "M17 20v-9"),
};
const NAV_RECOVERY: NavItem = {
  name: "recovery",
  label: "Recovery",
  icon: () =>
    navIcon("M12 20s-6.5-4.2-6.5-8.5A3.5 3.5 0 0 1 12 8a3.5 3.5 0 0 1 6.5 3.5C18.5 15.8 12 20 12 20z"),
};

// Hard gate: each mode exposes only its audience's tabs. Student = the training
// surfaces; Trainer = routine authoring + sharing (the share flow lives inside
// Routines). Other views (live/execute/weekly/claudeStart) are reached via
// nav.go from inside these and map back onto a visible tab for highlighting.
const NAV_BY_MODE: Record<AppMode, ReadonlyArray<NavItem>> = {
  student: [NAV_HOME, NAV_TRAIN, NAV_STATS, NAV_RECOVERY],
  trainer: [NAV_HOME, NAV_ROUTINES],
};

/** Which visible tab a given view belongs under (for active-state highlighting). */
function tabForView(view: ViewName): ViewName {
  if (view === "live" || view === "execute") return "train";
  if (view === "weekly") return "stats";
  if (view === "claudeStart") return "home";
  return view;
}

/**
 * If the app was opened from a routine share link (`#routine=<base64url>`),
 * import the routine into the library, strip the token from the URL so a
 * refresh won't re-import, and return the view to land on (or null when there's
 * no link). A trainer lands on the authoring view to edit/save it; a student
 * lands on Train, where the freshly imported routine is ready to run. Phase 2
 * (Capacitor) will call importRoutineFromUrl the same way from an appUrlOpen
 * listener.
 */
function consumeSharedRoutine(mode: AppMode): ViewName | null {
  let sheet;
  try {
    sheet = importRoutineFromUrl(window.location.href);
  } catch (err) {
    // A token was present but unreadable — clear it and report on the Routines
    // view (the only flash surface; rare enough to accept in either mode).
    history.replaceState(null, "", urlWithoutRoutine(window.location.href));
    setSheetFlash(err instanceof Error ? err.message : "Couldn't open that routine link.", "err");
    return "sheet";
  }
  if (!sheet) return null;

  history.replaceState(null, "", urlWithoutRoutine(window.location.href));
  const stored = saveSheet(sheet);
  setEditingSheet(cloneSheet(stored));
  if (mode === "trainer") {
    setSheetFlash(`Imported "${stored.name}" from a shared link. Edit or save it here.`, "ok");
    return "sheet";
  }
  // Student: it's now in the library — land on Train to run it.
  return "train";
}

function boot(): void {
  const app = document.getElementById("app");
  if (!app) throw new Error("Missing #app root element.");

  let cleanup: Cleanup | null = null;
  let currentView: ViewName = "home";
  let mode: AppMode = loadMode();

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
          t(
            "A live session is in progress. Start a new one from this routine? Your current session is kept in the Live list.",
          ),
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
    highlightNav();

    clear(viewHost);
    let result: Cleanup | void;
    switch (view) {
      case "home":
        result = mountHome(viewHost, nav);
        break;
      case "train":
        result = mountTrain(viewHost, nav);
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
      case "weekly":
        result = mountWeekly(viewHost, nav);
        break;
      case "recovery":
        result = mountRecovery(viewHost, nav);
        break;
      case "claudeStart":
        result = mountClaudeStart(viewHost, nav);
        break;
    }
    cleanup = typeof result === "function" ? result : null;
    window.scrollTo(0, 0);
  }

  // Empty nav shell; renderNav() fills it with the current mode's tabs.
  const navRow = h("nav", { class: "nav", aria: { label: "Primary" } });

  function highlightNav(): void {
    const tab = tabForView(currentView);
    for (const [name, btn] of navButtons) {
      const active = name === tab;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-current", active ? "page" : "false");
    }
  }

  function renderNav(): void {
    clear(navRow);
    navButtons.clear();
    for (const item of NAV_BY_MODE[mode]) {
      const label = t(item.label);
      const btn = h("button", { class: "nav-btn", type: "button", aria: { label } }, [
        item.icon(),
        h("span", { class: "nav-label", text: label }),
      ]);
      btn.addEventListener("click", () => nav.go(item.name));
      navButtons.set(item.name, btn);
      navRow.appendChild(btn);
    }
    highlightNav();
  }

  // Mode toggle (Student / Trainer): a hard gate that swaps the whole surface.
  const modeButtons = new Map<AppMode, HTMLButtonElement>();
  function highlightMode(): void {
    for (const [m, btn] of modeButtons) {
      const active = m === mode;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    }
  }
  function setMode(next: AppMode): void {
    if (next === mode) return;
    mode = next;
    saveMode(next);
    highlightMode();
    renderNav();
    navigate(next === "trainer" ? "sheet" : "train");
  }
  const modeToggle = h(
    "div",
    { class: "mode-toggle", role: "group", aria: { label: "App mode" } },
    (["student", "trainer"] as const).map((m) => {
      const label = t(m === "student" ? "Student" : "Trainer");
      const btn = h("button", {
        class: "mode-toggle-btn",
        type: "button",
        text: label,
        aria: { label: `${label} mode` },
      });
      btn.addEventListener("click", () => setMode(m));
      modeButtons.set(m, btn);
      return btn;
    }),
  );
  /** Re-stamp the mode labels after a language change (the toggle itself stays). */
  function relabelMode(): void {
    for (const [m, btn] of modeButtons) {
      const label = t(m === "student" ? "Student" : "Trainer");
      btn.textContent = label;
      btn.setAttribute("aria-label", `${label} mode`);
    }
  }

  // Language toggle (EN / RO): mirrors the mode toggle's segmented stamp. The
  // codes are language-neutral, so only the active highlight changes on switch.
  let lang: Lang = getLang();
  const langButtons = new Map<Lang, HTMLButtonElement>();
  function highlightLang(): void {
    for (const [l, btn] of langButtons) {
      const active = l === lang;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    }
  }
  const langToggle = h(
    "div",
    { class: "mode-toggle lang-toggle", role: "group", aria: { label: "Language" } },
    (["en", "ro"] as const).map((l) => {
      const btn = h("button", {
        class: "mode-toggle-btn",
        type: "button",
        text: l === "en" ? "EN" : "RO",
        aria: { label: l === "en" ? "English" : "Română" },
      });
      btn.addEventListener("click", () => {
        if (l === lang) return;
        lang = l;
        setLang(l);
      });
      langButtons.set(l, btn);
      return btn;
    }),
  );

  // Theme toggle (Light / Dark / Blueprint / Riso): same segmented stamp.
  // Flipping the pinned theme is instant — every surface paints from CSS custom
  // properties — so unlike mode/language this needs no nav re-render or view
  // remount.
  const THEME_LABEL: Record<Theme, string> = {
    light: "Light",
    dark: "Dark",
    blueprint: "Blueprint",
    riso: "Riso",
  };
  let theme: Theme = getTheme();
  const themeButtons = new Map<Theme, HTMLButtonElement>();
  function highlightTheme(): void {
    for (const [tm, btn] of themeButtons) {
      const active = tm === theme;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    }
  }
  const themeToggle = h(
    "div",
    { class: "mode-toggle theme-toggle", role: "group", aria: { label: "Theme" } },
    THEMES.map((tm) => {
      const label = t(THEME_LABEL[tm]);
      const btn = h("button", {
        class: "mode-toggle-btn",
        type: "button",
        text: label,
        aria: { label: `${label} theme` },
      });
      btn.addEventListener("click", () => {
        if (tm === theme) return;
        theme = tm;
        setTheme(tm);
        highlightTheme();
      });
      themeButtons.set(tm, btn);
      return btn;
    }),
  );
  /** Re-stamp the theme labels after a language change (the toggle itself stays). */
  function relabelTheme(): void {
    for (const [tm, btn] of themeButtons) {
      const label = t(THEME_LABEL[tm]);
      btn.textContent = label;
      btn.setAttribute("aria-label", `${label} theme`);
    }
  }

  // Settings sheet — a gear in the masthead opens an overlay holding the cosmetic
  // preferences (language + theme), so the mobile header no longer stacks three
  // segmented controls above the fold. The Student/Trainer gate is a structural
  // switch, not a preference, so it stays inline in the masthead.
  const GEAR_RING = "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z";
  const GEAR_COG =
    "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z";

  const settingsBtn = h(
    "button",
    {
      class: "settings-btn",
      type: "button",
      aria: {
        label: "Settings",
        haspopup: "dialog",
        expanded: "false",
        controls: "settings-dialog",
      },
    },
    [glyph("settings-glyph", GEAR_RING, GEAR_COG)],
  );

  const settingsTitle = h("h2", {
    id: "settings-title",
    class: "settings-title",
    text: t("Settings"),
  });
  const closeBtn = h("button", {
    class: "settings-close",
    type: "button",
    text: "✕",
    aria: { label: t("Close") },
  });
  const langLabel = h("span", { class: "settings-label", text: t("Language") });
  const themeLabel = h("span", { class: "settings-label", text: t("Theme") });
  const dialog = h(
    "div",
    {
      id: "settings-dialog",
      class: "settings-dialog",
      role: "dialog",
      aria: { modal: "true", labelledby: "settings-title" },
    },
    [
      h("div", { class: "settings-head" }, [settingsTitle, closeBtn]),
      h("div", { class: "settings-row" }, [langLabel, langToggle]),
      h("div", { class: "settings-row" }, [themeLabel, themeToggle]),
    ],
  );
  const scrim = h("div", { class: "settings-scrim" }, [dialog]);

  let settingsOpen = false;
  let settingsReturnFocus: HTMLElement | null = null;
  function openSettings(): void {
    if (settingsOpen) return;
    settingsOpen = true;
    settingsReturnFocus = document.activeElement as HTMLElement | null;
    scrim.classList.add("is-open");
    settingsBtn.setAttribute("aria-expanded", "true");
    (dialog.querySelector<HTMLElement>("button:not(.settings-close)") ?? closeBtn).focus();
  }
  function closeSettings(): void {
    if (!settingsOpen) return;
    settingsOpen = false;
    scrim.classList.remove("is-open");
    settingsBtn.setAttribute("aria-expanded", "false");
    settingsReturnFocus?.focus();
  }
  settingsBtn.addEventListener("click", () => (settingsOpen ? closeSettings() : openSettings()));
  closeBtn.addEventListener("click", closeSettings);
  scrim.addEventListener("click", (e) => {
    if (e.target === scrim) closeSettings();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && settingsOpen) closeSettings();
  });
  // Trap Tab within the open dialog so focus can't wander to the page behind it.
  dialog.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    const focusables = [...dialog.querySelectorAll<HTMLElement>("button")];
    if (focusables.length === 0) return;
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
  /** Re-stamp the settings chrome after a language change. */
  function relabelSettings(): void {
    settingsTitle.textContent = t("Settings");
    langLabel.textContent = t("Language");
    themeLabel.textContent = t("Theme");
    closeBtn.setAttribute("aria-label", t("Close"));
    settingsBtn.setAttribute("aria-label", t("Settings"));
  }

  // A language switch re-renders all chrome and remounts the current view so the
  // freshly mounted DOM picks up the new strings (views read t() at mount time).
  onLangChange(() => {
    highlightLang();
    relabelMode();
    relabelTheme();
    relabelSettings();
    renderNav();
    navigate(currentView);
  });

  const header = h("header", { class: "app-header" }, [
    h("div", { class: "masthead" }, [
      h("button", {
        class: "brand",
        type: "button",
        text: "GYM LOG",
        aria: { label: "Gym Log home" },
        on: { click: () => nav.go("home") },
      }),
      settingsBtn,
    ]),
    modeToggle,
    navRow,
  ]);

  app.append(header, viewHost);
  document.body.append(scrim);
  highlightMode();
  highlightLang();
  highlightTheme();
  renderNav();
  navigate(consumeSharedRoutine(mode) ?? (mode === "trainer" ? "sheet" : "home"));
}

registerServiceWorker();
boot();
