#!/usr/bin/env node
// Google Play store graphics, generated from the real app so they never drift
// from what ships:
//
//   images/icon.png                512×512 hi-res icon (full-bleed; Play masks it)
//   images/featureGraphic.jpg      1024×500 feature graphic
//   images/phoneScreenshots/*.jpg  1080×1920 captioned phone screenshots
//
// written per locale (en-US, ro) under fastlane/metadata/android/, where
// `fastlane supply` picks them up. The app is built, served with `vite
// preview`, seeded with a few weeks of believable training (localStorage only —
// nothing personal), and driven with Playwright.
//
//   npm run play:assets               # build + generate everything
//   npm run play:assets -- --no-build # reuse the existing dist/
//
// Needs Playwright with Chromium: `npm i -D playwright && npx playwright install chromium`
// (a globally installed Playwright works too).
import { spawn, execSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const META = join(ROOT, "fastlane/metadata/android");
const PORT = 4317;
const BASE = `http://localhost:${PORT}/`;

// ── Playwright (local dev dependency, else a global install) ────────────────
async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    try {
      const globalRoot = execSync("npm root -g").toString().trim();
      return createRequire(join(globalRoot, "noop.js"))("playwright");
    } catch {
      console.error("Playwright not found. Install it: npm i -D playwright && npx playwright install chromium");
      process.exit(1);
    }
  }
}

// ── Copy (store captions + feature-graphic lines), per Play locale ──────────
const LOCALES = {
  "en-US": {
    lang: "en",
    tagline: "Recovery-aware lifting log",
    sub: "Offline · No account · No ads",
    shots: [
      ["Know what's recovered", "before you pick what to train"],
      ["Know what to expect", "after the sets you've already done"],
      ["Log every set", "with one thumb"],
      ["Every session, read back", "effort, hydration and protein"],
      ["Watch your strength grow", "estimated 1RM per exercise"],
    ],
  },
  ro: {
    lang: "ro",
    tagline: "Jurnal de forță cu recuperare",
    sub: "Offline · Fără cont · Fără reclame",
    shots: [
      ["Vezi ce s-a refăcut", "înainte să alegi ce antrenezi"],
      ["Știi ce să aștepți", "după seturile deja făcute"],
      ["Notezi fiecare set", "cu un singur deget"],
      ["Fiecare sesiune, recitită", "efort, hidratare și proteine"],
      ["Vezi cum crește forța", "1RM estimat pe exercițiu"],
    ],
  },
};

// ── Seed data: ~4 weeks of push / pull / legs with steady progression ───────
const MOVES = {
  bench: { name: "Bench Press", muscle: "chest", equipment: "barbell", exerciseId: "bench-press", secondaryMuscles: ["triceps", "front-delts"] },
  incline: { name: "Incline Bench Press", muscle: "chest", equipment: "barbell", exerciseId: "incline-bench-press", secondaryMuscles: ["front-delts", "triceps"] },
  fly: { name: "Chest Fly Machine", muscle: "chest", equipment: "machine", exerciseId: "chest-fly-machine", secondaryMuscles: [] },
  ohp: { name: "Overhead Press", muscle: "front-delts", equipment: "barbell", exerciseId: "overhead-press", secondaryMuscles: ["side-delts", "triceps"] },
  lateral: { name: "Dumbbell Lateral Raise", muscle: "side-delts", equipment: "dumbbell", exerciseId: "dumbbell-lateral-raise", secondaryMuscles: [] },
  pulldown: { name: "Pronated Grip Pulldown", muscle: "back", equipment: "lat-pulldown", exerciseId: "pronated-grip-pulldown", secondaryMuscles: ["biceps", "forearms"] },
  row: { name: "Cable Row Machine", muscle: "back", equipment: "cable", exerciseId: "cable-row", secondaryMuscles: ["biceps", "traps", "rear-delts"] },
  facepull: { name: "Face Pull", muscle: "rear-delts", equipment: "cable", exerciseId: "face-pull", secondaryMuscles: ["traps"] },
  curl: { name: "Wall Barbell Curl", muscle: "biceps", equipment: "barbell", exerciseId: "wall-barbell-curl", secondaryMuscles: [] },
  squat: { name: "Barbell Squat", muscle: "legs", equipment: "barbell", exerciseId: "barbell-squat", secondaryMuscles: ["glutes", "lower-back"] },
  rdl: { name: "Romanian Deadlift", muscle: "legs", equipment: "barbell", exerciseId: "romanian-deadlift", secondaryMuscles: ["glutes", "lower-back"] },
  legpress: { name: "Leg Press", muscle: "legs", equipment: "machine", exerciseId: "leg-press", secondaryMuscles: [] },
  calf: { name: "Standing Calf Raise", muscle: "calves", equipment: "machine", exerciseId: "calf-raise", secondaryMuscles: [] },
};

