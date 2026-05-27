/* Routine share links — the self-contained payload behind WhatsApp links and QR
   codes. A routine is encoded as base64url JSON in the URL *hash* (never sent to
   a server, so it survives GitHub Pages' static hosting and works offline once
   the app shell is cached). The routine *is* the payload: no backend lookup.

   This module is pure (encode/decode only). Delivery lives in exporters.ts
   (share sheet / clipboard) and consumption in main.ts (read at boot). Phase 2
   (Capacitor) reuses importRoutineFromUrl from an appUrlOpen listener — the
   format and validation are written once here. */

import { SheetValidationError, validateSheet } from "./sheetValidate";
import type { RoutineSheet } from "./types";
import { sheetToJson } from "./util";

/** Hash/query key carrying the encoded routine, e.g. `#routine=<base64url>`. */
const PARAM = "routine";

// btoa/atob only speak Latin-1, but routines carry UTF-8 (Romanian diacritics —
// "repetari", "împins"), so round-trip through TextEncoder/TextDecoder. base64url
// (-/_ , no = padding) keeps the token URL-safe with no percent-escaping.
function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(token: string): string {
  const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64.padEnd(Math.ceil(b64.length / 4) * 4, "=");
  const bytes = Uint8Array.from(atob(padded), (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** The running app's URL with any hash/query stripped — the base for share links. */
function appBaseUrl(): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}`;
}

/** Pull the routine token from a URL's hash (preferred) or query, or null if absent. */
function extractToken(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const fromHash = new URLSearchParams(url.hash.replace(/^#/, "")).get(PARAM);
  return fromHash !== null && fromHash !== "" ? fromHash : url.searchParams.get(PARAM);
}

/**
 * Encode a routine sheet into a shareable link, e.g.
 * `https://host/app/#routine=<base64url>`. The token lives in the hash so it
 * never hits the server and the recipient can open it offline.
 */
export function encodeRoutineLink(sheet: RoutineSheet, base: string = appBaseUrl()): string {
  const url = new URL(base);
  url.hash = `${PARAM}=${toBase64Url(sheetToJson(sheet))}`;
  return url.toString();
}

/**
 * Read a routine out of a share link. Returns null when the URL carries no
 * routine token (so the caller can do nothing), and throws SheetValidationError
 * when a token is present but corrupt/incomplete. Validation is the same gate
 * used for localStorage and Claude paste, so the imported sheet is trustworthy.
 */
export function importRoutineFromUrl(href: string): RoutineSheet | null {
  const token = extractToken(href);
  if (token === null) return null;

  let json: string;
  try {
    json = fromBase64Url(token);
  } catch {
    throw new SheetValidationError("That routine link is corrupted or incomplete.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new SheetValidationError("That routine link is corrupted or incomplete.");
  }

  return validateSheet(parsed);
}

/** Strip the routine token from a URL so a page refresh won't re-import it. */
export function urlWithoutRoutine(href: string): string {
  try {
    const url = new URL(href);
    url.hash = "";
    url.searchParams.delete(PARAM);
    return url.toString();
  } catch {
    return href;
  }
}
