import "./styles.css";
import { track } from "./analytics";
import { backupFilename, buildBackup, restoreBackup } from "./backup";
import { latestBodyweight, logBodyweight } from "./bodyweightStore";
import { clear, h } from "./dom";
import { forceAppUpdate, registerServiceWorker } from "./pwa";
import type { Cleanup, Nav, ViewName } from "./router";
import { getTheme, setTheme, type Theme, THEMES } from "./theme";
import { getLang, type Lang, onLangChange, registerTranslations, setLang, t } from "./i18n";
import { formatSessionDate } from "./util";
import { mountBody } from "./views/body";
import { mountExercise } from "./views/exercise";
import { mountHistory } from "./views/history";
import { mountLive } from "./views/live";
import { dismissSnackbar } from "./views/snackbar";

// Chrome strings — the tab bar and the Settings sheet (device maintenance,
// backup, bodyweight and the about block).
registerTranslations({
  Body: "Corp",
  Train: "Antrenament",
  History: "Istoric",
  "Update app": "Actualizează aplicația",
  "Update app to the latest version": "Actualizează aplicația la cea mai recentă versiune",
  "Updating…": "Se actualizează…",
  Updates: "Actualizări",
  "Build {0}": "Versiune {0}",
  Data: "Date",
  "Clear all saved data": "Șterge toate datele salvate",
  "Permanently delete every logged session, personal record and setting stored on this device. This cannot be undone.":
    "Șterge definitiv fiecare sesiune înregistrată, record personal și setare stocate pe acest dispozitiv. Această acțiune nu poate fi anulată.",
  "Delete all saved data on this device? This permanently removes every logged session, personal record and setting, and cannot be undone.":
    "Ștergi toate datele salvate pe acest dispozitiv? Aceasta elimină definitiv fiecare sesiune înregistrată, record personal și setare și nu poate fi anulată.",
  Backup: "Copie de rezervă",
  "Save everything stored on this device — sessions, records and settings — as one file, or restore a backup file (e.g. on a new phone).":
    "Salvează tot ce este stocat pe acest dispozitiv — sesiuni, recorduri și setări — într-un singur fișier, sau restaurează o copie de rezervă (de ex. pe un telefon nou).",
  "Download backup": "Descarcă copia de rezervă",
  "Restore backup": "Restaurează copia",
  "Restore this backup? Sessions, records and settings in the file will replace this device's copies.":
    "Restaurezi această copie de rezervă? Sesiunile, recordurile și setările din fișier vor înlocui copiile de pe acest dispozitiv.",
  "That file is not a Gym Log backup.": "Acel fișier nu este o copie de rezervă Gym Log.",
  Bodyweight: "Greutate corporală",
  "Your bodyweight sharpens the protein and calorie estimates.":
    "Greutatea ta corporală îmbunătățește estimările de proteine și calorii.",
  "Bodyweight (kg)": "Greutate corporală (kg)",
  Save: "Salvează",
  "Saved.": "Salvat.",
});

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

// The three tabs of the readiness-first shell: Body (the fatigue map home),
// Train (the live logger) and History (past sessions + Claude analysis).
// Exercise detail is a pushed screen reached from History and the picker.
const NAV_ITEMS: ReadonlyArray<NavItem> = [
  {
    name: "body",
    label: "Body",
    icon: () =>
      navIcon("M12 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z", "M12 9v6M8 12h8M12 15l-3.5 6M12 15l3.5 6"),
  },
  {
    name: "live",
    label: "Train",
    icon: () => navIcon("M2 10v4", "M5 7v10", "M19 7v10", "M22 10v4", "M5 12h14"),
  },
  {
    name: "history",
    label: "History",
    icon: () => navIcon("M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M12 7v5l3.5 2"),
  },
];

/** Which visible tab a given view belongs under (for active-state highlighting). */
function tabForView(view: ViewName): ViewName {
  if (view === "exercise") return "history";
  return view;
}