// [move, sets, reps, start kg, kg added per week]
const DAYS = {
  push: [["bench", 4, 8, 70, 2.5], ["incline", 3, 10, 55, 2.5], ["fly", 3, 12, 45, 2.5], ["ohp", 3, 8, 40, 1.25], ["lateral", 3, 14, 10, 0.5]],
  pull: [["pulldown", 4, 10, 60, 2.5], ["row", 4, 10, 55, 2.5], ["facepull", 3, 15, 20, 1.25], ["curl", 3, 10, 27.5, 1.25]],
  legs: [["squat", 4, 6, 90, 2.5], ["rdl", 3, 8, 80, 2.5], ["legpress", 3, 12, 160, 5], ["calf", 4, 12, 70, 2.5]],
};

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const roundTo = (kg, step) => Math.round(kg / step) * step;

function exercise(key, sets, reps, kg, rirs) {
  return {
    ...MOVES[key],
    sets: Array.from({ length: sets }, (_, i) => ({
      reps: Math.max(1, reps - (i >= sets - 1 ? 1 : 0)),
      weightKg: kg,
      durationSec: 35 + reps * 3,
      ...(rirs ? { rir: Math.max(0, 3 - i) } : {}),
    })),
  };
}

function seed(now) {
  const sessions = [];
  const order = ["push", "pull", "legs"];
  let n = 1;
  // Every other day for four weeks, oldest first; yesterday was pull.
  for (let daysAgo = 27, i = 0; daysAgo >= 1; daysAgo -= 2, i++) {
    const day = order[(i + 1) % 3];
    const week = (27 - daysAgo) / 7;
    const start = new Date(now - daysAgo * 86400000);
    start.setHours(18, 10, 0, 0);
    const exercises = DAYS[day].map(([key, sets, reps, kg, perWeek]) =>
      exercise(key, sets, reps, roundTo(kg + perWeek * Math.floor(week), MOVES[key].equipment === "dumbbell" ? 2 : 2.5), i % 2 === 0),
    );
    sessions.push({
      schema: "gymlog.training-session",
      version: 1,
      id: uuid(n++),
      name: day[0].toUpperCase() + day.slice(1) + " day",
      startedAt: start.toISOString(),
      endedAt: new Date(start.getTime() + 62 * 60000).toISOString(),
      startFatigue: 2,
      source: "live",
      exercises,
    });
  }
  // Today: push day in progress — five sets of bench and three of incline done,
  // flies next (the case the "expected now" card is about).
  const today = new Date(now - 38 * 60000);
  const active = {
    schema: "gymlog.training-session",
    version: 1,
    id: uuid(999),
    name: "Push day",
    startedAt: today.toISOString(),
    startFatigue: 2,
    source: "live",
    exercises: [exercise("bench", 5, 8, 80, true), exercise("incline", 3, 10, 62.5, true)],
  };
  return { sessions: [...sessions, active], active };
}

