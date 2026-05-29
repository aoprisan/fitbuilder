/* =============================================================================
   Theme — light / dark stock for the ledger. The colour ramps themselves live
   in styles.css (the `:root[data-theme="…"]` blocks); this module only decides
   which one is pinned and keeps the browser chrome (status-bar `theme-color`)
   in step.

   Stored in localStorage like the other global settings (mode, language). On
   first run, with nothing stored, we follow the OS preference. Once the user
   picks a theme it's pinned for good. Switching is instant — every surface is
   painted from CSS custom properties, so flipping `data-theme` on <html>
   recolours the whole app with no remount. (Canvas PNG/PDF exports are
   deliberately always cream stock, so they're unaffected — see canvasKit.ts.)

   To avoid a flash of the wrong theme before this module loads, index.html runs
   a tiny inline copy of `apply()` in <head>; keep the two in sync.
   ========================================================================== */

export type Theme = "light" | "dark";

const KEY = "gymlog.theme";

/** Status-bar / address-bar colour per theme (mirrors --paper in styles.css). */
const THEME_COLOR: Record<Theme, string> = {
  light: "#efe7d4",
  dark: "#14110b",
};

/** The OS-level preference, used as the default until the user pins a theme. */
function systemTheme(): Theme {
  try {
    return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

/** The active theme: the pinned choice, falling back to the OS preference. */
export function getTheme(): Theme {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // ignore — fall through to the system preference
  }
  return systemTheme();
}

/** Paint the theme: pin it on <html> and match the browser chrome to it. */
export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEME_COLOR[theme]);
}

/** Switch theme, persist the choice, and repaint. */
export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Best effort — the in-memory paint below still takes effect this session.
  }
  applyTheme(theme);
}