function boot(): void {
  const app = document.getElementById("app");
  if (!app) throw new Error("Missing #app root element.");

  let cleanup: Cleanup | null = null;
  let currentView: ViewName = "body";

  const viewHost = h("main", { class: "view-host", id: "view" });

  const navButtons = new Map<ViewName, HTMLButtonElement>();

  // Every view name navigate() can mount — the whitelist popstate restores from,
  // so a stale or foreign history entry can never mount an unknown view.
  const ALL_VIEWS: ReadonlyArray<ViewName> = ["body", "live", "history", "exercise"];

  const nav: Nav = {
    go: (view) => navigate(view),
  };

  function navigate(view: ViewName, opts?: { push?: boolean }): void {
    // Record each screen change as a history entry so the browser / Android
    // hardware back button walks back through views instead of exiting the app.
    // Re-selecting the current view replaces its entry (no self-stacking), and
    // popstate-driven navigation passes push:false so restoring doesn't re-push.
    if (opts?.push !== false) {
      if (view === currentView) history.replaceState({ view }, "");
      else history.pushState({ view }, "");
    }
    // A pending Undo belongs to the view that offered it — leaving commits it.
    dismissSnackbar();
    if (cleanup) {
      cleanup();
      cleanup = null;
    }
    currentView = view;
    highlightNav();
    track("view", { name: view });

    clear(viewHost);
    let result: Cleanup | void;
    switch (view) {
      case "body":
        result = mountBody(viewHost, nav);
        break;
      case "live":
        result = mountLive(viewHost, nav);
        break;
      case "history":
        result = mountHistory(viewHost, nav);
        break;
      case "exercise":
        result = mountExercise(viewHost, nav);
        break;
    }
    cleanup = typeof result === "function" ? result : null;
    window.scrollTo(0, 0);
  }

  // Empty nav shell; renderNav() fills it with the tabs.
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
    for (const item of NAV_ITEMS) {
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

  // Language toggle (EN / RO): a segmented stamp in the Settings sheet. The
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
  // properties — so unlike language this needs no nav re-render or view remount.
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

  // Settings sheet — a gear in the masthead opens an overlay holding the
  // preferences (language + theme), bodyweight, updates, backup and data tools.
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
  const aboutLabel = h("span", { class: "settings-label", text: t("About") });
  const DISCLAIMER =
    "Gym Log is for general fitness tracking only — not medical advice. Train within your limits and check with a professional before starting a new program.";
  const disclaimer = h("p", { class: "settings-disclaimer", text: t(DISCLAIMER) });
  const privacyLink = h("a", {
    class: "settings-link",
    href: "./privacy.html",
    target: "_blank",
    rel: "noopener",
    text: t("Privacy"),
  });
  const termsLink = h("a", {
    class: "settings-link",
    href: "./terms.html",
    target: "_blank",
    rel: "noopener",
    text: t("Terms"),
  });

  // Bodyweight — sharpens the protein/calorie estimates on session summaries.
  const bodyweightLabel = h("span", { class: "settings-label", text: t("Bodyweight") });
  const bodyweightDesc = h("p", {
    class: "settings-disclaimer",
    text: t("Your bodyweight sharpens the protein and calorie estimates."),
  });
  const bodyweightInput = h("input", {
    class: "plan-name-input oneRm-input",
    type: "number",
    inputmode: "decimal",
    min: "0",
    step: "0.5",
    value: latestBodyweight() ? String(latestBodyweight()!.kg) : "",
    placeholder: "kg",
    aria: { label: t("Bodyweight (kg)") },
  });
  const bodyweightStatus = h("p", { class: "settings-disclaimer" });
  const bodyweightSave = h("button", {
    class: "btn btn-small",
    type: "button",
    text: t("Save"),
  });
  bodyweightSave.addEventListener("click", () => {
    const kg = Number(bodyweightInput.value);
    if (!Number.isFinite(kg) || kg <= 0) return;
    logBodyweight(kg);
    bodyweightStatus.textContent = t("Saved.");
  });

  // Updates — pull the latest build and refresh this installed copy.
  const updatesLabel = h("span", { class: "settings-label", text: t("Updates") });
  const updateBtn = h("button", {
    class: "btn btn-small",
    type: "button",
    text: t("Update app"),
    aria: { label: t("Update app to the latest version") },
  });
  updateBtn.addEventListener("click", () => {
    updateBtn.disabled = true;
    updateBtn.textContent = t("Updating…");
    void forceAppUpdate();
  });
  const buildStamp = h("p", {
    class: "settings-disclaimer settings-build",
    text: t("Build {0}").replace("{0}", formatSessionDate(__BUILD_TIME__)),
  });

  // Backup — download every gymlog.* entry as one JSON file, or restore one.
  const backupLabel = h("span", { class: "settings-label", text: t("Backup") });
  const backupDesc = h("p", {
    class: "settings-disclaimer",
    text: t(
      "Save everything stored on this device — sessions, records and settings — as one file, or restore a backup file (e.g. on a new phone).",
    ),
  });
  const backupBtn = h("button", {
    class: "btn btn-small",
    type: "button",
    text: t("Download backup"),
  });
  backupBtn.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(buildBackup(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = h("a", { href: url, download: backupFilename() });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    track("backup", { action: "download" });
  });
  const restoreInput = h("input", { type: "file", accept: "application/json,.json" });
  restoreInput.style.display = "none";
  const restoreBtn = h("button", {
    class: "btn btn-small",
    type: "button",
    text: t("Restore backup"),
  });
  restoreBtn.addEventListener("click", () => restoreInput.click());
  restoreInput.addEventListener("change", () => {
    const file = restoreInput.files?.[0];
    restoreInput.value = ""; // allow re-picking the same file after a failed try
    if (!file) return;
    if (
      !confirm(
        t(
          "Restore this backup? Sessions, records and settings in the file will replace this device's copies.",
        ),
      )
    )
      return;
    void file.text().then((text) => {
      try {
        restoreBackup(text);
      } catch {
        alert(t("That file is not a Gym Log backup."));
        return;
      }
      track("backup", { action: "restore" });
      window.location.reload(); // every store re-reads (and re-validates) on boot
    });
  });

  // Data — wipe everything this app stored on the device (all gymlog.* keys).
  const dataLabel = h("span", { class: "settings-label", text: t("Data") });
  const clearDataDesc = h("p", {
    class: "settings-disclaimer",
    text: t(
      "Permanently delete every logged session, personal record and setting stored on this device. This cannot be undone.",
    ),
  });
  const clearDataBtn = h("button", {
    class: "btn btn-small danger",
    type: "button",
    text: t("Clear all saved data"),
  });
  clearDataBtn.addEventListener("click", () => {
    if (
      !confirm(
        t(
          "Delete all saved data on this device? This permanently removes every logged session, personal record and setting, and cannot be undone.",
        ),
      )
    )
      return;
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("gymlog.")) localStorage.removeItem(key);
    }
    window.location.reload();
  });

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
      h("div", { class: "settings-row" }, [
        bodyweightLabel,
        bodyweightDesc,
        h("div", { class: "settings-links" }, [bodyweightInput, bodyweightSave]),
        bodyweightStatus,
      ]),
      h("div", { class: "settings-row" }, [updatesLabel, updateBtn, buildStamp]),
      h("div", { class: "settings-row" }, [
        backupLabel,
        backupDesc,
        h("div", { class: "settings-links" }, [backupBtn, restoreBtn]),
        restoreInput,
      ]),
      h("div", { class: "settings-row" }, [dataLabel, clearDataDesc, clearDataBtn]),
      h("div", { class: "settings-row" }, [
        aboutLabel,
        disclaimer,
        h("div", { class: "settings-links" }, [privacyLink, termsLink]),
      ]),
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
    bodyweightLabel.textContent = t("Bodyweight");
    bodyweightDesc.textContent = t("Your bodyweight sharpens the protein and calorie estimates.");
    bodyweightSave.textContent = t("Save");
    updatesLabel.textContent = t("Updates");
    // Leave the button reading "Updating…" if an update is mid-flight.
    if (!updateBtn.disabled) updateBtn.textContent = t("Update app");
    updateBtn.setAttribute("aria-label", t("Update app to the latest version"));
    buildStamp.textContent = t("Build {0}").replace("{0}", formatSessionDate(__BUILD_TIME__));
    dataLabel.textContent = t("Data");
    clearDataDesc.textContent = t(
      "Permanently delete every logged session, personal record and setting stored on this device. This cannot be undone.",
    );
    clearDataBtn.textContent = t("Clear all saved data");
    aboutLabel.textContent = t("About");
    disclaimer.textContent = t(DISCLAIMER);
    privacyLink.textContent = t("Privacy");
    termsLink.textContent = t("Terms");
    closeBtn.setAttribute("aria-label", t("Close"));
    settingsBtn.setAttribute("aria-label", t("Settings"));
  }

  // A language switch re-renders all chrome and remounts the current view so the
  // freshly mounted DOM picks up the new strings (views read t() at mount time).
  onLangChange(() => {
    highlightLang();
    relabelTheme();
    relabelSettings();
    renderNav();
    navigate(currentView, { push: false });
  });

  const header = h("header", { class: "app-header" }, [
    h("div", { class: "masthead" }, [
      h("button", {
        class: "brand",
        type: "button",
        text: "GYM LOG",
        aria: { label: "Gym Log home" },
        on: { click: () => nav.go("body") },
      }),
      settingsBtn,
    ]),
    navRow,
  ]);

  // Browser / hardware back: restore the view stamped on the history entry.
  // Views re-read their data from `state` and storage on mount, so remounting
  // from a popped entry is always safe.
  window.addEventListener("popstate", (e) => {
    const view = (e.state as { view?: unknown } | null)?.view;
    if (typeof view === "string" && (ALL_VIEWS as readonly string[]).includes(view)) {
      navigate(view as ViewName, { push: false });
    }
  });

  app.append(header, viewHost);
  document.body.append(scrim);
  highlightLang();
  highlightTheme();
  renderNav();
  const initialView: ViewName = "body";
  navigate(initialView, { push: false });
  // Stamp the first history entry with its view so backing all the way up
  // still restores a known screen (instead of a null state).
  history.replaceState({ view: initialView }, "");
  track("pageview");
}

registerServiceWorker();
boot();
