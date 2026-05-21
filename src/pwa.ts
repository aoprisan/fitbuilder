/* PWA bootstrap. Registers the service worker on browsers, but skips
   registration inside Capacitor where the native shell already runs offline
   from bundled assets. A registered, fetch-handling worker plus the web
   manifest is what lets the browser offer its native "install app" prompt. */

declare global {
  interface Window {
    Capacitor?: { isNativePlatform: () => boolean };
  }
}

function isCapacitorNative(): boolean {
  try {
    return Boolean(window.Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}

export function registerServiceWorker(): void {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  if (isCapacitorNative()) return;
  if (!window.isSecureContext) return;

  // Resolve `sw.js` relative to the document base so it works whether the app
  // is served from a domain root, a sub-path, or `vite preview`.
  const baseEl = document.querySelector("base");
  const base = baseEl?.getAttribute("href") ?? "./";
  const swUrl = new URL("sw.js", new URL(base, window.location.href)).toString();

  window.addEventListener("load", () => {
    navigator.serviceWorker.register(swUrl).catch((err) => {
      console.warn("[gymlog] service worker registration failed", err);
    });
  });
}
