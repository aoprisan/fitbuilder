import { clear, h } from "../dom";
import {
  estimateCalories,
  estimateProteinG,
  muscleBreakdown,
  readEffort,
  readHydration,
} from "../effort";
import { parseTargetReps } from "../execute";
import {
  analyzeSessionInClaude,
  analyzeSessionsInClaude,
  type AnalyzeResult,
  copySessionPrompt,
  copySessionsPrompt,
  type CopyResult,
  exportSessionPdf,
  exportSessionPng,
  exportSessionsJson,
  exportSessionsXml,
  shareSession,
} from "../exporters";
import { newLoggedExercise, newTrainingSession, repeatSession } from "../log";
import { clearProgress, loadProgress, saveProgress, type SelectMode } from "../liveProgress";
import {
  deleteEmptySessions,
  deleteSession,
  getSession,
  loadSessions,
  saveSession,
} from "../logStorage";
import {
  compoundMovements,
  findMovement,
  type Movement,
  movementsForMuscle,
  muscleShares,
} from "../movements";
import { muscleRecovery, type MuscleRecovery, recoveryColor } from "../recovery";
import type { Cleanup, Nav } from "../router";
import { saveSheet } from "../sheetStorage";
import { setActiveLog, setEditingSheet, setSheetFlash, state } from "../state";
import {
  EQUIPMENT_LABELS,
  isBodyweight,
  MUSCLE_GROUPS,
  MUSCLE_LABELS,
  type Equipment,
  type LoggedExercise,
  type MuscleGroup,
  type TrainingSession,
  type WorkSet,
} from "../types";
import {
  cloneSheet,
  formatClock,
  formatLoad,
  formatSessionDate,
  sessionSetCount,
  sessionToSheet,
  sessionVolume,
} from "../util";
import { dialField } from "./dial";
import { lookbackSlider } from "./lookback";
import { registerTranslations, t } from "../i18n";

registerTranslations({
  // — RIR chips —
  Failure: "Cădere",
  "4+": "4+",
  // — Recovery warning —
  "{0} · {1}% · ~{2}h to go": "{0} · {1}% · ~{2}h rămase",
  "⚠ Still fatigued — consider resting these": "⚠ Încă obosit — ia în calcul odihna",
  "Heads up — not fully recovered": "Atenție — nu complet recuperat",
  "Training a muscle hard before it recovers raises injury and overtraining risk — go lighter or pick another muscle.":
    "Antrenarea intensă a unui mușchi înainte de recuperare crește riscul de accidentare și supraantrenament — mergi mai ușor sau alege alt mușchi.",
  // — Claude / export status —
  "Opened the share sheet — pick Claude to analyse your log.":
    "S-a deschis fereastra de partajare — alege Claude pentru a analiza jurnalul.",
  "Copied your log — paste it into the new Claude chat.":
    "Jurnal copiat — lipește-l în noua conversație Claude.",
  "Copied to clipboard — open Claude and paste.":
    "Copiat în clipboard — deschide Claude și lipește.",
  "Clipboard unavailable — saved a Markdown file instead.":
    "Clipboard indisponibil — s-a salvat un fișier Markdown în schimb.",
  "Copied the prompt — paste it into any AI (ChatGPT, Gemini, Claude…).":
    "Prompt copiat — lipește-l în orice AI (ChatGPT, Gemini, Claude…).",
  "{0}…": "{0}…",
  "{0} ready.": "{0} gata.",
  "Could not {0}. Try again.": "Nu s-a putut {0}. Încearcă din nou.",
  // — Session export row —
  "Share ▸": "Partajează ▸",
  "share {0}": "partajează {0}",
  "this session": "această sesiune",
  "save {0} as PNG": "salvează {0} ca PNG",
  "save {0} as PDF": "salvează {0} ca PDF",
  Share: "Partajează",
  "Save PNG": "Salvează PNG",
  "Save PDF": "Salvează PDF",
  "Opened the share sheet — pick WhatsApp.":
    "S-a deschis fereastra de partajare — alege WhatsApp.",
  "Sharing isn't available here, so the PNG was downloaded instead.":
    "Partajarea nu este disponibilă aici, așa că PNG-ul a fost descărcat în schimb.",
  // — Toggles —
  "Compound lift": "Exercițiu compus",
  "Muscle group": "Grupă musculară",
  Exercise: "Exercițiu",
  Mode: "Mod",
  Compound: "Compus",
  Custom: "Personalizat",
  // — Session summary —
  "{0}% of your usual session": "{0}% din sesiunea ta obișnuită",
  "Building your baseline — fills toward a full session":
    "Se construiește baza — se umple spre o sesiune completă",
  glass: "pahar",
  glasses: "pahare",
  Bodyweight: "Greutate corporală",
  "Session effort": "Efort sesiune",
  "Muscles worked": "Mușchi lucrați",
  Hydration: "Hidratare",
  "Protein to recover": "Proteine pentru recuperare",
  "Energy burned": "Energie consumată",
  // — List screen —
  "No sessions yet. Hit “Start session” when you reach the gym.":
    "Încă nicio sesiune. Apasă „Start sesiune” când ajungi la sală.",
  Live: "Live",
  "Track a workout in real time: start a session, pick the muscle and gear, then time each set and log reps and weight.":
    "Urmărește un antrenament în timp real: pornește o sesiune, alege mușchiul și echipamentul, apoi cronometrează fiecare serie și înregistrează repetările și greutatea.",
  "+ Start session": "+ Start sesiune",
  // — Export panel —
  "Export sessions": "Exportă sesiuni",
  "Download all {0} logged {1} to import into other tools and analyse elsewhere.":
    "Descarcă toate cele {0} {1} înregistrate pentru a le importa în alte instrumente și a le analiza altundeva.",
  session: "sesiune",
  sessions: "sesiuni",
  "Ask Claude ▸": "Întreabă Claude ▸",
  "ask Claude about recent logged sessions":
    "întreabă Claude despre sesiunile recente înregistrate",
  "Copy prompt": "Copiază prompt",
  "copy recent logged sessions as a prompt for any AI":
    "copiază sesiunile recente înregistrate ca prompt pentru orice AI",
  "Download JSON": "Descarcă JSON",
  "Download XML": "Descarcă XML",
  "Ask Claude": "Întreabă Claude",
  // — Session card —
  "{0} exercises · {1} sets": "{0} exerciții · {1} serii",
  "{0} kg lifted": "{0} kg ridicate",
  "Untitled session": "Sesiune fără titlu",
  "Effort & recovery": "Efort și recuperare",
  Resume: "Reia",
  Repeat: "Repetă",
  "repeat {0} as a new session": "repetă {0} ca o sesiune nouă",
  Delete: "Șterge",
  'Delete "{0}"? This cannot be undone.':
    "Ștergi „{0}”? Această acțiune nu poate fi anulată.",
  "Save as routine": "Salvează ca rutină",
  "save {0} as a shareable routine": "salvează {0} ca o rutină partajabilă",
  "Export JSON": "Exportă JSON",
  "export {0} as JSON": "exportă {0} ca JSON",
  "ask Claude about {0}": "întreabă Claude despre {0}",
  "copy {0} as a prompt for any AI": "copiază {0} ca prompt pentru orice AI",
  // — Save as routine flash —
  "Saved “{0}” as a routine — share it from here.":
    "„{0}” a fost salvată ca rutină — partajează-o de aici.",
  // — Select screen —
  "Session name": "Nume sesiune",
  "Logged so far — tap to add sets":
    "Înregistrate până acum — atinge pentru a adăuga serii",
  "{0} — {1} set": "{0} — {1} serie",
  "{0} — {1} sets": "{0} — {1} serii",
  "log sets for {0}": "înregistrează serii pentru {0}",
  "Live Session": "Sesiune Live",
  "No compound lifts in the catalog yet.":
    "Încă niciun exercițiu compus în catalog.",
  "Next exercise": "Următorul exercițiu",
  "Start →": "Start →",
  "Next →": "Următorul →",
  "+ Add off-plan": "+ Adaugă în afara planului",
  "add an exercise that isn't in the routine":
    "adaugă un exercițiu care nu este în rutină",
  "✓ Done — end session": "✓ Gata — termină sesiunea",
  // — Exercise screen / set list —
  "No sets yet — hit “Start set”.":
    "Încă nicio serie — apasă „Start serie”.",
  "{0} reps": "{0} repetări",
  "to failure": "până la cădere",
  "RIR {0}": "RIR {0}",
  "Set {0}": "Seria {0}",
  "delete set {0}": "șterge seria {0}",
  "Delete set {0}? This cannot be undone.":
    "Ștergi seria {0}? Această acțiune nu poate fi anulată.",
  // — RIR field —
  "Tap how many reps you had left — skip to leave intensity unweighted.":
    "Atinge câte repetări ți-au rămas — sari peste pentru a lăsa intensitatea neponderată.",
  "To failure — counted as maximum intensity.":
    "Până la cădere — contorizat ca intensitate maximă.",
  "{0} rep left in the tank.": "{0} repetare rămasă în rezervor.",
  "{0} reps left in the tank.": "{0} repetări rămase în rezervor.",
  "Reps in reserve (optional)": "Repetări în rezervă (opțional)",
  "Reps in reserve": "Repetări în rezervă",
  "trained to failure": "antrenat până la cădere",
  "{0} reps in reserve": "{0} repetări în rezervă",
  // — Exercise head / target —
  "{0} · {1}": "{0} · {1}",
  "Target progress": "Progres țintă",
  reps: "repetări",
  "▶ Start set": "▶ Start serie",
  "✓ Done — finish exercise": "✓ Gata — termină exercițiul",
  SET: "SERIE",
  "■ Stop": "■ Stop",
  REST: "PAUZĂ",
  "Resting — recover, then start your next set":
    "Pauză — recuperează-te, apoi pornește următoarea serie",
  "Set time {0}": "Timp serie {0}",
  "✓ Done": "✓ Gata",
  Reps: "Repetări",
  "Added (kg)": "Adăugat (kg)",
  "Weight (kg)": "Greutate (kg)",
});

