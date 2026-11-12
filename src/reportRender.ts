import { todayKey } from "./bodyweightStore";
import {
  C,
  CW,
  type Ctx,
  DISPLAY,
  drawBar,
  drawFooter,
  drawHeader,
  ensureFonts,
  type LogoFit,
  MONO,
  PAD,
  paintPage,
  resolveLogo,
  roundRect,
  wrap,
} from "./canvasKit";
import { dayLedger, trainingOn, trainingWaterGoal } from "./health/crossData";
import { addDays, dayTotals, entryMacros, foodById, r1, todayIso } from "./health/cutModel";
import { loadCut } from "./health/cutStore";
import { DRINKS, hydrationOf } from "./health/drinks";
import { macroSeries, meanOf, waterSeries, weeklyKcal, weekStart } from "./health/history";
import { loadWater, waterDay, waterDays } from "./health/waterStore";
import { dateLocale, registerTranslations, t } from "./i18n";
import { MUSCLE_LABELS, type MuscleGroup, type TrainingSession } from "./types";
import { formatDuration, sessionDurationSec, sessionSetCount, sessionVolume } from "./util";

/* Shareable one-page reports beyond the session recap and the body map: the
   training history, a day of water and the water trend, a day of food and the
   food history. Same "Training Ledger" page (canvasKit) and the same two-pass
   measure/paint renderers, so each is a PNG, a PDF, or a page of the full
   report (`exporters.ts`). */

registerTranslations({
  "Training history": "Istoric antrenamente",
  "Water · the day": "Apă · ziua",
  "Water history": "Istoric apă",
  "Food · the day": "Mâncare · ziua",
  "Food history": "Istoric mâncare",
  Sessions: "Sesiuni",
  Sets: "Serii",
  Lifted: "Ridicat",
  "Avg length": "Durată medie",
  "Volume per week": "Volum pe săptămână",
  "Sets by muscle": "Serii pe mușchi",
  "Latest sessions": "Ultimele sesiuni",
  "{0} sets": "{0} serii",
  "No sessions logged yet.": "Nicio sesiune înregistrată încă.",
  "+ {0} more not shown": "+ încă {0} neafișate",
  Date: "Data",
  Session: "Sesiune",
  "Ex · sets": "Ex · serii",
  Volume: "Volum",
  Time: "Timp",
  Effective: "Efectiv",
  Goal: "Țintă",
  "Of goal": "Din țintă",
  "Raw volume": "Volum brut",
  "Effective hydration": "Hidratare efectivă",
  "Includes +{0} ml for the day's training.": "Include +{0} ml pentru antrenamentul zilei.",
  Drinks: "Băuturi",
  Drink: "Băutură",
  "Nothing logged on this day.": "Nimic înregistrat în această zi.",
  "Last {0} days": "Ultimele {0} zile",
  "Avg / day": "Medie / zi",
  "Days logged": "Zile înregistrate",
  "Goal kept": "Țintă atinsă",
  "Hydration per day": "Hidratare pe zi",
  "Day by day": "Zi cu zi",
  "goal {0} ml": "țintă {0} ml",
  kept: "atinsă",
  trained: "antrenament",
  "Nothing logged in this range.": "Nimic înregistrat în acest interval.",
  Calories: "Calorii",
  Protein: "Proteine",
  Carbs: "Carbohidrați",
  Fat: "Grăsimi",
  "{0} of {1} kcal": "{0} din {1} kcal",
  "{0} of {1} g": "{0} din {1} g",
  "{0} of {1} ml": "{0} din {1} ml",
  Water: "Apă",
  "{0} session(s) · ~{1} kcal burned": "{0} sesiune(i) · ~{1} kcal arse",
  "The plate": "Farfuria",
  Food: "Aliment",
  Total: "Total",
  "(deleted food)": "(aliment șters)",
  "Avg kcal": "Medie kcal",
  "Avg protein": "Medie proteine",
  Target: "Țintă",
  "Calories per day": "Calorii pe zi",
  "Protein per day": "Proteine pe zi",
  "Calories per week": "Calorii pe săptămână",
  "target {0}": "țintă {0}",
  "Week of": "Săptămâna din",
  Days: "Zile",
  "Bars — logged days · dashes — target · dots — days not logged":
    "Bare — zile înregistrate · liniuțe — țintă · puncte — zile neînregistrate",
});