function progressFor(active, sub) {
  return {
    sessionId: active.id,
    stage: "exercise",
    sub,
    muscle: "chest",
    equipment: "machine",
    movementId: "chest-fly-machine",
    selectMode: "custom",
    hasCurrentEx: false,
    setReps: 12,
    setWeight: 50,
    setHoldSec: 0,
    setDistanceKm: 0,
    setSpeedKmh: 0,
    setInclinePct: 0,
    setRir: null,
    setType: null,
    setStartEpoch: 0,
    setElapsedMs: 41000,
    restStartEpoch: 0,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error(`preview server did not start at ${url}`);
}

const FONTS =
  '<link href="https://fonts.googleapis.com/css2?family=Alfa+Slab+One&family=Bungee&family=IBM+Plex+Mono:wght@500;700&display=swap" rel="stylesheet">';

async function renderHtml(browser, html, width, height, out) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  // Play rejects screenshots / feature graphics with an alpha channel, so those
  // are JPEG; only the icon (alpha allowed) stays PNG.
  const jpeg = out.endsWith(".jpg");
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width, height }, ...(jpeg ? { type: "jpeg", quality: 92 } : {}) });
  await page.close();
}

function iconSvg(fullBleed) {
  const svg = readFileSync(join(ROOT, "public/favicon.svg"), "utf8");
  // Play applies its own corner mask, so the store icon is a full square.
  return fullBleed ? svg.replace('rx="96"', 'rx="0"') : svg;
}

function featureHtml(copy) {
  return `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>
    body{margin:0;width:1024px;height:500px;background:#efe7d4;color:#1b1610;overflow:hidden;
      background-image:repeating-linear-gradient(90deg,transparent 0 38px,rgba(27,22,16,.035) 38px 39px)}
    .wrap{position:absolute;inset:48px 56px;border:4px solid #1b1610;box-shadow:12px 12px 0 #1b1610;
      background:#efe7d4;display:flex;align-items:center;gap:44px;padding:0 48px}
    .icon{width:230px;height:230px;flex:none}
    .icon svg{width:100%;height:100%}
    h1{margin:0;font:400 104px/0.9 "Alfa Slab One",serif;letter-spacing:.01em}
    .kicker{margin:14px 0 18px;font:400 26px/1 Bungee,sans-serif;color:#6e1f1a;letter-spacing:.04em}
    .tag{margin:0;font:700 24px/1.25 "IBM Plex Mono",monospace}
    .sub{margin:8px 0 0;font:500 18px/1.2 "IBM Plex Mono",monospace;color:rgba(27,22,16,.64);letter-spacing:.04em;text-transform:uppercase}
  </style></head><body><div class="wrap"><div class="icon">${iconSvg(false)}</div><div>
    <h1>GYM LOG</h1><p class="kicker">TRAINING LEDGER</p>
    <p class="tag">${copy.tagline}</p><p class="sub">${copy.sub}</p>
  </div></div></body></html>`;
}

function frameHtml(png, title, sub) {
  return `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>
    body{margin:0;width:1080px;height:1920px;background:#1b1610;color:#efe7d4;overflow:hidden;font-family:"IBM Plex Mono",monospace}
    .cap{position:absolute;top:96px;left:0;right:0;text-align:center;padding:0 60px}
    h1{margin:0;font:400 76px/1.02 "Alfa Slab One",serif;letter-spacing:.005em}
    p{margin:22px 0 0;font:700 34px/1.25 "IBM Plex Mono",monospace;color:#d6925f}
    .shot{position:absolute;left:110px;top:380px;width:860px;border:6px solid #efe7d4;
      box-shadow:18px 18px 0 #d6422b;background:#efe7d4;line-height:0}
    .shot img{width:100%;display:block}
  </style></head><body>
    <div class="cap"><h1>${title}</h1><p>${sub}</p></div>
    <div class="shot"><img src="data:image/png;base64,${png.toString("base64")}"></div>
  </body></html>`;
}