const SVG_NS = "http://www.w3.org/2000/svg";
// Pulled in from the rim so the thicker ring stroke clears the gauge ticks.
const DIAL_R = 49;
const DIAL_C = 2 * Math.PI * DIAL_R;

function svgEl(tag: string, attrs: Record<string, string>): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

/** Total reps logged across an exercise's sets — used for the routine target tally. */
function sumReps(sets: readonly WorkSet[]): number {
  return sets.reduce((a, s) => a + s.reps, 0);
}

/** Reps-in-reserve chips shown when logging a set. "4+" stores 4 (fresh — minimal stimulus). */
const RIR_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 0, label: t("Failure") },
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: t("4+") },
];

// A target muscle below this readiness (0..1, from prior sessions) is flagged
// before you train it again; below the severe mark it's a strong warning.
const RECOVERY_WARN_BELOW = 0.6;
const RECOVERY_WARN_SEVERE = 0.35;

/**
 * Pre-training caution for the muscles a movement works that haven't recovered
 * from *earlier* sessions yet — the most direct guard against hammering a still-
 * fatigued muscle (injury / overtraining risk). The active session is excluded
 * from the readiness so doing a second exercise for the same muscle within one
 * workout doesn't false-alarm. Returns null when every target muscle is ready.
 */
function renderRecoveryWarning(
  muscles: readonly MuscleGroup[],
  recByMuscle: ReadonlyMap<MuscleGroup, MuscleRecovery>,
): HTMLElement | null {
  const flagged = muscles
    .map((m) => recByMuscle.get(m))
    .filter((r): r is MuscleRecovery => r !== undefined && r.recovered < RECOVERY_WARN_BELOW)
    .sort((a, b) => a.recovered - b.recovered);
  if (flagged.length === 0) return null;

  const severe = flagged[0]!.recovered < RECOVERY_WARN_SEVERE;
  const rows = flagged.map((r) => {
    const span = h("span", {
      class: "recovery-warn-muscle",
      text: t("{0} · {1}% · ~{2}h to go")
        .replace("{0}", t(MUSCLE_LABELS[r.muscle]))
        .replace("{1}", String(Math.round(r.recovered * 100)))
        .replace("{2}", String(r.hoursRemaining)),
    });
    span.style.color = recoveryColor(r.recovered);
    return h("div", { class: "recovery-warn-row" }, [span]);
  });

  return h(
    "section",
    { class: "card live-recovery-warn", dataset: { severity: severe ? "high" : "med" } },
    [
      h("p", {
        class: "recovery-warn-head",
        text: severe
          ? t("⚠ Still fatigued — consider resting these")
          : t("Heads up — not fully recovered"),
      }),
      ...rows,
      h("p", {
        class: "recovery-warn-note",
        text: t(
          "Training a muscle hard before it recovers raises injury and overtraining risk — go lighter or pick another muscle.",
        ),
      }),
    ],
  );
}