const n0 = (x: number): string => Math.round(x).toLocaleString(dateLocale());
const fill = (s: string, ...args: (string | number)[]): string =>
  args.reduce<string>((acc, a, i) => acc.replace(`{${i}}`, String(a)), s);

const noon = (day: string): Date => new Date(`${day}T12:00:00`);
const shortDay = (day: string): string =>
  noon(day).toLocaleDateString(dateLocale(), { weekday: "short", day: "numeric", month: "short" });
const tinyDay = (day: string): string =>
  noon(day).toLocaleDateString(dateLocale(), { day: "numeric", month: "short" });
const longDay = (day: string): string =>
  noon(day).toLocaleDateString(dateLocale(), { weekday: "long", day: "numeric", month: "long", year: "numeric" });

/** Longest tables a page carries — keeps a canvas inside every browser's size limit. */
const MAX_ROWS = 60;

// ───────────────────────────── Page building blocks ─────────────────────────────

/** Brick section label over a hairline rule. */
function section(ctx: Ctx, y: number, text: string, paint: boolean): number {
  let cy = y + 10;
  ctx.font = `700 12px ${MONO}`;
  if (paint) {
    ctx.fillStyle = C.brick;
    ctx.fillText(text.toUpperCase(), PAD, cy);
  }
  cy += 20;
  if (paint) {
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, cy + 0.5);
    ctx.lineTo(PAD + CW, cy + 0.5);
    ctx.stroke();
  }
  return cy + 12;
}

/** A wrapped sentence-length note. */
function note(ctx: Ctx, y: number, text: string, paint: boolean, color: string = C.inkSoft): number {
  let cy = y;
  ctx.font = `400 12px ${MONO}`;
  for (const ln of wrap(ctx, text, CW)) {
    if (paint) {
      ctx.fillStyle = color;
      ctx.fillText(ln, PAD, cy);
    }
    cy += 17;
  }
  return cy + 6;
}

/** The dateline under the header. */
function dateline(ctx: Ctx, y: number, text: string, paint: boolean): number {
  ctx.font = `700 11px ${MONO}`;
  if (paint) {
    ctx.fillStyle = C.inkFaint;
    ctx.fillText(text.toUpperCase(), PAD, y);
  }
  return y + 24;
}

interface Stat {
  label: string;
  value: string;
}

/** A panel of headline figures, equal columns. */
function statRow(ctx: Ctx, y: number, stats: Stat[], paint: boolean): number {
  const H = 78;
  const col = CW / stats.length;
  if (paint) {
    roundRect(ctx, PAD, y, CW, H, 8);
    ctx.fillStyle = C.panel;
    ctx.fill();
    ctx.strokeStyle = C.lineStrong;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    stats.forEach((s, i) => {
      const x = PAD + i * col + 16;
      ctx.font = `700 10px ${MONO}`;
      ctx.fillStyle = C.brick;
      ctx.fillText(s.label.toUpperCase(), x, y + 14);
      let size = 26;
      ctx.font = `400 ${size}px ${DISPLAY}`;
      while (size > 14 && ctx.measureText(s.value).width > col - 28) {
        size -= 2;
        ctx.font = `400 ${size}px ${DISPLAY}`;
      }
      ctx.fillStyle = C.ink;
      ctx.fillText(s.value, x, y + 36);
      if (i > 0) {
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(PAD + i * col + 0.5, y + 12);
        ctx.lineTo(PAD + i * col + 0.5, y + H - 12);
        ctx.stroke();
      }
    });
  }
  return y + H + 14;
}

