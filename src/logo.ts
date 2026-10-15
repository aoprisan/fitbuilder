/* =============================================================================
   Brand logo — a single PNG the user uploads once to brand every routine sheet.
   It's stored as a data URL in localStorage (this app has no backend), so it
   travels with the browser and is read directly by the sheet renderer and the
   on-screen views. Uploads are validated as PNG and downscaled so the stored
   bitmap stays small and crisp.
   ========================================================================== */

const KEY = "gymlog.logo";

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

function decode(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new LogoError("That image couldn't be decoded."));
    img.src = dataUrl;
  });
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