// ── Screens ──────────────────────────────────────────────────────────────────
// Raw captures are 412×700 CSS px (a typical phone width); framed to 1080×1920.
const VIEW = { width: 412, height: 700 };

async function capture(browser, lang, state, drive) {
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2.5, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.evaluate(
    ([s, l]) => {
      localStorage.clear();
      for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v));
      localStorage.setItem("gymlog.lang", l);
      localStorage.setItem("gymlog.theme", "light");
    },
    [state, lang],
  );
  await page.reload({ waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await drive(page);
  await sleep(900);
  const png = await page.screenshot();
  await ctx.close();
  return png;
}

const navTo = (page, index) => page.locator(".nav-btn").nth(index).click();
const scrollTo = (page, selector, offset = 12) =>
  page.evaluate(
    ([sel, off]) => {
      const el = document.querySelector(sel);
      if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - off);
    },
    [selector, offset],
  );

// ── Main ─────────────────────────────────────────────────────────────────────
const { chromium } = await loadPlaywright();
if (!process.argv.includes("--no-build")) execSync("npm run build", { cwd: ROOT, stdio: "inherit" });

const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], { cwd: ROOT, stdio: "ignore" });
try {
  await waitForServer(BASE);
  const browser = await chromium.launch(
    process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {},
  );
  const { sessions, active } = seed(Date.now());
  const history = { "gymlog.sessions": sessions.filter((s) => s !== active) };
  const live = (sub) => ({ "gymlog.sessions": sessions, "gymlog.liveProgress": progressFor(active, sub) });

  for (const [locale, copy] of Object.entries(LOCALES)) {
    const dir = join(META, locale, "images");
    const shotsDir = join(dir, "phoneScreenshots");
    // Start clean so renamed or dropped screens don't linger and get uploaded.
    rmSync(shotsDir, { recursive: true, force: true });
    mkdirSync(shotsDir, { recursive: true });

    await renderHtml(
      browser,
      `<!doctype html><html><body style="margin:0">${iconSvg(true).replace("<svg ", '<svg width="512" height="512" ')}</body></html>`,
      512,
      512,
      join(dir, "icon.png"),
    );
    await renderHtml(browser, featureHtml(copy), 1024, 500, join(dir, "featureGraphic.jpg"));

    const screens = [
      // 1 · Body — readiness map after yesterday's pull day.
      ["1_body", history, async (p) => { await sleep(1500); await scrollTo(p, ".readiness-card"); }],
      // 2 · Train — flies after five sets of bench: the expected-now card.
      ["2_expected", live("idle"), async (p) => { await navTo(p, 1); await sleep(600); await scrollTo(p, ".live-expect", 90); }],
      // 3 · Train — the dials.
      ["3_log", live("logging"), async (p) => { await navTo(p, 1); await sleep(600); await scrollTo(p, ".set-time", 8); }],
      // 4 · History.
      ["4_history", history, async (p) => {
        await navTo(p, 2);
        await p.locator(".saved-item .session-summary-toggle").first().evaluate((d) => { d.open = true; });
        await scrollTo(p, ".saved-item");
      }],
      // 5 · Exercise detail for bench.
      ["5_exercise", history, async (p) => {
        await navTo(p, 2);
        await p.locator(".history-ex-chip", { hasText: "Bench Press" }).first().click();
        await sleep(400);
        await scrollTo(p, ".exercise-title");
      }],
    ];
    for (const [i, [name, state, drive]] of screens.entries()) {
      const raw = await capture(browser, copy.lang, state, drive);
      const [title, sub] = copy.shots[i];
      await renderHtml(browser, frameHtml(raw, title, sub), 1080, 1920, join(shotsDir, `${name}.jpg`));
      console.log(`✔ ${locale} ${name}`);
    }
  }
  await browser.close();
} finally {
  server.kill();
}
