/* =============================================================================
   Brand logo — a single PNG the user uploads once to brand every routine sheet.
   It's stored as a data URL in localStorage (this app has no backend), so it
   travels with the browser and is read directly by the sheet renderer and the
   on-screen views. Uploads are validated as PNG and downscaled so the stored
   bitmap stays small and crisp.
   ========================================================================== */

const KEY = "gymlog.logo";

/** Longest-edge cap for the stored logo bitmap — keeps localStorage small and
    the data URL light enough to embed in every shared sheet. */
const MAX_EDGE = 600;

/** Reject obviously oversized uploads before we bother decoding them. */
const MAX_FILE_BYTES = 8 * 1024 * 1024;

/** Thrown when an upload can't be used as a logo (wrong type, too big, etc.). */
export class LogoError extends Error {
  override name = "LogoError";
}

/** The stored brand-logo data URL, or null when none is set. */
export function loadLogo(): string | null {
  try {
    const value = localStorage.getItem(KEY);
    return value && value.startsWith("data:image/") ? value : null;
  } catch {
    return null;
  }
}

/** Persist a logo data URL. Throws (e.g. on quota) so callers can report it. */
export function saveLogo(dataUrl: string): void {
  try {
    localStorage.setItem(KEY, dataUrl);
  } catch {
    throw new LogoError("Couldn't save the logo — it may be too large for this browser.");
  }
}

/** Forget the stored logo. */
export function clearLogo(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing more we can do; a stale logo is harmless.
  }
}

function decode(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new LogoError("That image couldn't be decoded."));
    img.src = dataUrl;
  });
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new LogoError("Couldn't read that file."));
    reader.readAsDataURL(file);
  });
}

/**
 * Validate and normalize an uploaded PNG into a stored-ready data URL: PNG only,
 * downscaled so its longest edge is at most MAX_EDGE (transparency preserved).
 * Returns the original data URL untouched when it's already small enough.
 */
export async function fileToLogoDataUrl(file: File): Promise<string> {
  if (file.type !== "image/png") throw new LogoError("Please choose a PNG image.");
  if (file.size > MAX_FILE_BYTES) throw new LogoError("That PNG is too large (max 8 MB).");

  const raw = await readAsDataUrl(file);
  const img = await decode(raw);
  const { naturalWidth: w, naturalHeight: h } = img;
  if (w === 0 || h === 0) throw new LogoError("That image looks empty.");

  const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  if (scale === 1) return raw; // Already within bounds — store as-is.

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return raw; // Can't downscale here — fall back to the original.
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

/** Load the stored logo as an <img> ready for canvas drawing, or null. */
export async function loadLogoImage(): Promise<HTMLImageElement | null> {
  const url = loadLogo();
  if (!url) return null;
  try {
    return await decode(url);
  } catch {
    return null;
  }
}
