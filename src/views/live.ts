import { track } from "../analytics";
import { nextSetTarget } from "../benchmark";
import { clear, h, scrollBehavior } from "../dom";
import { exportSessionPdf, exportSessionPng, shareSession } from "../exporters";
import { newLoggedExercise, newTrainingSession } from "../log";
import { clearProgress, loadProgress, saveProgress } from "../liveProgress";
import {
  deleteSession,
  getSession,
  loadSessions,
  saveSession,
} from "../logStorage";
import {
  findMovement,
  isIsometricHold,
  isolationMovementsForMuscle,
  movementsForMuscle,
} from "../movements";
import { detectPrs, priorSetsFor } from "../records";
import { compoundMovementsByFrequency, exerciseKey, type ExerciseKey } from "../stats";
import type { Cleanup, Nav } from "../router";
import { showUndo } from "./snackbar";
import { setActiveLog, state } from "../state";
import {
  isBodyweight,
  isCardio,
  type Equipment,
  type LoggedExercise,
  type MuscleGroup,
  type TrainingSession,
  type WorkSet,
} from "../types";
import { formatClock, round2, sessionSetCount } from "../util";
import { type Expectation, expectNow } from "../expectation";
import { loadBodyweights } from "../bodyweightStore";
import { registerTranslations, t } from "../i18n";
import {
  initialLiveState,
  type LiveCtx,
  type LiveState,
  type RenderFrame,
} from "./liveState";
import { renderExercise } from "./liveExercise";
import { renderList } from "./liveList";
import { renderSelect } from "./liveSelect";
import { LiveTimers } from "./liveTimers";
import { exportStatus } from "./exportStatus";
import { lastPerformance, MAX_CARDIO_SET_MIN, MAX_SET_MIN } from "./livePanels";

