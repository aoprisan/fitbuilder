/**
 * Copy text to the clipboard. In the native app this goes through
 * `@capacitor/clipboard`: Android's WebView often refuses
 * `navigator.clipboard.writeText` (NotAllowedError), which left the Claude
 * photo handoff with nothing to paste. In a browser it's the Async Clipboard
 * API, falling back to a hidden textarea + `execCommand("copy")` for older
 * webviews. The plugin is lazy-loaded and boxed (Capacitor plugins are
 * thenable Proxies — see CLAUDE.md, Gotchas).
 */
import { Capacitor } from "@capacitor/core";

function execCopy(text: string): boolean {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export async function copyText(text: string): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { cb } = await import("@capacitor/clipboard").then((m) => ({ cb: m.Clipboard }));
      await cb.write({ string: text });
      return true;
    } catch {
      // plugin missing in an old native build — try the web paths
    }
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // denied (no focus / no permission) — fall through
  }
  return execCopy(text);
}

export const canReadClipboard = (): boolean =>
  Capacitor.isNativePlatform() ||
  (typeof navigator !== "undefined" && typeof navigator.clipboard?.readText === "function");

/** Read the clipboard's text; rejects when it's blocked or holds no text. */
export async function readText(): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { cb } = await import("@capacitor/clipboard").then((m) => ({ cb: m.Clipboard }));
      const { type, value } = await cb.read();
      if (type.startsWith("text") || type === "string") return value;
    } catch {
      // fall through to the web API
    }
  }
  return navigator.clipboard.readText();
}