/** Top-level place in the live flow. */
type Stage = "list" | "select" | "exercise";
/** Where we are within a single exercise. */
type SetSub = "idle" | "running" | "logging" | "resting";

export function mountLive(root: HTMLElement, nav: Nav): Cleanup {
  const container = h("div", { class: "view view-live" });
  root.appendChild(container);

  let stage: Stage = state.activeLog ? "select" : "list";
  let sub: SetSub = "idle";

  // Pending exercise selection (becomes a LoggedExercise on the first logged set).
  let muscle: MuscleGroup = "chest";
  let equipment: Equipment = "dumbbell";
  // Selected catalog movement; drives the exercise name, load type, and secondary muscles.
  let movementId = "";
  // Which exercise picker the select screen shows: muscle+gear ("custom") or compound lifts.
  let selectMode: SelectMode = "custom";
  let currentEx: LoggedExercise | null = null;

  /** Point the selection at a movement id, syncing the derived muscle + load type. */
  function selectMovement(id: string): void {
    const mv = findMovement(id);
    if (!mv) return;
    movementId = mv.id;
    muscle = mv.primaryMuscle;
    equipment = mv.equipment;
  }

  /** Switch muscle group and reset the movement to that group's first option. */
  function selectMuscle(m: MuscleGroup): void {
    muscle = m;
    const first = movementsForMuscle(m)[0];
    if (first) selectMovement(first.id);
  }

  /** Ensure the current movement belongs to the current muscle; default if not. */
  function ensureMovement(): void {
    const movements = movementsForMuscle(muscle);
    if (!movements.some((mv) => mv.id === movementId)) {
      const first = movements[0];
      if (first) selectMovement(first.id);
    }
  }

  /** Ensure the selection points at a compound lift; default to the first one if not. */
  function ensureCompound(): void {
    const compounds = compoundMovements();
    if (!compounds.some((mv) => mv.id === movementId)) {
      const first = compounds[0];
      if (first) selectMovement(first.id);
    }
  }

  /**
   * The next planned-but-not-started exercise in a routine-loaded session: the
   * first with a carried prescription and no sets yet. Drives the select screen.
   */
  function nextPlanned(): LoggedExercise | undefined {
    return state.activeLog?.exercises.find(
      (ex) => ex.sets.length === 0 && ex.prescription !== undefined,
    );
  }

  // In-flight set values.
  let setReps = 10;
  let setWeight = 10;
  // Reps in reserve for the set being logged; null until tapped (optional).
  let pendingRir: number | null = null;

  // Stopwatch. Anchored to wall-clock time (epoch ms) so it keeps correct time
  // across a reload or phone lock, not just within one page session.
  let setStartEpoch = 0;
  let setElapsedMs = 0;
  let rafId = 0;

  // Rest clock — starts the moment a set is committed, runs until the next set.
  let restStartEpoch = 0;

  function stopRaf(): void {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  function persist(): void {
    if (state.activeLog) saveSession(state.activeLog);
  }

  // ───────────────────── Export / share (PNG · PDF · share) ───────────────────

  // Persists across re-renders because the element is reused, not recreated.
  const statusEl = h("p", { class: "status", role: "status", aria: { live: "polite" } });
  const setStatus = (msg: string, kind: "ok" | "err" | "info"): void => {
    statusEl.textContent = msg;
    statusEl.className = `status status-${kind}`;
  };
  const analyzeMsg = (result: AnalyzeResult): string => {
    switch (result) {
      case "shared":
        return t("Opened the share sheet — pick Claude to analyse your log.");
      case "copied-opened":
        return t("Copied your log — paste it into the new Claude chat.");
      case "copied":
        return t("Copied to clipboard — open Claude and paste.");
      case "downloaded":
        return t("Clipboard unavailable — saved a Markdown file instead.");
    }
  };
  const copyMsg = (result: CopyResult): string => {
    switch (result) {
      case "copied":
        return t("Copied the prompt — paste it into any AI (ChatGPT, Gemini, Claude…).");
      case "downloaded":
        return t("Clipboard unavailable — saved a Markdown file instead.");
    }
  };

  // Guard against double-taps while an (async) render/encode runs.
  let busy = false;
  async function runExport(label: string, fn: () => Promise<void>): Promise<void> {
    if (busy) return;
    busy = true;
    const tLabel = t(label);
    setStatus(t("{0}…").replace("{0}", tLabel), "info");
    try {
      await fn();
      setStatus(t("{0} ready.").replace("{0}", tLabel), "ok");
    } catch {
      setStatus(t("Could not {0}. Try again.").replace("{0}", tLabel.toLowerCase()), "err");
    } finally {
      busy = false;
    }
  }

  /** Share / PNG / PDF row for one session's recap (effort + exercise ledger). */
  function sessionExportRow(s: TrainingSession): HTMLElement {
    const all = (): TrainingSession[] => loadSessions();
    return h("div", { class: "btn-row saved-actions" }, [
      h("button", {
        class: "btn btn-small btn-accent",
        type: "button",
        text: t("Share ▸"),
        aria: { label: t("share {0}").replace("{0}", s.name || t("this session")) },
        on: {
          click: () =>
            runExport("Share", async () => {
              const result = await shareSession(s, all());
              setStatus(
                result === "shared"
                  ? t("Opened the share sheet — pick WhatsApp.")
                  : t("Sharing isn't available here, so the PNG was downloaded instead."),
                "ok",
              );
            }),
        },
      }),
      h("button", {
        class: "btn btn-small",
        type: "button",
        text: "PNG",
        aria: { label: t("save {0} as PNG").replace("{0}", s.name || t("this session")) },
        on: { click: () => runExport("Save PNG", () => exportSessionPng(s, all())) },
      }),
      h("button", {
        class: "btn btn-small",
        type: "button",
        text: "PDF",
        aria: { label: t("save {0} as PDF").replace("{0}", s.name || t("this session")) },
        on: { click: () => runExport("Save PDF", () => exportSessionPdf(s, all())) },
      }),
    ]);
  }

  /** Snapshot the in-flight flow so a reload can resume exactly here. */
  function snapshot(): void {
    const s = state.activeLog;
    if (!s || stage === "list") {
      clearProgress();
      return;
    }
    saveProgress({
      sessionId: s.id,
      stage,
      sub,
      muscle,
      equipment,
      movementId,
      selectMode,
      hasCurrentEx: currentEx !== null,
      setReps,
      setWeight,
      setRir: pendingRir,
      setStartEpoch,
      setElapsedMs,
      restStartEpoch,
    });
  }

  /** Re-open the session and flow position saved by a previous run, if any. */
  function restore(): void {
    const saved = loadProgress();
    if (!saved) return;
    const session = getSession(saved.sessionId);
    if (!session) {
      clearProgress();
      return;
    }
    setActiveLog(session);
    stage = saved.stage;
    sub = saved.sub;
    muscle = saved.muscle;
    equipment = saved.equipment;
    movementId = saved.movementId;
    selectMode = saved.selectMode;
    currentEx =
      saved.hasCurrentEx && session.exercises.length > 0
        ? session.exercises[session.exercises.length - 1]!
        : null;
    setReps = saved.setReps;
    setWeight = saved.setWeight;
    pendingRir = saved.setRir;
    setStartEpoch = saved.setStartEpoch;
    setElapsedMs = saved.setElapsedMs;
    restStartEpoch = saved.restStartEpoch;
  }

  // ───────────────────────── Toggles (muscle / equipment) ─────────────────────

  const renderToggle = (
    groupLabel: string,
    options: readonly string[],
    label: (value: string) => string,
    current: string,
    onPick: (value: string) => void,
  ): HTMLElement =>
    h("div", { class: "field" }, [
      h("span", { class: "field-label", text: groupLabel }),
      h(
        "div",
        { class: "toggle", role: "group", aria: { label: groupLabel } },
        options.map((opt) =>
          h("button", {
            class: current === opt ? "toggle-btn active" : "toggle-btn",
            type: "button",
            text: label(opt),
            aria: { pressed: String(current === opt) },
            on: { click: () => onPick(opt) },
          }),
        ),
      ),
    ]);

  // ───────────────────────────── Transitions ──────────────────────────────────

  function startSession(): void {
    setActiveLog(saveSession(newTrainingSession()));
    selectMuscle("chest");
    currentEx = null;
    sub = "idle";
    stage = "select";
    render();
  }

  function openSession(id: string): void {
    const fresh = getSession(id);
    if (!fresh) return;
    setActiveLog(fresh);
    currentEx = null;
    sub = "idle";
    stage = "select";
    render();
  }

  /** Start a new session pre-loaded with a past session's exercises (no sets yet). */
  function repeatPastSession(src: TrainingSession): void {
    setActiveLog(saveSession(repeatSession(src)));
    currentEx = null;
    sub = "idle";
    stage = "select";
    render();
  }

  /** Save a logged session as a shareable routine, then open it in the Routines view. */
  function saveAsRoutine(s: TrainingSession): void {
    if (sessionSetCount(s) === 0) return;
    const sheet = saveSheet(sessionToSheet(s));
    setEditingSheet(cloneSheet(sheet));
    setSheetFlash(
      t("Saved “{0}” as a routine — share it from here.").replace("{0}", sheet.name),
      "ok",
    );
    nav.go("sheet");
  }

  function endSession(): void {
    stopRaf();
    const s = state.activeLog;
    if (s) {
      if (s.exercises.some((ex) => ex.sets.length > 0)) saveSession(s);
      else deleteSession(s.id); // discard a session with nothing logged
    }
    clearProgress();
    setActiveLog(null);
    currentEx = null;
    sub = "idle";
    stage = "list";
    render();
  }

  function startExercise(): void {
    currentEx = null;
    sub = "idle";
    stage = "exercise";
    render();
  }

  /** Re-open an exercise already in the session to add more sets (or review them). */
  function resumeExercise(ex: LoggedExercise): void {
    currentEx = ex;
    muscle = ex.muscle;
    equipment = ex.equipment;
    movementId = ex.exerciseId ?? `${ex.muscle}::${ex.equipment}`;
    sub = "idle";
    stage = "exercise";
    render();
  }

  function startSet(): void {
    setStartEpoch = Date.now();
    setElapsedMs = 0;
    sub = "running";
    render();
  }

  function stopSet(): void {
    stopRaf();
    setElapsedMs = Date.now() - setStartEpoch;
    const last =
      currentEx && currentEx.sets.length ? currentEx.sets[currentEx.sets.length - 1]! : null;
    setReps = last ? last.reps : 10;
    setWeight = last ? last.weightKg : isBodyweight(equipment) ? 0 : 10;
    pendingRir = null; // proximity to failure is logged fresh per set
    sub = "logging";
    render();
  }

  function commitSet(): void {
    const s = state.activeLog;
    if (!s) return;
    const set: WorkSet = {
      reps: setReps,
      weightKg: setWeight,
      durationSec: Math.round(setElapsedMs / 1000),
      ...(pendingRir !== null ? { rir: pendingRir } : {}),
    };
    if (!currentEx) {
      const mv = findMovement(movementId);
      if (!mv) return;
      currentEx = newLoggedExercise(mv);
      s.exercises.push(currentEx);
    }
    currentEx.sets.push(set);
    persist();
    restStartEpoch = Date.now();
    sub = "resting";
    render();
  }

  function finishExercise(): void {
    currentEx = null;
    sub = "idle";
    stage = "select";
    render();
  }

  function deleteSet(i: number): void {
    if (!currentEx) return;
    if (!confirm(t("Delete set {0}? This cannot be undone.").replace("{0}", String(i + 1)))) return;
    currentEx.sets.splice(i, 1);
    persist();
    render();
  }

  // ──────────────────────── Session summary panel ─────────────────────────────

  /**
   * Effort gauge, hydration cue, per-muscle work (volume + time) and a recovery
   * protein estimate for a session — running or completed. The effort gauge is
   * calibrated against the user's other sessions in `allSessions`. Returns null
   * until the session has at least one logged set.
   */
  function renderSessionSummary(
    session: TrainingSession,
    allSessions: TrainingSession[],
  ): HTMLElement | null {
    if (sessionSetCount(session) === 0) return null;

    const effort = readEffort(session, allSessions);
    const hydration = readHydration(effort);
    const muscles = muscleBreakdown(session);
    const protein = estimateProteinG(effort, muscles.length);
    const calories = estimateCalories(effort);
    const pct = Math.round(Math.min(1, effort.ratio) * 100);

    const fill = h("div", { class: "effort-bar-fill" });
    fill.style.width = `${Math.min(1, effort.ratio) * 100}%`;

    const meta =
      effort.vsTypicalPct !== null
        ? t("{0}% of your usual session").replace("{0}", String(effort.vsTypicalPct))
        : t("Building your baseline — fills toward a full session");

    const glasses = `${hydration.glasses} ${hydration.glasses === 1 ? t("glass") : t("glasses")}`;

    const muscleRows = muscles.map((m) =>
      h("div", { class: "muscle-row" }, [
        h("span", { class: "muscle-name", text: t(MUSCLE_LABELS[m.muscle]) }),
        h("span", {
          class: "muscle-stat",
          text: `${m.volume > 0 ? `${m.volume} kg` : t("Bodyweight")} · ${formatClock(m.timeSec)}`,
        }),
      ]),
    );

    return h("section", { class: "card live-effort", dataset: { tier: effort.tier } }, [
      h("div", { class: "effort-head" }, [
        h("span", { class: "effort-eyebrow", text: t("Session effort") }),
        h("span", { class: "effort-tier", text: effort.label }),
      ]),
      h(
        "div",
        {
          class: "effort-bar",
          role: "progressbar",
          aria: { valuemin: "0", valuemax: "100", valuenow: String(pct), label: t("Session effort") },
        },
        [fill],
      ),
      h("p", { class: "effort-meta", text: meta }),
      h("div", { class: "summary-muscles" }, [
        h("span", { class: "summary-label", text: t("Muscles worked") }),
        ...muscleRows,
      ]),
      h("div", { class: "hydration-row" }, [
        h("span", { class: "hydration-label", text: t("Hydration") }),
        h("span", {
          class: "hydration-figure",
          text: `≈ ${hydration.liters.toFixed(1)} L · ${glasses}`,
        }),
      ]),
      h("p", { class: "hydration-note", text: hydration.note }),
      h("div", { class: "protein-row" }, [
        h("span", { class: "protein-label", text: t("Protein to recover") }),
        h("span", { class: "protein-figure", text: `≈ ${protein} g` }),
      ]),
      h("div", { class: "calories-row" }, [
        h("span", { class: "calories-label", text: t("Energy burned") }),
        h("span", { class: "calories-figure", text: `≈ ${calories} kcal` }),
      ]),
    ]);
  }

  // ───────────────────────────── List screen ──────────────────────────────────

  function renderList(): void {
    // Clear out sessions that were started but never logged (abandoned via a
    // tab switch). We're on the list screen, so nothing is in flight; spare any
    // still-resumable session just in case a snapshot points at an empty one.
    deleteEmptySessions(loadProgress()?.sessionId);
    const sessions = loadSessions().sort((a, b) => b.startedAt.localeCompare(a.startedAt));

    const listHost = h("div", { class: "saved-list" });
    if (sessions.length === 0) {
      listHost.appendChild(
        h("p", {
          class: "empty",
          text: t("No sessions yet. Hit “Start session” when you reach the gym."),
        }),
      );
    } else {
      sessions.forEach((s) => listHost.appendChild(renderSessionCard(s, sessions)));
    }

    container.append(
      h("h1", { class: "view-title", text: t("Live") }),
      h("p", {
        class: "lede",
        text: t(
          "Track a workout in real time: start a session, pick the muscle and gear, then time each set and log reps and weight.",
        ),
      }),
      h("div", { class: "btn-row" }, [
        h("button", {
          class: "btn btn-primary",
          type: "button",
          text: t("+ Start session"),
          on: { click: startSession },
        }),
      ]),
      statusEl,
      listHost,
    );

    if (sessions.length > 0) container.append(renderExportPanel(sessions));
  }

  /**
   * "Export all" panel — downloads every logged session as one JSON or XML
   * archive for import into other tools. Sessions are ordered oldest-first so
   * the export reads chronologically.
   */
  function renderExportPanel(sessions: TrainingSession[]): HTMLElement {
    const chronological = [...sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    const lookback = lookbackSlider(chronological.length);
    return h("section", { class: "card live-export" }, [
      h("h2", { class: "section-title", text: t("Export sessions") }),
      h("p", {
        class: "plan-meta",
        text: t("Download all {0} logged {1} to import into other tools and analyse elsewhere.")
          .replace("{0}", String(sessions.length))
          .replace("{1}", sessions.length === 1 ? t("session") : t("sessions")),
      }),
      ...(chronological.length > 1 ? [lookback.field] : []),
      h("div", { class: "btn-row" }, [
        h("button", {
          class: "btn btn-small btn-accent",
          type: "button",
          text: t("Ask Claude ▸"),
          aria: { label: t("ask Claude about recent logged sessions") },
          on: {
            click: () =>
              runExport("Ask Claude", async () => {
                setStatus(analyzeMsg(await analyzeSessionsInClaude(lookback.pick(chronological))), "ok");
              }),
          },
        }),
        h("button", {
          class: "btn btn-small",
          type: "button",
          text: t("Copy prompt"),
          aria: { label: t("copy recent logged sessions as a prompt for any AI") },
          on: {
            click: () =>
              runExport("Copy prompt", async () => {
                setStatus(copyMsg(await copySessionsPrompt(lookback.pick(chronological))), "ok");
              }),
          },
        }),
        h("button", {
          class: "btn btn-small",
          type: "button",
          text: t("Download JSON"),
          on: { click: () => exportSessionsJson(chronological) },
        }),
        h("button", {
          class: "btn btn-small",
          type: "button",
          text: t("Download XML"),
          on: { click: () => exportSessionsXml(chronological) },
        }),
      ]),
    ]);
  }

  function renderSessionCard(s: TrainingSession, allSessions: TrainingSession[]): HTMLElement {
    const sets = sessionSetCount(s);
    const vol = sessionVolume(s);
    const meta =
      t("{0} exercises · {1} sets")
        .replace("{0}", String(s.exercises.length))
        .replace("{1}", String(sets)) +
      (vol > 0 ? ` · ${t("{0} kg lifted").replace("{0}", String(vol))}` : "");
    const summary = renderSessionSummary(s, allSessions);
    return h("section", { class: "card saved-item" }, [
      h("div", { class: "saved-info" }, [
        h("p", { class: "plan-name", text: s.name || t("Untitled session") }),
        h("p", { class: "plan-meta", text: formatSessionDate(s.startedAt) }),
        h("p", { class: "plan-meta", text: meta }),
      ]),
      ...(summary
        ? [
            h("details", { class: "session-summary-toggle" }, [
              h("summary", { class: "session-summary-label", text: t("Effort & recovery") }),
              summary,
            ]),
          ]
        : []),
      h("div", { class: "btn-row saved-actions" }, [
        h("button", {
          class: "btn btn-accent btn-small",
          type: "button",
          text: t("Resume"),
          on: { click: () => openSession(s.id) },
        }),
        h("button", {
          class: "btn btn-small",
          type: "button",
          text: t("Repeat"),
          aria: { label: t("repeat {0} as a new session").replace("{0}", s.name || t("this session")) },
          on: { click: () => repeatPastSession(s) },
        }),
        h("button", {
          class: "btn btn-small danger",
          type: "button",
          text: t("Delete"),
          on: {
            click: () => {
              if (!confirm(t('Delete "{0}"? This cannot be undone.').replace("{0}", s.name || t("this session")))) return;
              deleteSession(s.id);
              render();
            },
          },
        }),
      ]),
      ...(sets > 0
        ? [
            h("div", { class: "btn-row saved-actions" }, [
              h("button", {
                class: "btn btn-small",
                type: "button",
                text: t("Save as routine"),
                aria: { label: t("save {0} as a shareable routine").replace("{0}", s.name || t("this session")) },
                on: { click: () => saveAsRoutine(s) },
              }),
              h("button", {
                class: "btn btn-small",
                type: "button",
                text: t("Export JSON"),
                aria: { label: t("export {0} as JSON").replace("{0}", s.name || t("this session")) },
                on: { click: () => exportSessionsJson([s]) },
              }),
              h("button", {
                class: "btn btn-small btn-accent",
                type: "button",
                text: t("Ask Claude ▸"),
                aria: { label: t("ask Claude about {0}").replace("{0}", s.name || t("this session")) },
                on: {
                  click: () =>
                    runExport("Ask Claude", async () => {
                      setStatus(analyzeMsg(await analyzeSessionInClaude(s)), "ok");
                    }),
                },
              }),
              h("button", {
                class: "btn btn-small",
                type: "button",
                text: t("Copy prompt"),
                aria: { label: t("copy {0} as a prompt for any AI").replace("{0}", s.name || t("this session")) },
                on: {
                  click: () =>
                    runExport("Copy prompt", async () => {
                      setStatus(copyMsg(await copySessionPrompt(s)), "ok");
                    }),
                },
              }),
            ]),
            sessionExportRow(s),
          ]
        : []),
    ]);
  }

  // ──────────────────────────── Select screen ─────────────────────────────────

  function renderSelect(): void {
    const session = state.activeLog;
    if (!session) {
      stage = "list";
      renderList();
      return;
    }

    // In a routine-loaded session, the next planned exercise drives this screen;
    // sync the toggles to its current selection so the user can confirm it.
    const planned = nextPlanned();
    if (planned) {
      muscle = planned.muscle;
      if (planned.exerciseId) {
        movementId = planned.exerciseId;
      } else {
        // No catalog identity yet (free-text routine row): pre-highlight only a
        // generic-gear option matching its load, never a named lift it didn't ask for.
        const match = movementsForMuscle(muscle).find(
          (mv) => mv.id.includes("::") && mv.equipment === planned.equipment,
        );
        if (match) movementId = match.id;
      }
    }
    if (selectMode === "compound") ensureCompound();
    else ensureMovement();

    const nameInput = h("input", {
      class: "plan-name-input",
      type: "text",
      value: session.name,
      placeholder: t("Session name"),
      aria: { label: t("Session name") },
    });
    nameInput.addEventListener("input", () => {
      session.name = nameInput.value;
      persist();
    });

    // Only exercises with logged sets — planned-but-untouched rows live in the
    // "next exercise" card instead, so they aren't duplicated here.
    const doneHost = h("div", { class: "live-done-list" });
    const logged = session.exercises.filter((ex) => ex.sets.length > 0);
    if (logged.length > 0) {
      doneHost.append(
        h("p", { class: "field-label", text: t("Logged so far — tap to add sets") }),
        ...logged.map((ex) =>
          h("button", {
            class: "btn btn-small live-done-row",
            type: "button",
            text: (ex.sets.length === 1 ? t("{0} — {1} set") : t("{0} — {1} sets"))
              .replace("{0}", ex.name)
              .replace("{1}", String(ex.sets.length)),
            aria: { label: t("log sets for {0}").replace("{0}", ex.name) },
            on: { click: () => resumeExercise(ex) },
          }),
        ),
      );
    }

    const allSessions = loadSessions();
    const summary = renderSessionSummary(session, allSessions);

    container.append(
      h("h1", { class: "view-title", text: t("Live Session") }),
      h("section", { class: "card" }, [
        h("label", { class: "field" }, [
          h("span", { class: "field-label", text: t("Session name") }),
          nameInput,
        ]),
        h("p", { class: "session-date", text: formatSessionDate(session.startedAt) }),
      ]),
    );
    if (summary) {
      container.append(summary, sessionExportRow(session), statusEl);
    }

    // Toggle picks update the view-level selection, and — when confirming a
    // planned routine exercise — write straight onto it so the choice sticks.
    const applyMovementToPlanned = (ex: LoggedExercise): void => {
      const mv = findMovement(movementId);
      if (!mv) return;
      ex.muscle = mv.primaryMuscle;
      ex.equipment = mv.equipment;
      ex.exerciseId = mv.id;
      if (mv.secondaryMuscles.length > 0) ex.secondaryMuscles = [...mv.secondaryMuscles];
      else delete ex.secondaryMuscles;
    };
    const pickMuscle = (m: string): void => {
      selectMuscle(m as MuscleGroup);
      if (planned) {
        applyMovementToPlanned(planned);
        persist();
      }
      render();
    };
    const pickMovement = (id: string): void => {
      selectMovement(id);
      if (planned) {
        applyMovementToPlanned(planned);
        persist();
      }
      render();
    };
    const pickMode = (m: string): void => {
      selectMode = m as SelectMode;
      if (selectMode === "compound") ensureCompound();
      else ensureMovement();
      if (planned) {
        applyMovementToPlanned(planned);
        persist();
      }
      render();
    };

    // The muscle split of the picked compound lift, as bars summing to 100%.
    const renderMuscleShares = (mv: Movement): HTMLElement =>
      h("div", { class: "field" }, [
        h("span", { class: "field-label", text: t("Muscles worked") }),
        h(
          "div",
          { class: "muscle-shares" },
          muscleShares(mv).map((s) => {
            const fill = h("div", { class: "muscle-share-fill" });
            fill.style.width = `${s.pct}%`;
            return h("div", { class: "muscle-share" }, [
              h("span", { class: "muscle-share-name", text: t(MUSCLE_LABELS[s.muscle]) }),
              h("div", { class: "muscle-share-bar" }, [fill]),
              h("span", { class: "muscle-share-pct", text: `${s.pct}%` }),
            ]);
          }),
        ),
      ]);

    // The exercise picker swaps shape by mode: muscle + gear, or compound lifts
    // with their muscle split. The mode toggle sits above both.
    const compounds = compoundMovements();
    const selectedCompound = findMovement(movementId);
    const picker =
      selectMode === "compound"
        ? compounds.length === 0
          ? [h("p", { class: "empty", text: t("No compound lifts in the catalog yet.") })]
          : [
              renderToggle(
                t("Compound lift"),
                compounds.map((mv) => mv.id),
                (id) => findMovement(id)?.name ?? id,
                movementId,
                pickMovement,
              ),
              ...(selectedCompound && selectedCompound.secondaryMuscles.length > 0
                ? [renderMuscleShares(selectedCompound)]
                : []),
            ]
        : [
            renderToggle(t("Muscle group"), MUSCLE_GROUPS, (m) => t(MUSCLE_LABELS[m as MuscleGroup]), muscle, pickMuscle),
            renderToggle(
              t("Exercise"),
              movementsForMuscle(muscle).map((mv) => mv.id),
              (id) => findMovement(id)?.name ?? id,
              movementId,
              pickMovement,
            ),
          ];

    // Caution if the picked movement's muscles haven't recovered from earlier
    // sessions — the active session is excluded so within-session repeats are fine.
    const selectedMovement = findMovement(movementId);
    const targetMuscles = selectedMovement
      ? [selectedMovement.primaryMuscle, ...selectedMovement.secondaryMuscles]
      : [muscle];
    const recWarn = renderRecoveryWarning(
      targetMuscles,
      new Map(
        muscleRecovery(allSessions.filter((s) => s.id !== session.id)).map(
          (r): [MuscleGroup, MuscleRecovery] => [r.muscle, r],
        ),
      ),
    );

    container.append(
      h("section", { class: "card live-select" }, [
        h("h2", { class: "section-title", text: planned ? planned.name || t("Next exercise") : t("Next exercise") }),
        ...(planned && planned.prescription
          ? [h("p", { class: "now-target", text: planned.prescription })]
          : []),
        renderToggle(
          t("Mode"),
          ["custom", "compound"],
          (m) => (m === "compound" ? t("Compound") : t("Custom")),
          selectMode,
          pickMode,
        ),
        ...picker,
        ...(recWarn ? [recWarn] : []),
        h("div", { class: "btn-row" }, [
          h("button", {
            class: "btn btn-primary",
            type: "button",
            text: planned ? t("Start →") : t("Next →"),
            on: { click: planned ? () => resumeExercise(planned) : startExercise },
          }),
          ...(planned
            ? [
                h("button", {
                  class: "btn",
                  type: "button",
                  text: t("+ Add off-plan"),
                  aria: { label: t("add an exercise that isn't in the routine") },
                  on: { click: startExercise },
                }),
              ]
            : []),
        ]),
        doneHost,
      ]),
      h("div", { class: "btn-row live-actions" }, [
        h("button", {
          class: "btn btn-accent",
          type: "button",
          text: t("✓ Done — end session"),
          on: { click: endSession },
        }),
      ]),
    );
  }

  // ─────────────────────────── Exercise screen ────────────────────────────────

  function renderSetList(): HTMLElement {
    const sets = currentEx?.sets ?? [];
    const host = h("div", { class: "live-set-list" });
    if (sets.length === 0) {
      host.appendChild(h("p", { class: "empty", text: t("No sets yet — hit “Start set”.") }));
      return host;
    }
    sets.forEach((s, i) => {
      const bits = [t("{0} reps").replace("{0}", String(s.reps)), formatLoad(equipment, s.weightKg)];
      if (s.rir !== undefined) bits.push(s.rir === 0 ? t("to failure") : t("RIR {0}").replace("{0}", String(s.rir)));
      if (s.durationSec !== undefined) bits.push(formatClock(s.durationSec));
      host.appendChild(
        h("div", { class: "live-set" }, [
          h("span", { class: "set-no", text: t("Set {0}").replace("{0}", String(i + 1)) }),
          h("span", { class: "live-set-meta", text: bits.join(" · ") }),
          h("button", {
            class: "icon-btn danger live-set-del",
            type: "button",
            text: "✕",
            aria: { label: t("delete set {0}").replace("{0}", String(i + 1)) },
            on: { click: () => deleteSet(i) },
          }),
        ]),
      );
    });
    return host;
  }

  /**
   * Optional reps-in-reserve selector for the set being logged; tapping the
   * active chip clears it. Repaints in place (not a full `render()`) so picking a
   * chip doesn't bounce the page back to the top mid-set.
   */
  function renderRirField(): HTMLElement {
    const field = h("div", { class: "field rir-field" });
    const paint = (): void => {
      const hint =
        pendingRir === null
          ? t("Tap how many reps you had left — skip to leave intensity unweighted.")
          : pendingRir === 0
            ? t("To failure — counted as maximum intensity.")
            : (pendingRir === 1 ? t("{0} rep left in the tank.") : t("{0} reps left in the tank."))
                .replace("{0}", String(pendingRir));
      clear(field);
      field.append(
        h("span", { class: "field-label", text: t("Reps in reserve (optional)") }),
        h(
          "div",
          { class: "toggle rir-toggle", role: "group", aria: { label: t("Reps in reserve") } },
          RIR_OPTIONS.map((o) =>
            h("button", {
              class: pendingRir === o.value ? "toggle-btn active" : "toggle-btn",
              type: "button",
              text: o.label,
              aria: {
                pressed: String(pendingRir === o.value),
                label: o.value === 0 ? t("trained to failure") : t("{0} reps in reserve").replace("{0}", o.label),
              },
              on: {
                click: () => {
                  pendingRir = pendingRir === o.value ? null : o.value;
                  snapshot();
                  paint();
                },
              },
            }),
          ),
        ),
        h("p", { class: "rir-hint", text: hint }),
      );
    };
    paint();
    return field;
  }

  function renderExercise(): void {
    const mv = findMovement(movementId);
    const exName = currentEx?.name ?? mv?.name ?? t(MUSCLE_LABELS[muscle]);
    const secondaries = currentEx?.secondaryMuscles ?? mv?.secondaryMuscles ?? [];
    const worked = [muscle, ...secondaries].map((m) => t(MUSCLE_LABELS[m])).join(" · ");
    const head = h("section", { class: "card live-ex-head" }, [
      h("span", { class: `badge badge-${equipment}`, text: t(EQUIPMENT_LABELS[equipment]) }),
      h("h2", { class: "now-name", text: exName }),
      h("p", {
        class: "now-eyebrow",
        text: `${worked} · ${t(EQUIPMENT_LABELS[equipment])}`,
      }),
    ]);

    container.append(h("h1", { class: "view-title", text: t("Live Session") }), head, renderSetList());

    // Routine target: when this exercise carries a prescription that parses to a
    // rep count, show how far the logged reps have filled it (reuses Execute's UI).
    const pres = currentEx?.prescription;
    const target = pres !== undefined ? parseTargetReps(pres) : null;
    if (currentEx && pres !== undefined && target !== null && target > 0) {
      const logged = sumReps(currentEx.sets);
      const pct = Math.round(Math.min(1, logged / target) * 100);
      const fill = h("div", { class: "progress-fill" });
      fill.style.width = `${pct}%`;
      container.append(
        h("p", { class: "now-target", text: pres }),
        h("p", { class: "now-tally" }, [
          h("span", { class: "tally-done", text: String(logged) }),
          h("span", { class: "tally-sep", text: "/" }),
          h("span", { class: "tally-target", text: String(target) }),
          h("span", { class: "tally-unit", text: t("reps") }),
        ]),
        h(
          "div",
          {
            class: "progress now-progress",
            role: "progressbar",
            aria: { valuemin: "0", valuemax: "100", valuenow: String(pct), label: t("Target progress") },
          },
          [fill],
        ),
      );
    }

    if (sub === "idle") {
      container.append(
        h("div", { class: "btn-row live-actions" }, [
          h("button", {
            class: "btn btn-primary btn-jumbo",
            type: "button",
            text: t("▶ Start set"),
            on: { click: startSet },
          }),
        ]),
        h("div", { class: "btn-row" }, [
          h("button", {
            class: "btn",
            type: "button",
            text: t("✓ Done — finish exercise"),
            on: { click: finishExercise },
          }),
        ]),
      );
      return;
    }

    if (sub === "running") {
      const fill = svgEl("circle", {
        class: "dial-fill",
        cx: "60",
        cy: "60",
        r: String(DIAL_R),
        "stroke-dasharray": String(DIAL_C),
        "stroke-dashoffset": "0",
      });
      const svg = svgEl("svg", { class: "dial", viewBox: "0 0 120 120", "aria-hidden": "true" });
      svg.appendChild(svgEl("circle", { class: "dial-track", cx: "60", cy: "60", r: String(DIAL_R) }));
      svg.appendChild(fill);

      const num = h("span", { class: "dial-num", text: "0:00" });
      const dialWrap = h("div", { class: "dial-wrap" }, [
        svg,
        h("div", { class: "dial-center" }, [num, h("span", { class: "dial-label", text: t("SET") })]),
      ]);

      container.append(
        dialWrap,
        h("div", { class: "btn-row live-actions" }, [
          h("button", {
            class: "btn btn-accent btn-jumbo",
            type: "button",
            text: t("■ Stop"),
            on: { click: stopSet },
          }),
        ]),
      );

      const frame = (): void => {
        setElapsedMs = Date.now() - setStartEpoch;
        const secs = setElapsedMs / 1000;
        num.textContent = formatClock(secs);
        fill.setAttribute("stroke-dashoffset", String(DIAL_C * (1 - ((secs % 60) / 60))));
        rafId = requestAnimationFrame(frame);
      };
      rafId = requestAnimationFrame(frame);
      return;
    }

    if (sub === "resting") {
      const fill = svgEl("circle", {
        class: "dial-fill dial-fill-rest",
        cx: "60",
        cy: "60",
        r: String(DIAL_R),
        "stroke-dasharray": String(DIAL_C),
        "stroke-dashoffset": "0",
      });
      const svg = svgEl("svg", { class: "dial", viewBox: "0 0 120 120", "aria-hidden": "true" });
      svg.appendChild(svgEl("circle", { class: "dial-track", cx: "60", cy: "60", r: String(DIAL_R) }));
      svg.appendChild(fill);

      const num = h("span", { class: "dial-num", text: "0:00" });
      const dialWrap = h("div", { class: "dial-wrap" }, [
        svg,
        h("div", { class: "dial-center" }, [num, h("span", { class: "dial-label", text: t("REST") })]),
      ]);

      const summary = state.activeLog
        ? renderSessionSummary(state.activeLog, loadSessions())
        : null;

      container.append(
        h("p", { class: "set-time", text: t("Resting — recover, then start your next set") }),
        dialWrap,
      );
      if (summary) container.append(summary);
      container.append(
        h("div", { class: "btn-row live-actions" }, [
          h("button", {
            class: "btn btn-primary btn-jumbo",
            type: "button",
            text: t("▶ Start set"),
            on: { click: startSet },
          }),
        ]),
        h("div", { class: "btn-row" }, [
          h("button", {
            class: "btn",
            type: "button",
            text: t("✓ Done — finish exercise"),
            on: { click: finishExercise },
          }),
        ]),
      );

      const frame = (): void => {
        const secs = (Date.now() - restStartEpoch) / 1000;
        num.textContent = formatClock(secs);
        fill.setAttribute("stroke-dashoffset", String(DIAL_C * (1 - ((secs % 60) / 60))));
        rafId = requestAnimationFrame(frame);
      };
      rafId = requestAnimationFrame(frame);
      return;
    }

    // sub === "logging" — the ✓ Done button sits above the dials so you don't
    // have to swipe down across the weight knob (which would rotate it) to reach it.
    container.append(
      h("p", { class: "set-time", text: t("Set time {0}").replace("{0}", formatClock(setElapsedMs / 1000)) }),
      h("div", { class: "btn-row live-actions" }, [
        h("button", {
          class: "btn btn-primary btn-jumbo",
          type: "button",
          text: t("✓ Done"),
          on: { click: commitSet },
        }),
      ]),
      h("div", { class: "card live-dials" }, [
        dialField({
          label: t("Reps"),
          value: setReps,
          step: 1,
          min: 0,
          integer: true,
          unit: t("reps"),
          tone: "signal",
          onCommit: (n) => {
            setReps = n;
            snapshot();
          },
        }),
        dialField({
          label: isBodyweight(equipment) ? t("Added (kg)") : t("Weight (kg)"),
          value: setWeight,
          step: 2.5,
          min: 0,
          integer: false,
          unit: "kg",
          tone: "navy",
          onCommit: (n) => {
            setWeight = n;
            snapshot();
          },
        }),
        renderRirField(),
      ]),
    );
  }

  // ─────────────────────────────── Render ─────────────────────────────────────

  function render(): void {
    stopRaf();
    clear(container);
    if (!state.activeLog) stage = "list";
    snapshot();
    if (stage === "list") renderList();
    else if (stage === "select") renderSelect();
    else renderExercise();
    window.scrollTo(0, 0);
  }

  restore();
  render();
  return () => stopRaf();
}