registerTranslations({
  // — RIR chips —
  Failure: "Cădere",
  "4+": "4+",
  // — Set type chips —
  "Set type (optional)": "Tip de set (opțional)",
  "Set type": "Tip de set",
  "Warm-up": "Încălzire",
  "Drop set": "Drop set",
  "warm-up": "încălzire",
  "drop set": "drop set",
  "Working set — counts toward records and weekly volume.":
    "Set de lucru — contează la recorduri și volumul săptămânal.",
  "Warm-up — won't count toward records or weekly volume.":
    "Încălzire — nu contează la recorduri sau volumul săptămânal.",
  "Drop set — a back-off set right after a working set.":
    "Drop set — un set cu greutate redusă imediat după un set de lucru.",
  // — Rest alert —
  "Rest alert": "Alertă pauză",
  Off: "Oprit",
  "Rest over": "Pauza s-a terminat",
  // — Warm-up ramp —
  "Warm-up ramp · working {0}": "Încălzire progresivă · lucru {0}",
  Use: "Folosește",
  "use warm-up step {0}": "folosește pasul de încălzire {0}",
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
  // — Ring picker —
  Recent: "Recente",
  Suggested: "Sugerate",
  "Pick an exercise": "Alege un exercițiu",
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
  // — Fatigue at start —
  "Fatigue coming in": "Oboseală la start",
  Fresh: "Odihnit",
  Good: "Bun",
  Moderate: "Moderat",
  Tired: "Obosit",
  Exhausted: "Epuizat",
  "Logged at the start — pre-session fatigue affects performance.":
    "Notat la început — oboseala de dinainte afectează performanța.",
  "Started {0}": "Început {0}",
  "Ended {0}": "Terminat {0}",
  "Duration {0}": "Durată {0}",
  "In progress": "În desfășurare",
  "Fatigue: {0}": "Oboseală: {0}",
  "Muscles worked": "Mușchi lucrați",
  Hydration: "Hidratare",
  "Protein to recover": "Proteine pentru recuperare",
  "Energy burned": "Energie consumată",
  // — Start screen · session HUD —
  Train: "Antrenament",
  "Start a session, pick an exercise, then time each set and log reps and weight.":
    "Pornește o sesiune, alege un exercițiu, apoi cronometrează fiecare serie și înregistrează repetările și greutatea.",
  "▶ Start session": "▶ Start sesiune",
  "Past sessions — and the Claude analysis — live in History.":
    "Sesiunile trecute — și analiza Claude — sunt în Istoric.",
  "History ▸": "Istoric ▸",
  "↻ Repeat {0}": "↻ Repetă {0}",
  "Start a new session with the same exercises as your last one.":
    "Pornește o sesiune nouă cu aceleași exerciții ca ultima.",
  "Ready now": "Pregătit acum",
  "Still recovering": "Încă în recuperare",
  "Behind on volume this week": "Volum sub țintă săptămâna aceasta",
  "{0}/{1} sets": "{0}/{1} serii",
  "Everything you've trained is recovered.": "Tot ce ai antrenat este recuperat.",
  "{0} set": "{0} serie",
  "{0} sets": "{0} serii",
  "End ▸": "Termină ▸",
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
  'Deleted "{0}".': "S-a șters „{0}”.",
  "Deleted set {0}.": "S-a șters seria {0}.",
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
  "edit set {0}": "editează seria {0}",
  "✓ Save": "✓ Salvează",
  Cancel: "Anulează",
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
  // — Last-time recall —
  "Last time · {0}": "Ultima dată · {0}",
  // — Quick reps × load picks and the live set read-out —
  "Log this set as": "Înregistrează seria ca",
  "Quick reps and weight picks": "Alegeri rapide de repetări și greutate",
  "Last set": "Seria anterioară",
  "Last time": "Ultima dată",
  "{0} kg volume": "{0} kg volum",
  "e1RM {0} kg": "1RM est. {0} kg",
  "PR pace": "ritm de record",
  "Same as {0}": "La fel ca {0}",
  "last set": "seria anterioară",
  "last time": "ultima dată",
  "{0} rep": "{0} repetare",
  "{0} vs {1}": "{0} față de {1}",
  // — Progressive-overload nudge —
  "Next step": "Pasul următor",
  "Try {0}": "Încearcă {0}",
  // — Fatigue-adjusted expectation —
  "Expected now · −{0}% fatigue": "Așteptat acum · −{0}% oboseală",
  "Expected now · fresh": "Așteptat acum · odihnit",
  "~{0} reps @ {1}": "~{0} rep. @ {1}",
  "~{0} reps": "~{0} rep.",
  "Fresh you: {0}": "Odihnit: {0}",
  "{0} · {1} sets earlier": "{0} · {1} seturi înainte",
  "{0} · {1}% unrecovered": "{0} · {1}% nerecuperat",
  "Session load · {0} sets": "Volum sesiune · {0} seturi",
  "Started the session: {0}": "Ai început sesiunea: {0}",
  "From {0} past sessions": "Din {0} sesiuni anterioare",
  "From {0} past sessions + today's sets": "Din {0} sesiuni anterioare + seturile de azi",
  "From today's sets": "Din seturile de azi",
  "Expect ~{0} reps here": "Aștepți ~{0} rep. aici",
  "Expect ~{0} reps here (fresh {1})": "Aștepți ~{0} rep. aici (odihnit {1})",
  "Too heavy for now — expect 0 reps": "Prea greu acum — aștepți 0 rep.",
  "Strength available now: {0}% of fresh": "Forță disponibilă acum: {0}% din odihnit",
  "Now {0}%": "Acum {0}%",
  Now: "Acum",
  "Expected reps by load, fresh vs now": "Repetări așteptate după greutate, odihnit vs acum",
  "+{0} kg — you owned this load last time, move it up.":
    "+{0} kg — ai stăpânit această greutate data trecută, crește-o.",
  "+{0} rep — same load, beat last time by one.":
    "+{0} repetare — aceeași greutate, depășește data trecută cu una.",
  // — Personal records —
  "Personal record!": "Record personal!",
  "Heaviest load yet — {0} kg (was {1})": "Cea mai mare greutate — {0} kg (era {1})",
  "Most reps at this load — {0} (was {1})":
    "Cele mai multe repetări la această greutate — {0} (era {1})",
  "Best estimated 1RM — {0} kg (was {1})": "Cel mai bun 1RM estimat — {0} kg (era {1})",
  // — Plate calculator —
  "Bar {0} kg · per side: {1}": "Bară {0} kg · pe fiecare parte: {1}",
  "+{0} kg short — use micro-plates or round": "+{0} kg lipsă — folosește micro-discuri sau rotunjește",
  "Empty bar — {0} kg": "Bară goală — {0} kg",
  "Below the empty bar ({0} kg)": "Sub bara goală ({0} kg)",
  // — Exercise-chip filter —
  "Filter exercises": "Filtrează exercițiile",
  // — Supersets —
  "Superset with {0}": "Superset cu {0}",
  "Superset — up next": "Superset — urmează",
  "Go to {0} →": "Mergi la {0} →",
  "switch to superset partner {0}": "treci la partenerul de superset {0}",
  // — History filters —
  "Search sessions": "Caută sesiuni",
  "search sessions by name or exercise": "caută sesiuni după nume sau exercițiu",
  "Filter by muscle": "Filtrează după mușchi",
  "All muscles": "Toți mușchii",
  "No sessions match these filters.": "Nicio sesiune nu se potrivește acestor filtre.",
  // — Exercise head / target —
  "{0} · {1}": "{0} · {1}",
  "Target progress": "Progres țintă",
  reps: "repetări",
  // — Plan benchmark / adherence —
  Plan: "Plan",
  "Adherence to plan": "Aderență la plan",
  "{0}% to plan": "{0}% din plan",
  "{0} of {1} planned exercises": "{0} din {1} exerciții planificate",
  "On plan": "Conform planului",
  "set {0} — planned {1}, logged {2}": "seria {0} — planificat {1}, înregistrat {2}",
  "set {0} — planned {1}, not logged yet": "seria {0} — planificat {1}, neînregistrat încă",
  "set {0} — off-plan, logged {1}": "seria {0} — în afara planului, înregistrat {1}",
  "not logged": "neînregistrat",
  "off-plan": "în afara planului",
  "{0} kg": "{0} kg",
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
  "Hold (sec)": "Menținere (sec)",
  "Added (kg)": "Adăugat (kg)",
  "Weight (kg)": "Greutate (kg)",
  "Distance (km)": "Distanță (km)",
  "Speed (km/h)": "Viteză (km/h)",
  "Incline (%)": "Înclinare (%)",
  // — Floating "back to timer" button —
  "↑ Timer": "↑ Cronometru",
  "Back to the timer and set controls": "Înapoi la cronometru și controalele seriei",
  "↑ Selector": "↑ Selector",
  "Back to the exercise selector": "Înapoi la selectorul de exerciții",
});