/** A labelled progress bar: name left, reading right, bar under. */
function meter(
  ctx: Ctx,
  y: number,
  label: string,
  reading: string,
  ratio: number,
  color: string,
  paint: boolean,
): number {
  if (paint) {
    ctx.font = `600 13px ${MONO}`;
    ctx.fillStyle = C.ink;
    ctx.fillText(label, PAD, y);
    ctx.font = `400 12px ${MONO}`;
    ctx.textAlign = "right";
    ctx.fillStyle = C.inkSoft;
    ctx.fillText(reading, PAD + CW, y + 1);
    ctx.textAlign = "left";
    drawBar(ctx, PAD, y + 20, CW, 10, ratio, color);
  }
  return y + 44;
}

interface Col {
  /** Share of the content width (the shares sum to 1). */
  w: number;
  align?: "left" | "right";
  head: string;
}

function ellipsize(ctx: Ctx, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

/** A ledger table: stamped column heads, zebra rows, an optional bold total row. */
function table(
  ctx: Ctx,
  y: number,
  cols: Col[],
  rows: string[][],
  paint: boolean,
  opts: { total?: string[]; hidden?: number } = {},
): number {
  const ROW = 24;
  const HEAD = 22;
  const G = 8;
  let cy = y;
  const cells = (vals: string[], top: number, font: string, color: string): void => {
    ctx.font = font;
    ctx.fillStyle = color;
    let x = PAD;
    cols.forEach((c, i) => {
      const w = c.w * CW;
      const text = ellipsize(ctx, vals[i] ?? "", w - G * 2);
      if (c.align === "right") {
        ctx.textAlign = "right";
        ctx.fillText(text, x + w - G, top);
        ctx.textAlign = "left";
      } else {
        ctx.fillText(text, x + G, top);
      }
      x += w;
    });
  };
  if (paint) cells(cols.map((c) => c.head.toUpperCase()), cy + 4, `700 10px ${MONO}`, C.inkFaint);
  cy += HEAD;
  rows.forEach((r, i) => {
    if (paint) {
      if (i % 2 === 0) {
        ctx.fillStyle = C.rowAlt;
        ctx.fillRect(PAD, cy, CW, ROW);
      }
      cells(r, cy + 6, `400 12px ${MONO}`, C.ink);
    }
    cy += ROW;
  });
  if (opts.total) {
    if (paint) {
      ctx.strokeStyle = C.lineStrong;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(PAD, cy + 0.5);
      ctx.lineTo(PAD + CW, cy + 0.5);
      ctx.stroke();
      cells(opts.total, cy + 7, `700 12px ${MONO}`, C.ink);
    }
    cy += ROW + 2;
  }
  cy += 8;
  if (opts.hidden && opts.hidden > 0) {
    cy = note(ctx, cy, fill(t("+ {0} more not shown"), opts.hidden), paint, C.inkFaint);
  }
  return cy + 6;
}

interface Chart {
  values: (number | null)[];
  /** One per value; empty = no tick label. */
  ticks: string[];
  color: string;
  /** Dashed reference line. */
  target?: { value: number; label: string };
  /** Bar colour above the target (e.g. calories over budget). */
  overColor?: string;
}

/** A bar per slot; an unlogged slot is a faint dot on the baseline, never a zero bar. */
function barChart(ctx: Ctx, y: number, ch: Chart, paint: boolean): number {
  const H = 150;
  const AX = 48;
  const x0 = PAD + AX;
  const pw = CW - AX;
  const top = y + 14;
  const base = top + H;
  if (paint) {
    const known = ch.values.filter((v): v is number => v !== null);
    const max = Math.max(1, ...known, ch.target?.value ?? 0) * 1.12;
    const yOf = (v: number): number => base - (v / max) * H;

    ctx.font = `400 10px ${MONO}`;
    ctx.lineWidth = 1;
    for (const f of [0, 0.5, 1]) {
      const gy = Math.round(yOf(max * f)) + 0.5;
      ctx.strokeStyle = f === 0 ? C.lineStrong : C.line;
      ctx.beginPath();
      ctx.moveTo(x0, gy);
      ctx.lineTo(x0 + pw, gy);
      ctx.stroke();
      ctx.fillStyle = C.inkFaint;
      ctx.textAlign = "right";
      ctx.fillText(n0(max * f), x0 - 6, gy - 6);
      ctx.textAlign = "left";
    }

    const n = Math.max(1, ch.values.length);
    const slot = pw / n;
    const bw = Math.max(1.5, Math.min(34, slot * 0.72));
    ch.values.forEach((v, i) => {
      const cx = x0 + slot * (i + 0.5);
      if (v === null) {
        ctx.fillStyle = C.inkFaint;
        ctx.beginPath();
        ctx.arc(cx, base - 4, 1.4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const by = yOf(v);
        ctx.fillStyle = ch.target && ch.overColor && v > ch.target.value * 1.03 ? ch.overColor : ch.color;
        ctx.fillRect(cx - bw / 2, by, bw, Math.max(1, base - by));
      }
      const tick = ch.ticks[i];
      if (tick) {
        ctx.font = `400 10px ${MONO}`;
        ctx.fillStyle = C.inkSoft;
        const tw = ctx.measureText(tick).width;
        ctx.fillText(tick, Math.max(x0, Math.min(x0 + pw - tw, cx - tw / 2)), base + 7);
      }
    });

    if (ch.target && ch.target.value > 0) {
      const ty = Math.round(yOf(ch.target.value)) + 0.5;
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(x0, ty);
      ctx.lineTo(x0 + pw, ty);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = `700 10px ${MONO}`;
      const lw = ctx.measureText(ch.target.label).width;
      ctx.fillStyle = C.bg;
      ctx.fillRect(x0 + pw - lw - 10, ty - 15, lw + 10, 13);
      ctx.fillStyle = C.ink;
      ctx.fillText(ch.target.label, x0 + pw - lw - 4, ty - 14);
    }
  }
  return base + 30;
}

/** Tick labels for a run of days: about six, always the first and the last. */
function dayTicks(dates: string[]): string[] {
  const step = Math.max(1, Math.ceil(dates.length / 6));
  return dates.map((d, i) => (i === dates.length - 1 || (i % step === 0 && dates.length - 1 - i >= step * 0.6) ? tinyDay(d) : ""));
}

async function page(
  eyebrow: string,
  title: string,
  footer: string,
  body: (ctx: Ctx, y: number, paint: boolean) => number,
): Promise<HTMLCanvasElement> {
  await ensureFonts();
  const logo: LogoFit | null = await resolveLogo();
  return paintPage((ctx, paint) => {
    let y = drawHeader(ctx, { eyebrow: `GYM LOG · ${eyebrow.toUpperCase()}`, title, logo, paint });
    y = body(ctx, y, paint);
    return drawFooter(ctx, y + 10, `GYM LOG — ${footer.toUpperCase()}`, paint);
  });
}

// ───────────────────────────── Training history ─────────────────────────────

const kgText = (kg: number): string => (kg >= 10000 ? `${(kg / 1000).toFixed(1)} t` : `${n0(kg)} kg`);

/** Every logged session on one page: totals, weekly volume, sets by muscle, the ledger. */
export function renderTrainingHistoryToCanvas(sessions: TrainingSession[]): Promise<HTMLCanvasElement> {
  const logged = sessions
    .filter((s) => sessionSetCount(s) > 0)
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)); // newest first
  const title = t("Training history");

  const totalSets = logged.reduce((n, s) => n + sessionSetCount(s), 0);
  const totalVol = logged.reduce((n, s) => n + sessionVolume(s), 0);
  const durations = logged.map((s) => sessionDurationSec(s)).filter((d): d is number => d !== null);
  const avgDur = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null;

  // Volume per Monday-started week, last 12 weeks.
  const thisWeek = weekStart(todayKey());
  const weeks = Array.from({ length: 12 }, (_, i) => addDays(thisWeek, -7 * (11 - i)));
  const volByWeek = new Map<string, number>();
  const setsByMuscle = new Map<MuscleGroup, number>();
  for (const s of logged) {
    const wk = weekStart(todayKey(new Date(s.startedAt)));
    volByWeek.set(wk, (volByWeek.get(wk) ?? 0) + sessionVolume(s));
    for (const ex of s.exercises) {
      if (ex.sets.length) setsByMuscle.set(ex.muscle, (setsByMuscle.get(ex.muscle) ?? 0) + ex.sets.length);
    }
  }
  const muscles = [...setsByMuscle.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const topSets = muscles[0]?.[1] ?? 1;

  const first = logged[logged.length - 1];
  const last = logged[0];
  const span =
    first && last
      ? `${tinyDay(todayKey(new Date(first.startedAt)))} – ${longDay(todayKey(new Date(last.startedAt)))}`
      : longDay(todayKey());

  const cols: Col[] = [
    { w: 0.2, head: t("Date") },
    { w: 0.36, head: t("Session") },
    { w: 0.14, head: t("Ex · sets"), align: "right" },
    { w: 0.16, head: t("Volume"), align: "right" },
    { w: 0.14, head: t("Time"), align: "right" },
  ];
  const rows = logged.slice(0, MAX_ROWS).map((s) => {
    const dur = sessionDurationSec(s);
    const vol = sessionVolume(s);
    return [
      shortDay(todayKey(new Date(s.startedAt))),
      s.name || t("Session"),
      `${s.exercises.filter((ex) => ex.sets.length > 0).length} · ${sessionSetCount(s)}`,
      vol > 0 ? `${n0(vol)} kg` : "—",
      dur !== null ? formatDuration(dur) : "—",
    ];
  });

  return page(title, title, title, (ctx, y0, paint) => {
    let y = dateline(ctx, y0, span, paint);
    if (!logged.length) return note(ctx, y, t("No sessions logged yet."), paint);
    y = statRow(
      ctx,
      y,
      [
        { label: t("Sessions"), value: String(logged.length) },
        { label: t("Sets"), value: n0(totalSets) },
        { label: t("Lifted"), value: kgText(totalVol) },
        { label: t("Avg length"), value: avgDur !== null ? formatDuration(avgDur) : "—" },
      ],
      paint,
    );
    y = section(ctx, y, t("Volume per week"), paint);
    y = barChart(
      ctx,
      y,
      {
        values: weeks.map((w) => volByWeek.get(w) ?? null),
        ticks: weeks.map((w, i) => (i % 2 === 1 ? tinyDay(w) : "")),
        color: C.navy,
      },
      paint,
    );
    if (muscles.length) {
      y = section(ctx, y, t("Sets by muscle"), paint);
      for (const [m, sets] of muscles) {
        y = meter(ctx, y, t(MUSCLE_LABELS[m]), fill(t("{0} sets"), sets), sets / topSets, C.mustard, paint);
      }
    }
    y = section(ctx, y, t("Latest sessions"), paint);
    return table(ctx, y, cols, rows, paint, { hidden: logged.length - rows.length });
  });
}

// ───────────────────────────────── Water ─────────────────────────────────

/** One day of drinks against the (training-adjusted) goal. */
export function renderWaterDayToCanvas(date: string = todayKey()): Promise<HTMLCanvasElement> {
  const water = loadWater();
  const day = waterDay(water.entries, date);
  const training = trainingOn(date);
  const goal = trainingWaterGoal(water.dailyGoalMl, training);
  const pct = goal > 0 ? Math.round((day.hydrationMl / goal) * 100) : 0;
  const entries = [...day.entries].sort((a, b) => a.ts - b.ts);

  const cols: Col[] = [
    { w: 0.18, head: t("Time") },
    { w: 0.4, head: t("Drink") },
    { w: 0.2, head: t("Volume"), align: "right" },
    { w: 0.22, head: t("Effective"), align: "right" },
  ];
  const rows = entries.slice(0, MAX_ROWS).map((e) => [
    new Date(e.ts).toLocaleTimeString(dateLocale(), { hour: "2-digit", minute: "2-digit" }),
    t(DRINKS[e.kind].label),
    `${n0(e.amountMl)} ml`,
    `${n0(hydrationOf(e))} ml`,
  ]);

  return page(t("Water"), t("Water · the day"), t("Water"), (ctx, y0, paint) => {
    let y = dateline(ctx, y0, longDay(date), paint);
    y = statRow(
      ctx,
      y,
      [
        { label: t("Effective"), value: `${n0(day.hydrationMl)} ml` },
        { label: t("Goal"), value: `${n0(goal)} ml` },
        { label: t("Of goal"), value: `${pct}%` },
        { label: t("Raw volume"), value: `${n0(day.totalMl)} ml` },
      ],
      paint,
    );
    const g = Math.max(1, goal);
    y = meter(ctx, y, t("Effective hydration"), fill(t("{0} of {1} ml"), n0(day.hydrationMl), n0(goal)), day.hydrationMl / g, day.hydrationMl >= goal ? C.pine : C.navy, paint);
    y = meter(ctx, y, t("Raw volume"), fill(t("{0} of {1} ml"), n0(day.totalMl), n0(goal)), day.totalMl / g, C.mustard, paint);
    if (training.hydrationMl > 0) {
      y = note(ctx, y, fill(t("Includes +{0} ml for the day's training."), n0(training.hydrationMl)), paint);
    }
    y = section(ctx, y, t("Drinks"), paint);
    if (!rows.length) return note(ctx, y, t("Nothing logged on this day."), paint);
    return table(ctx, y, cols, rows, paint, {
      total: [t("Total"), "", `${n0(day.totalMl)} ml`, `${n0(day.hydrationMl)} ml`],
      hidden: entries.length - rows.length,
    });
  });
}

/** The water trend over the last `days` days, with every logged day listed. */
export function renderWaterHistoryToCanvas(days: number): Promise<HTMLCanvasElement> {
  const water = loadWater();
  const today = todayKey();
  const series = waterSeries(water, today, days);
  const dates = series.map((d) => d.date);
  const byDay = new Map(waterDays(water.entries).map((d) => [d.date, d]));
  const loggedDays = series.filter((d) => d.value !== null);
  const info = new Map(
    loggedDays.map((d) => {
      const tr = trainingOn(d.date);
      const goal = trainingWaterGoal(water.dailyGoalMl, tr);
      return [d.date, { kept: (d.value ?? 0) >= goal, trained: tr.sessions.length > 0 }];
    }),
  );
  const kept = [...info.values()].filter((i) => i.kept).length;
  const avg = meanOf(series.map((d) => d.value));

  const cols: Col[] = [
    { w: 0.3, head: t("Date") },
    { w: 0.22, head: t("Effective"), align: "right" },
    { w: 0.22, head: t("Volume"), align: "right" },
    { w: 0.26, head: t("Goal"), align: "right" },
  ];
  const newest = [...loggedDays].reverse();
  const rows = newest.slice(0, MAX_ROWS).map((d) => {
    const i = info.get(d.date);
    const marks = [i?.kept ? `✓ ${t("kept")}` : "—", i?.trained ? t("trained") : ""].filter(Boolean).join(" · ");
    return [shortDay(d.date), `${n0(d.value ?? 0)} ml`, `${n0(byDay.get(d.date)?.totalMl ?? 0)} ml`, marks];
  });

  return page(t("Water"), t("Water history"), t("Water history"), (ctx, y0, paint) => {
    let y = dateline(ctx, y0, `${fill(t("Last {0} days"), days)} · ${longDay(today)}`, paint);
    if (!loggedDays.length) return note(ctx, y, t("Nothing logged in this range."), paint);
    y = statRow(
      ctx,
      y,
      [
        { label: t("Avg / day"), value: avg !== null ? `${n0(avg)} ml` : "—" },
        { label: t("Days logged"), value: `${loggedDays.length} / ${days}` },
        { label: t("Goal kept"), value: `${kept} / ${loggedDays.length}` },
        { label: t("Goal"), value: `${n0(water.dailyGoalMl)} ml` },
      ],
      paint,
    );
    y = section(ctx, y, t("Hydration per day"), paint);
    y = barChart(
      ctx,
      y,
      {
        values: series.map((d) => d.value),
        ticks: dayTicks(dates),
        color: C.navy,
        target: { value: water.dailyGoalMl, label: fill(t("goal {0} ml"), n0(water.dailyGoalMl)) },
      },
      paint,
    );
    y = note(ctx, y, t("Bars — logged days · dashes — target · dots — days not logged"), paint, C.inkFaint);
    y = section(ctx, y, t("Day by day"), paint);
    return table(ctx, y, cols, rows, paint, { hidden: newest.length - rows.length });
  });
}

// ───────────────────────────────── Food ─────────────────────────────────

/** One day's plate against the calorie and protein targets, with its training and water. */
export function renderFuelDayToCanvas(day: string = todayIso()): Promise<HTMLCanvasElement> {
  const state = loadCut();
  const s = state.settings;
  const tot = dayTotals(state, day);
  const ledger = dayLedger(day);
  const entries = state.days[day]?.entries ?? [];

  const cols: Col[] = [
    { w: 0.38, head: t("Food") },
    { w: 0.12, head: "g", align: "right" },
    { w: 0.14, head: "kcal", align: "right" },
    { w: 0.12, head: "P", align: "right" },
    { w: 0.12, head: "C", align: "right" },
    { w: 0.12, head: "F", align: "right" },
  ];
  const rows = entries.slice(0, MAX_ROWS).map((e) => {
    const m = entryMacros(state.foods, e);
    return [
      foodById(state.foods, e.foodId)?.name ?? t("(deleted food)"),
      n0(e.g),
      n0(m.kcal),
      String(r1(m.p)),
      String(r1(m.c)),
      String(r1(m.f)),
    ];
  });

  return page(t("Food"), t("Food · the day"), t("Food"), (ctx, y0, paint) => {
    let y = dateline(ctx, y0, longDay(day), paint);
    y = statRow(
      ctx,
      y,
      [
        { label: t("Calories"), value: `${n0(tot.kcal)} kcal` },
        { label: t("Protein"), value: `${n0(tot.p)} g` },
        { label: t("Carbs"), value: `${n0(tot.c)} g` },
        { label: t("Fat"), value: `${n0(tot.f)} g` },
      ],
      paint,
    );
    y = meter(ctx, y, t("Calories"), fill(t("{0} of {1} kcal"), n0(tot.kcal), n0(s.kcal)), tot.kcal / Math.max(1, s.kcal), tot.kcal > s.kcal * 1.03 ? C.signal : C.mustard, paint);
    y = meter(ctx, y, t("Protein"), fill(t("{0} of {1} g"), n0(tot.p), n0(s.protein)), tot.p / Math.max(1, s.protein), tot.p >= s.protein ? C.pine : C.brick, paint);
    y = meter(ctx, y, t("Water"), fill(t("{0} of {1} ml"), n0(ledger.hydrationMl), n0(ledger.waterGoalMl)), ledger.hydrationMl / Math.max(1, ledger.waterGoalMl), C.navy, paint);
    if (ledger.training.sessions.length) {
      y = note(ctx, y, fill(t("{0} session(s) · ~{1} kcal burned"), ledger.training.sessions.length, n0(ledger.training.kcal)), paint);
    }
    y = section(ctx, y, t("The plate"), paint);
    if (!rows.length) return note(ctx, y, t("Nothing logged on this day."), paint);
    return table(ctx, y, cols, rows, paint, {
      total: [t("Total"), "", n0(tot.kcal), String(r1(tot.p)), String(r1(tot.c)), String(r1(tot.f))],
      hidden: entries.length - rows.length,
    });
  });
}

/** Calories and protein per day, calories per week and every logged day over `days` days. */
export function renderFuelHistoryToCanvas(days: number): Promise<HTMLCanvasElement> {
  const state = loadCut();
  const s = state.settings;
  const today = todayIso();
  const series = macroSeries(state, today, days);
  const dates = series.map((d) => d.date);
  const kcal = series.map((d) => (d.value ? Math.round(d.value.kcal) : null));
  const prot = series.map((d) => (d.value ? Math.round(d.value.p) : null));
  const loggedDays = series.filter((d) => d.value !== null);
  const avgK = meanOf(kcal);
  const avgP = meanOf(prot);
  const weeks = weeklyKcal(state, today, Math.max(4, Math.ceil(days / 7)));

  const dayCols: Col[] = [
    { w: 0.3, head: t("Date") },
    { w: 0.22, head: "kcal", align: "right" },
    { w: 0.16, head: "P g", align: "right" },
    { w: 0.16, head: "C g", align: "right" },
    { w: 0.16, head: "F g", align: "right" },
  ];
  const newest = [...loggedDays].reverse();
  const dayRows = newest.slice(0, MAX_ROWS).map((d) => {
    const m = d.value ?? { kcal: 0, p: 0, c: 0, f: 0 };
    return [shortDay(d.date), n0(m.kcal), n0(m.p), n0(m.c), n0(m.f)];
  });
  const weekCols: Col[] = [
    { w: 0.3, head: t("Week of") },
    { w: 0.22, head: "kcal", align: "right" },
    { w: 0.16, head: t("Days"), align: "right" },
    { w: 0.32, head: t("Avg / day"), align: "right" },
  ];
  const weekRows = [...weeks]
    .reverse()
    .filter((w) => w.loggedDays > 0)
    .map((w) => [tinyDay(w.start), n0(w.kcal), String(w.loggedDays), `${n0(w.avgPerDay)} kcal`]);

  return page(t("Food"), t("Food history"), t("Food history"), (ctx, y0, paint) => {
    let y = dateline(ctx, y0, `${fill(t("Last {0} days"), days)} · ${longDay(today)}`, paint);
    if (!loggedDays.length) return note(ctx, y, t("Nothing logged in this range."), paint);
    y = statRow(
      ctx,
      y,
      [
        { label: t("Avg kcal"), value: avgK !== null ? n0(avgK) : "—" },
        { label: t("Avg protein"), value: avgP !== null ? `${n0(avgP)} g` : "—" },
        { label: t("Days logged"), value: `${loggedDays.length} / ${days}` },
        { label: t("Target"), value: `${n0(s.kcal)} kcal` },
      ],
      paint,
    );
    y = section(ctx, y, t("Calories per day"), paint);
    y = barChart(ctx, y, { values: kcal, ticks: dayTicks(dates), color: C.mustard, overColor: C.signal, target: { value: s.kcal, label: fill(t("target {0}"), `${n0(s.kcal)} kcal`) } }, paint);
    y = section(ctx, y, t("Protein per day"), paint);
    y = barChart(ctx, y, { values: prot, ticks: dayTicks(dates), color: C.brick, target: { value: s.protein, label: fill(t("target {0}"), `${n0(s.protein)} g`) } }, paint);
    y = note(ctx, y, t("Bars — logged days · dashes — target · dots — days not logged"), paint, C.inkFaint);
    if (weekRows.length) {
      y = section(ctx, y, t("Calories per week"), paint);
      y = table(ctx, y, weekCols, weekRows, paint);
    }
    y = section(ctx, y, t("Day by day"), paint);
    return table(ctx, y, dayCols, dayRows, paint, { hidden: newest.length - dayRows.length });
  });
}

/** Whether there is anything to put on a water / food page (the full report skips empty logs). */
export function hasWaterLog(): boolean {
  return loadWater().entries.length > 0;
}
export function hasFoodLog(): boolean {
  const st = loadCut();
  return Object.values(st.days).some((d) => d.entries.length > 0);
}
