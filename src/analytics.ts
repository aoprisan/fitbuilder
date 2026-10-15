/* Privacy-first, cookieless demand-signal tracking.
 *
 * This is NOT a backend and NOT a tracking profile: it posts an anonymous,
 * no-PII event ping to a Plausible-compatible endpoint so we can answer one
 * question while validating the product — "is anyone actually using this?".
 *
 * Design rules (in keeping with the app's offline-first, "your data stays on
 * your device" promise):
 *  - Disabled unless a domain is configured (`VITE_PLAUSIBLE_DOMAIN`), so the
 *    open-source build and any fork stay silent by default.
 *  - Never runs in the native (Capacitor) app, whatever the build config: the
 *    Play listing's Data safety answers and the privacy policy promise the app
 *    makes no third-party requests. Only the hosted web build can ping.
 *  - No cookies, no localStorage, no device/user identifiers — Plausible's
 *    model is cookieless by design.
 *  - Honours Do-Not-Track and Global Privacy Control.
 *  - Never sends the URL hash (it holds in-app navigation state, not a page).
 *  - No-op on localhost so dev sessions don't pollute the numbers.
 *  - Fully fire-and-forget: a failed/blocked/offline request never throws into
 *    the app, and `keepalive` lets the last ping flush during navigation.
 *
 * Configure by setting `VITE_PLAUSIBLE_DOMAIN` (and optionally
 * `VITE_PLAUSIBLE_ENDPOINT`) at build time — see `.env.example`.
 */

import { Capacitor } from "@capacitor/core";

const DOMAIN = import.meta.env.VITE_PLAUSIBLE_DOMAIN;
const ENDPOINT = import.meta.env.VITE_PLAUSIBLE_ENDPOINT ?? "https://plausible.io/api/event";

/** Event metadata — keep these to non-PII facets (format, mode, view name, …). */
export type TrackProps = Record<string, string | number | boolean>;

function isOptedOut(): boolean {
  const nav = navigator as Navigator & { doNotTrack?: string; globalPrivacyControl?: boolean };
  const win = window as Window & { doNotTrack?: string };
  return nav.doNotTrack === "1" || win.doNotTrack === "1" || nav.globalPrivacyControl === true;
}

/**
 * Record an anonymous product event. Safe to call from anywhere — it silently
 * does nothing when analytics is unconfigured, opted out of, or running locally.
 */
export function track(event: string, props?: TrackProps): void {
  try {
    if (!DOMAIN) return;
    if (Capacitor.isNativePlatform()) return;
    if (typeof window === "undefined" || typeof navigator === "undefined") return;
    if (isOptedOut()) return;

    const host = window.location.hostname;
    if (!host || host === "localhost" || host === "127.0.0.1") return;

    // Drop the hash and query: nothing beyond origin + path is needed to tell
    // pages apart, and nothing else should leave the device.
    const url = window.location.origin + window.location.pathname;
    const body = JSON.stringify({
      name: event,
      url,
      domain: DOMAIN,
      ...(props ? { props } : {}),
    });

    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {
      /* offline / blocked — analytics is best-effort only */
    });
  } catch {
    /* analytics must never break the app */
  }
}