export function mountLive(root: HTMLElement, nav: Nav): Cleanup {
  const container = h("div", { class: "view view-live" });
  root.appendChild(container);
  const st: LiveState = initialLiveState(state.activeLog !== null);
  const view: RenderFrame = {
    scrollTargetEl: null,
    scrollTargetBlock: "start",
    focusAnchorEl: null,
    focusAnchorText: "",
    focusAnchorAria: "",
  };
  const timers = new LiveTimers();

  /** Point the selection at a movement id, syncing the derived muscle + load type. */
  function selectMovement(id: string): void {
    const mv = findMovement(id);
    if (!mv) return;
    st.movementId = mv.id;
    // A few movements are cross-listed under a muscle other than their primary
    // (Dead Hang under Back, Diamond Push-Up under Chest). Picking one from the
    // muscle the dial is on keeps the dial there instead of jumping to the
    // primary; the logged exercise still records its real primary muscle.
    if (!movementsForMuscle(st.muscle).some((m) => m.id === mv.id)) st.muscle = mv.primaryMuscle;
    st.equipment = mv.equipment;
  }

  /** Switch muscle group and reset the movement to that group's first isolation option. */
  function selectMuscle(m: MuscleGroup): void {
    st.muscle = m;
    st.movementFilter = ""; // each muscle's chip list starts unfiltered
    const first = isolationMovementsForMuscle(m)[0];
    if (first) selectMovement(first.id);
  }

  /**
   * Ensure the current movement is a valid isolation pick for the current muscle;
   * default to its first isolation movement if not. Custom mode lists isolation
   * movements only — compounds live in the compound picker — so a compound
   * selection (e.g. a routine-prescribed lift) is dropped back to isolation here.
   */
  function ensureMovement(): void {
    const movements = isolationMovementsForMuscle(st.muscle);
    if (!movements.some((mv) => mv.id === st.movementId)) {
      const first = movements[0];
      if (first) selectMovement(first.id);
    }
  }

  /** Ensure the selection points at a compound lift; default to the most-trained one if not. */
  function ensureCompound(): void {
    const compounds = compoundMovementsByFrequency(loadSessions());
    if (!compounds.some((mv) => mv.id === st.movementId)) {
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

  // Floating "jump back to the timer" button: once the action/timer row (or
  // the select screen's dial) scrolls out of view it fades in, and one tap
  // returns there. Its target and caption are repointed each render (`view`).
  const fab = h("button", {
    class: "live-fab",
    type: "button",
    on: {
      click: () => view.focusAnchorEl?.scrollIntoView({ block: "start", behavior: scrollBehavior() }),
    },
  });
  root.appendChild(fab);
  const fabObserver = new IntersectionObserver(
    (entries) => {
      const e = entries[0];
      if (e) fab.classList.toggle("is-visible", !e.isIntersecting);
    },
    { threshold: 0 },
  );


  /**
   * Strip above the select/exercise screens while a session is open: session
   * name, ticking wall-clock time since the first tap, logged-set count and the
   * End action — the answer to "how long have I been here and how much have I
   * done?".
   *
   * It pins itself to the top on the select screen, but rides in the flow on
   * the exercise screen: there the auto-scroll parks the Start/Stop button at
   * the top of the viewport, and a pinned strip would sit right over the one
   * control the screen exists for. Scrolling back up still reaches it.
   */
  function renderHud(session: TrainingSession): HTMLElement {
    const time = h("span", { class: "live-hud-time" });
    const tick = (): void => {
      const secs = (Date.now() - new Date(session.startedAt).getTime()) / 1000;
      time.textContent = formatClock(Math.max(0, secs));
    };
    timers.everySecond(tick);
    const sets = sessionSetCount(session);
    return h("div", { class: st.stage === "exercise" ? "live-hud is-flow" : "live-hud" }, [
      h("span", { class: "live-hud-name", text: session.name || t("Live Session") }),
      time,
      h("span", {
        class: "live-hud-sets",
        text: (sets === 1 ? t("{0} set") : t("{0} sets")).replace("{0}", String(sets)),
      }),
      h("button", {
        class: "live-hud-end",
        type: "button",
        text: t("End ▸"),
        aria: { label: t("✓ Done — end session") },
        on: { click: endSession },
      }),
    ]);
  }

  function persist(): void {
    if (state.activeLog) saveSession(state.activeLog);
  }

  // ───────────────────── Export / share (PNG · PDF · share) ───────────────────

  // Persists across re-renders because the element is reused, not recreated.
  const { el: statusEl, set: setStatus, run: runExport } = exportStatus();

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
    if (!s || st.stage === "list") {
      clearProgress();
      return;
    }
    saveProgress({
      sessionId: s.id,
      stage: st.stage,
      sub: st.sub,
      muscle: st.muscle,
      equipment: st.equipment,
      movementId: st.movementId,
      selectMode: st.selectMode,
      hasCurrentEx: st.currentEx !== null,
      currentExIndex: st.currentEx ? s.exercises.indexOf(st.currentEx) : -1,
      setReps: st.setReps,
      setWeight: st.setWeight,
      setHoldSec: st.setHoldSec,
      setDistanceKm: st.setDistanceKm,
      setSpeedKmh: st.setSpeedKmh,
      setInclinePct: st.setInclinePct,
      setRir: st.pendingRir,
      setType: st.pendingSetType,
      setStartEpoch: st.setStartEpoch,
      setElapsedMs: st.setElapsedMs,
      restStartEpoch: st.restStartEpoch,
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
    st.stage = saved.stage;
    st.sub = saved.sub;
    st.muscle = saved.muscle;
    st.equipment = saved.equipment;
    st.movementId = saved.movementId;
    st.selectMode = saved.selectMode;
    st.currentEx = saved.hasCurrentEx
      ? (session.exercises[saved.currentExIndex] ??
        session.exercises[session.exercises.length - 1] ??
        null)
      : null;
    st.setReps = saved.setReps;
    st.setWeight = saved.setWeight;
    st.setHoldSec = saved.setHoldSec;
    st.setDistanceKm = saved.setDistanceKm;
    st.setSpeedKmh = saved.setSpeedKmh;
    st.setInclinePct = saved.setInclinePct;
    st.pendingRir = saved.setRir;
    st.pendingSetType = saved.setType;
    st.setStartEpoch = saved.setStartEpoch;
    st.setElapsedMs = saved.setElapsedMs;
    st.restStartEpoch = saved.restStartEpoch;
    // A running/resting snapshot without its start stamp can't be timed; drop
    // back to idle rather than measuring from the epoch.
    if (st.sub === "running" && st.setStartEpoch <= 0) st.sub = "idle";
    if (st.sub === "resting" && st.restStartEpoch <= 0) st.sub = "idle";
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
    st.currentEx = null;
    st.sub = "idle";
    st.stage = "select";
    render();
  }

  function endSession(): void {
    timers.stopAll();
    const s = state.activeLog;
    if (s) {
      if (s.exercises.some((ex) => ex.sets.length > 0)) {
        // Stamp the end so the session carries its wall-clock duration (start → end).
        s.endedAt = new Date().toISOString();
        saveSession(s);
      } else deleteSession(s.id); // discard a session with nothing logged
    }
    clearProgress();
    setActiveLog(null);
    st.currentEx = null;
    st.sub = "idle";
    st.stage = "list";
    render();
  }

  function startExercise(): void {
    st.currentEx = null;
    st.sub = "idle";
    st.stage = "exercise";
    render();
  }

  /** Re-open an exercise already in the session to add more sets (or review them). */
  function resumeExercise(ex: LoggedExercise): void {
    st.currentEx = ex;
    st.muscle = ex.muscle;
    st.equipment = ex.equipment;
    st.movementId = ex.exerciseId ?? `${ex.muscle}::${ex.equipment}`;
    st.sub = "idle";
    st.stage = "exercise";
    render();
  }

  /** Stable identity of the exercise being trained (logged or still pending). */
  function currentKey(): ExerciseKey {
    return st.currentEx
      ? exerciseKey(st.currentEx)
      : exerciseKey({ muscle: st.muscle, equipment: st.equipment, exerciseId: st.movementId });
  }

  /** Fatigue-adjusted forecast for a movement against the work logged so far this session. */
  function expectationFor(m: MuscleGroup, eq: Equipment, id: string): Expectation | null {
    const bodyweights = loadBodyweights();
    const bw = bodyweights[bodyweights.length - 1]?.kg;
    return expectNow({
      prior: loadSessions().filter((o) => o.id !== state.activeLog?.id),
      active: state.activeLog,
      muscle: m,
      equipment: eq,
      exerciseId: id,
      bodyweights,
      ...(bw !== undefined ? { bodyweightKg: bw } : {}),
    });
  }

  /**
   * Whether the exercise being trained is an isometric hold (plank, dead hang) —
   * logged by time held rather than reps. Reads the logged exercise's identity
   * when one exists, else the pending movement selection.
   */
  function holdActive(): boolean {
    return isIsometricHold(st.currentEx?.exerciseId ?? st.movementId);
  }

  /**
   * The matching set from the last *prior* session this movement was trained —
   * the ghost value the dials seed from when nothing is logged yet this
   * exercise. Falls back to that session's final set when it had fewer sets.
   */
  function historyGhost(setIndex: number): WorkSet | null {
    const lp = lastPerformance(
      loadSessions().filter((s) => s.id !== state.activeLog?.id),
      currentKey(),
    );
    if (!lp) return null;
    return lp.exercise.sets[setIndex] ?? lp.exercise.sets[lp.exercise.sets.length - 1] ?? null;
  }

  function startSet(): void {
    st.prFlash = [];
    st.setStartEpoch = Date.now();
    st.setElapsedMs = 0;
    st.sub = "running";
    render();
  }

  function stopSet(): void {
    timers.stopAll();
    // A set left running (forgotten Stop, resumed hours later) would otherwise
    // record the whole gap as its duration and inflate effort; clamp it.
    st.setElapsedMs = Math.min(
      Date.now() - st.setStartEpoch,
      (isCardio(st.equipment) ? MAX_CARDIO_SET_MIN : MAX_SET_MIN) * 60_000,
    );
    const last =
      st.currentEx && st.currentEx.sets.length ? st.currentEx.sets[st.currentEx.sets.length - 1]! : null;
    if (isCardio(st.equipment)) {
      // Carry the last bout's speed/incline forward; estimate distance from speed
      // over the elapsed time as a starting point the user reads off the machine.
      st.setSpeedKmh = last?.speedKmh ?? st.setSpeedKmh;
      st.setInclinePct = last?.inclinePct ?? st.setInclinePct;
      st.setDistanceKm = round2((st.setSpeedKmh * st.setElapsedMs) / 3_600_000) || (last?.distanceKm ?? st.setDistanceKm);
    } else if (holdActive()) {
      // Isometric hold: the stopwatch *is* the measurement — seed the hold dial
      // from the time just held (falling back to the last hold), and carry any
      // added load forward.
      const held = Math.round(st.setElapsedMs / 1000);
      st.setHoldSec = held > 0 ? held : last?.durationSec ?? st.setHoldSec;
      st.setWeight = last?.weightKg ?? (isBodyweight(st.equipment) ? 0 : st.setWeight);
    } else {
      // Seed the dials from the trainer's prescription for this set when the
      // exercise carries a per-set guideline — so following the plan is a tap, and
      // ramps/pyramids advance set-by-set. Fall back to carrying the last set
      // forward; with nothing logged yet this exercise, ghost in the matching set
      // from the last session this movement was trained (set 1 seeds from last
      // time's set 1, and so on) before the generic default.
      const planned = st.currentEx ? nextSetTarget(st.currentEx) : null;
      const ghost = last ? null : historyGhost(st.currentEx?.sets.length ?? 0);
      const fallbackWeight =
        last?.weightKg ?? ghost?.weightKg ?? (isBodyweight(st.equipment) ? 0 : 10);
      st.setReps = planned?.reps ?? last?.reps ?? ghost?.reps ?? 10;
      st.setWeight = planned?.loadKg ?? fallbackWeight;
    }
    st.pendingRir = null; // proximity to failure is logged fresh per set
    st.pendingSetType = null; // so a forgotten warm-up tag can't bleed into working sets
    st.sub = "logging";
    render();
  }

  function commitSet(): void {
    const s = state.activeLog;
    if (!s) return;
    const durationSec = Math.round(st.setElapsedMs / 1000);
    const set: WorkSet = isCardio(st.equipment)
      ? {
          reps: 0,
          weightKg: 0,
          durationSec,
          distanceKm: st.setDistanceKm,
          speedKmh: st.setSpeedKmh,
          inclinePct: st.setInclinePct,
        }
      : holdActive()
        ? {
            // Isometric hold: the hold time is the work, so it (not the raw
            // stopwatch) is stored as the duration, with reps left at 0.
            reps: 0,
            weightKg: st.setWeight,
            durationSec: st.setHoldSec,
            ...(st.pendingSetType !== null ? { setType: st.pendingSetType } : {}),
          }
        : {
            reps: st.setReps,
            weightKg: st.setWeight,
            durationSec,
            ...(st.pendingRir !== null ? { rir: st.pendingRir } : {}),
            ...(st.pendingSetType !== null ? { setType: st.pendingSetType } : {}),
          };
    // Records check before the set joins the history: everything previously
    // logged for this movement — other sessions plus this exercise's earlier sets.
    const prior = priorSetsFor(
      loadSessions().filter((other) => other.id !== s.id),
      currentKey(),
    ).concat(st.currentEx?.sets ?? []);
    st.prFlash = detectPrs(prior, set, st.equipment);
    if (!st.currentEx) {
      const mv = findMovement(st.movementId);
      if (!mv) return;
      st.currentEx = newLoggedExercise(mv);
      s.exercises.push(st.currentEx);
    }
    st.currentEx.sets.push(set);
    track("set_logged", { cardio: isCardio(st.equipment) });
    persist();
    st.restStartEpoch = Date.now();
    st.sub = "resting";
    render();
  }

  function finishExercise(): void {
    st.prFlash = [];
    st.currentEx = null;
    st.sub = "idle";
    st.stage = "select";
    render();
  }

  function deleteSet(i: number): void {
    const ex = st.currentEx;
    const removed = ex?.sets[i];
    if (!ex || !removed) return;
    ex.sets.splice(i, 1);
    if (st.editingSetIndex !== null) st.editingSetIndex = null;
    persist();
    render();
    // Undo re-inserts the captured set — only while the exercise still belongs
    // to the open session (leaving the view dismisses the snackbar anyway).
    showUndo(t("Deleted set {0}.").replace("{0}", String(i + 1)), () => {
      if (!state.activeLog?.exercises.includes(ex)) return;
      ex.sets.splice(Math.min(i, ex.sets.length), 0, removed);
      persist();
      render();
    });
  }

  /** Open the inline editor for an already-logged set (reps/weight, or hold/weight). */
  function startEditSet(i: number): void {
    const set = st.currentEx?.sets[i];
    if (!set) return;
    st.editingSetIndex = i;
    st.editReps = set.reps;
    st.editWeight = set.weightKg;
    st.editHoldSec = set.durationSec ?? 0;
    st.editRir = set.rir ?? null;
    render();
  }

  /** Persist the edited values back onto the logged set (hold time, or reps × load). */
  function saveEditSet(): void {
    if (!st.currentEx || st.editingSetIndex === null) return;
    const set = st.currentEx.sets[st.editingSetIndex];
    if (set) {
      if (holdActive()) {
        set.durationSec = st.editHoldSec;
      } else {
        set.reps = st.editReps;
        // RIR only applies to strength (non-hold) sets; drop it when cleared.
        if (st.editRir === null) delete set.rir;
        else set.rir = st.editRir;
      }
      set.weightKg = st.editWeight;
      persist();
    }
    st.editingSetIndex = null;
    render();
  }

  function cancelEditSet(): void {
    st.editingSetIndex = null;
    render();
  }

  // ─────────────────────────────── Render ─────────────────────────────────────

  function render(): void {
    timers.stopAll();
    clear(container);
    if (!state.activeLog) st.stage = "list";
    snapshot();
    // Cast keeps the assignment-narrowed type at `HTMLElement | null` so the
    // renderers' assignments (in the dispatch below) are visible at the check.
    view.scrollTargetEl = null as HTMLElement | null;
    view.scrollTargetBlock = "start";
    view.focusAnchorEl = null as HTMLElement | null;
    view.focusAnchorText = t("↑ Timer");
    view.focusAnchorAria = t("Back to the timer and set controls");
    // The sticky session HUD rides above both in-session screens.
    if (st.stage !== "list" && state.activeLog) container.append(renderHud(state.activeLog));
    if (st.stage === "list") renderList(ctx);
    else if (st.stage === "select") renderSelect(ctx);
    else renderExercise(ctx);
    // During a running set / rest the renderer points scrollTargetEl at the
    // action row so the button + timer sit at the top of the viewport; every
    // other screen jumps back to the page top.
    if (view.scrollTargetEl) view.scrollTargetEl.scrollIntoView({ block: view.scrollTargetBlock });
    else window.scrollTo(0, 0);
    // Watch the in-set action/timer row (when there is one) so the floating
    // "back to timer" button only surfaces once it has scrolled off-screen.
    fabObserver.disconnect();
    fab.textContent = view.focusAnchorText;
    fab.setAttribute("aria-label", view.focusAnchorAria);
    if (view.focusAnchorEl) fabObserver.observe(view.focusAnchorEl);
    else fab.classList.remove("is-visible");
  }

  // Everything the per-screen renderers (liveList / liveSelect / liveExercise) use.
  const ctx: LiveCtx = {
    st,
    view,
    timers,
    nav,
    container,
    statusEl,
    render,
    persist,
    snapshot,
    startSession,
    endSession,
    sessionExportRow,
    selectMovement,
    selectMuscle,
    ensureMovement,
    ensureCompound,
    nextPlanned,
    startExercise,
    resumeExercise,
    finishExercise,
    startSet,
    stopSet,
    commitSet,
    deleteSet,
    startEditSet,
    saveEditSet,
    cancelEditSet,
    currentKey,
    holdActive,
    historyGhost,
    expectationFor,
    renderToggle,
  };

  restore();
  render();
  return () => {
    timers.dispose();
    fabObserver.disconnect();
    fab.remove();
  };
}
