import {
  APP_URL,
  C,
  CW,
  DISPLAY,
  drawFooter,
  ensureFonts,
  MONO,
  PAD,
  paintPage,
  roundRect,
  W,
  wrap,
  type Ctx,
} from "./canvasKit";

/* Renders a small branded "share the app" card: the Gym Log barbell mark, the
   app name, a one-line pitch, and the install URL. Same "Training Ledger" visual
   language as the routine/recap/stats exports, so an invite reads like a page
   from the same letterpress ledger. Dependency free — the app mark is the
   bundled favicon, inlined as an SVG data URL and drawn straight to the canvas. */

// The app mark — kept in sync with public/favicon.svg. Inlined so the renderer
// needs no network fetch and the PNG export stays deterministic.
const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#1b1610"/>
  <line x1="176" y1="256" x2="336" y2="256" stroke="#efe7d4" stroke-width="34" stroke-linecap="round"/>
  <rect x="92" y="196" width="50" height="120" rx="10" fill="#d6422b"/>
  <rect x="370" y="196" width="50" height="120" rx="10" fill="#d6422b"/>
  <rect x="148" y="214" width="34" height="84" rx="8" fill="#efe7d4"/>
  <rect x="330" y="214" width="34" height="84" rx="8" fill="#efe7d4"/>
</svg>`;

const ICON = 132;
const TAGLINE =
  "A vintage training ledger — log live workouts set by set, and build shareable routines.";

/** Decode the inlined app mark into an <img> ready for canvas drawing. */
function loadIcon(): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load the app icon."));
    img.src = `data:image/svg+xml;utf8,${encodeURIComponent(ICON_SVG)}`;
  });
}

/** Lay out (and optionally paint) the share card; returns total logical height. */
function drawCard(ctx: Ctx, icon: HTMLImageElement, paint: boolean): number {
  const cx = W / 2;
  let y = PAD + 6;
  ctx.textBaseline = "top";
  ctx.textAlign = "center";

  // Eyebrow.
  ctx.font = `700 12px ${MONO}`;
  if (paint) {
    ctx.fillStyle = C.brick;
    ctx.fillText("GYM LOG · TRAINING LEDGER", cx, y);
  }
  y += 30;

  // App mark, centred.
  if (paint) ctx.drawImage(icon, cx - ICON / 2, y, ICON, ICON);
  y += ICON + 22;

  // App name.
  ctx.font = `400 52px ${DISPLAY}`;
  if (paint) {
    ctx.fillStyle = C.ink;
    ctx.fillText("GYM LOG", cx, y);
  }
  y += 58;

  // Signal-red rule, centred.
  if (paint) {
    ctx.fillStyle = C.signal;
    ctx.fillRect(cx - 60, y, 120, 6);
  }
  y += 24;

  // Tagline.
  ctx.font = `400 15px ${MONO}`;
  for (const ln of wrap(ctx, TAGLINE, CW - 60)) {
    if (paint) {
      ctx.fillStyle = C.inkSoft;
      ctx.fillText(ln, cx, y);
    }
    y += 22;
  }
  y += 16;

  // Install-URL pill.
  ctx.font = `700 15px ${MONO}`;
  const url = APP_URL.toUpperCase();
  const pillW = Math.min(CW, ctx.measureText(url).width + 44);
  const pillH = 40;
  if (paint) {
    roundRect(ctx, cx - pillW / 2, y, pillW, pillH, pillH / 2);
    ctx.fillStyle = C.chipBg;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = C.mustard;
    ctx.stroke();
    ctx.fillStyle = C.brick;
    ctx.textBaseline = "middle";
    ctx.fillText(url, cx, y + pillH / 2 + 1);
    ctx.textBaseline = "top";
  }
  y += pillH + 24;

  // Back to the shared footer (which paints left/right-aligned text itself).
  ctx.textAlign = "left";
  return drawFooter(ctx, y, "GYM LOG — SCAN THE LINK, START TRAINING", paint);
}

/** Render the app-invite card to a freshly created (high-DPI) canvas. */
export async function renderAppCardToCanvas(): Promise<HTMLCanvasElement> {
  await ensureFonts();
  const icon = await loadIcon();
  return paintPage((ctx, paint) => drawCard(ctx, icon, paint));
}
