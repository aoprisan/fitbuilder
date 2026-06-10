import { clear, h } from "../dom";
import { registerTranslations, t } from "../i18n";
import { loadProgress } from "../liveProgress";
import { getSession, loadSessions } from "../logStorage";
import { loadMode } from "../mode";
import { allMovements } from "../movements";
import { clearOneRm, loadOneRmMaxes, setOneRm } from "../oneRmStore";
import { loadSheets } from "../sheetStorage";
import {
  muscleRecovery,
  overallRecovery,
  overallStatus,
  systemicRecovery,
} from "../recovery";
import { weeklyStreak } from "../records";
import type { Nav } from "../router";
import { exerciseKeyLabel } from "../stats";
import { trainTodayPicks } from "../trainToday";
import { MUSCLE_LABELS } from "../types";
import { round2, sessionSetCount } from "../util";
import { shareApp } from "../exporters";
import { seedRoutine } from "./claudeRoutine";
import { recoveryRing, ringCell } from "./recovery";

registerTranslations({
  "Train · Log": "Antrenează · Jurnal",
  Share: "Distribuie",
  "Two tools in one ledger — a live training log for your own workouts, and shareable routines for coaching. Use either; they hand off when you want.":
    "Două instrumente într-un singur registru — un jurnal de antrenament live pentru sesiunile tale și rutine partajabile pentru coaching. Folosește-le pe oricare; se predau una alteia când vrei.",
  "New here?": "Nou aici?",
  "Get a plan from Claude": "Obține un plan de la Claude",
  "No coach yet? Answer three quick questions and let Claude draft a starting routine you can follow set-by-set.":
    "Încă fără antrenor? Răspunde la trei întrebări rapide și lasă-l pe Claude să schițeze o rutină de început pe care o poți urma serie cu serie.",
  "For your training": "Pentru antrenamentul tău",
  "Train & track": "Antrenează și urmărește",
  "Log a workout live, set by set, with rest timers — effort, hydration and progress add up in Stats.":
    "Înregistrează un antrenament live, serie cu serie, cu cronometre de pauză — efortul, hidratarea și progresul se adună în Statistici.",
  "Last: {0} · {1} ex · {2} {3}": "Ultimul: {0} · {1} ex · {2} {3}",
  session: "sesiune",
  set: "serie",
  sets: "serii",
  "No sessions yet — start one when you reach the gym.":
    "Încă nicio sesiune — pornește una când ajungi la sală.",
  "{0}-week streak — at least one session every week.":
    "Serie de {0} săptămâni — cel puțin o sesiune în fiecare săptămână.",
  Today: "Astăzi",
  "What to train today": "Ce să antrenezi astăzi",
  "Recovered muscle groups that have banked the least volume this week — fresh and under-dosed first.":
    "Grupe musculare recuperate care au acumulat cel mai puțin volum săptămâna aceasta — proaspete și sub-dozate primele.",
  "{0} sets this week · {1}% recovered": "{0} serii săptămâna aceasta · {1}% recuperat",
  "Resume Session": "Reia sesiunea",
  "Start Live Session": "Pornește sesiune live",
  "Progress Stats": "Statistici progres",
  "Build a routine": "Construiește o rutină",
  Readiness: "Pregătire",
  Recovery: "Recuperare",
  "Muscle map": "Hartă musculară",
  "Body map": "Hartă corporală",
  "A 3D figure shaded by strength, growth, fatigue or efficiency — drag to spin, tap a muscle to read it.":
    "O siluetă 3D colorată după forță, creștere, oboseală sau eficiență — rotește-o cu degetul, atinge un mușchi pentru detalii.",
  "Open Body Map": "Deschide harta corporală",
  "Log a session to start tracking how recovered each muscle is — red just-worked, green ready again.":
    "Înregistrează o sesiune pentru a urmări cât de recuperat este fiecare mușchi — roșu tocmai lucrat, verde gata din nou.",
  "All muscle groups recovered — ready for a new session.":
    "Toate grupele musculare recuperate — gata pentru o nouă sesiune.",
  "Most fatigued: {0} · {1}% (~{2}h to go).": "Cel mai obosit: {0} · {1}% (~{2}h rămase).",
  Muscles: "Mușchi",
  Systemic: "Sistemic",
  "Lift to log a one-rep max for": "Exercițiu pentru care să înregistrezi un maxim la o repetare",
  "Tested one-rep max in kg": "Maxim testat la o repetare în kg",
  "Saved on this device per lift, and shown beside your Stats estimate.":
    "Salvat pe acest dispozitiv per exercițiu și afișat alături de estimarea din Statistici.",
  "No maxes logged yet.": "Încă niciun maxim înregistrat.",
  "remove logged max for {0}": "elimină maximul înregistrat pentru {0}",
  "Save max": "Salvează maximul",
  "Saved {0} — {1} kg.": "Salvat {0} — {1} kg.",
  "Cleared {0}.": "Șters {0}.",
  "Personal records": "Recorduri personale",
  "One-rep max": "Maxim la o repetare",
  "Log a max you tested — in or out of a workout. Pick the lift, enter the weight, and it shows up in Stats.":
    "Înregistrează un maxim pe care l-ai testat — în timpul sau în afara unui antrenament. Alege exercițiul, introdu greutatea și apare în Statistici.",
  Lift: "Exercițiu",
  "Tested max (kg)": "Maxim testat (kg)",
  "Your routines": "Rutinele tale",
  "Saved routines": "Rutine salvate",
  "Routines your coach shared with you, saved on this device — run one as a checklist or start it live.":
    "Rutine pe care antrenorul ți le-a trimis, salvate pe acest dispozitiv — rulează una ca listă de bifat sau pornește-o live.",
  "{0} saved": "{0} salvate",
  "No routines saved yet — open a link from your coach to add one.":
    "Nicio rutină salvată încă — deschide un link de la antrenorul tău pentru a adăuga una.",
  "View saved routines": "Vezi rutinele salvate",
  "For routines & coaching": "Pentru rutine și coaching",
  Routines: "Rutine",
  "Build or import training routines and share them as PNG/PDF on WhatsApp — for a coach handing plans to students. Run one live to log it, or as a checklist.":
    "Creează sau importă rutine de antrenament și distribuie-le ca PNG/PDF pe WhatsApp — pentru un antrenor care oferă planuri studenților. Rulează una live pentru a o înregistra sau ca listă de bifat.",
  "Routine Sheets": "Fișe de rutină",
  "Spread the word": "Răspândește vestea",
  "Share app": "Distribuie aplicația",
  "Send a friend the app — a branded card with the install link, copied to your clipboard too.":
    "Trimite aplicația unui prieten — un card cu sigla și linkul de instalare, copiat și în clipboard.",
  "Shared — link copied to your clipboard too.":
    "Distribuit — linkul a fost copiat și în clipboard.",
  "Saved the invite image — link copied to your clipboard.":
    "Imaginea de invitație a fost salvată — linkul a fost copiat în clipboard.",
  "Couldn't share just now — please try again.":
    "Nu s-a putut distribui acum — încearcă din nou.",
});

export function mountHome(root: HTMLElement, nav: Nav): void {
  const sessions = loadSessions().sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const last = sessions[0];

  // A live session is in progress when there's a saved flow snapshot whose
  // session still exists — the same condition Live's restore() resumes from.
  const progress = loadProgress();
  const liveRunning = progress !== null && getSession(progress.sessionId) !== undefined;

  const hero = h("section", { class: "hero" }, [
    h("p", { class: "eyebrow", text: "GYM LOG" }),
    h("h1", { class: "display" }, [t("Train · Log"), h("br"), t("Share")]),
    h("p", {
      class: "lede",
      text: t(
        "Two tools in one ledger — a live training log for your own workouts, and shareable routines for coaching. Use either; they hand off when you want.",
      ),
    }),
  ]);

  // ── Getting started — let Claude draft a first routine ────────────────────
  const claudeStartCard = h("section", { class: "card" }, [
    h("p", { class: "eyebrow", text: t("New here?") }),
    h("h2", { class: "section-title", text: t("Get a plan from Claude") }),
    h("p", {
      class: "plan-meta",
      text: t(
        "No coach yet? Answer three quick questions and let Claude draft a starting routine you can follow set-by-set.",
      ),
    }),
    h("div", { class: "btn-row" }, [
      h("button", {
        class: "btn btn-primary",
        text: t("Get a plan from Claude"),
        on: { click: () => nav.go("claudeStart") },
      }),
    ]),
  ]);

  // ── Lane 1: the athlete — log your own training, watch it add up ──────────
  const lastSets = last ? sessionSetCount(last) : 0;
  const lastLine = last
    ? h("p", {
        class: "plan-meta",
        text: t("Last: {0} · {1} ex · {2} {3}")
          .replace("{0}", last.name || t("session"))
          .replace("{1}", String(last.exercises.length))
          .replace("{2}", String(lastSets))
          .replace("{3}", lastSets === 1 ? t("set") : t("sets")),
      })
    : h("p", {
        class: "plan-meta",
        text: t("No sessions yet — start one when you reach the gym."),
      });

  const trainingLane = h("section", { class: "card" }, [
    h("p", { class: "eyebrow", text: t("For your training") }),
    h("h2", { class: "section-title", text: t("Train & track") }),
    h("p", {
      class: "plan-meta",
      text: t(
        "Log a workout live, set by set, with rest timers — effort, hydration and progress add up in Stats.",
      ),
    }),
    lastLine,
    // Consistency streak — consecutive calendar weeks with a logged session.
    // Shown from 2 weeks up; one week isn't a streak yet.
    ...(weeklyStreak(sessions) >= 2
      ? [
          h("p", {
            class: "plan-meta home-streak",
            text: `🔥 ${t("{0}-week streak — at least one session every week.").replace(
              "{0}",
              String(weeklyStreak(sessions)),
            )}`,
          }),
        ]
      : []),
    h("div", { class: "btn-row" }, [
      h("button", {
        class: "btn btn-primary",
        text: liveRunning ? t("Resume Session") : t("Start Live Session"),
        on: { click: () => nav.go("live") },
      }),
      h("button", { class: "btn", text: t("Progress Stats"), on: { click: () => nav.go("stats") } }),
      // History-driven routine builder — only worth offering once there's training
      // to build from (cold-start is covered by the "Get a plan from Claude" card).
      ...(last
        ? [
            h("button", {
              class: "btn",
              text: t("Build a routine"),
              on: {
                click: () => {
                  seedRoutine({ scope: "whole" });
                  nav.go("claudeRoutine");
                },
              },
            }),
          ]
        : []),
    ]),
  ]);

  // ── Saved routines — a student's library of coach-shared plans ────────────
  const savedSheetCount = loadSheets().length;
  const savedRoutinesCard = h("section", { class: "card" }, [
    h("p", { class: "eyebrow", text: t("Your routines") }),
    h("h2", { class: "section-title", text: t("Saved routines") }),
    h("p", {
      class: "plan-meta",
      text: t(
        "Routines your coach shared with you, saved on this device — run one as a checklist or start it live.",
      ),
    }),
    h("p", {
      class: "plan-meta",
      text:
        savedSheetCount > 0
          ? t("{0} saved").replace("{0}", String(savedSheetCount))
          : t("No routines saved yet — open a link from your coach to add one."),
    }),
    h("div", { class: "btn-row" }, [
      h("button", {
        class: "btn btn-accent",
        text: t("View saved routines"),
        on: { click: () => nav.go("savedRoutines") },
      }),
    ]),
  ]);

  // ── Body map — a link to the 3D muscle figure. A plain link card (no WebGL /
  // Three.js loaded on Home) so it stays a cheap discovery shortcut; the heavy
  // scene is built only once you open the view. Shown only with training logged,
  // since the destination is empty without it.
  const bodyMapCard = h("section", { class: "card" }, [
    h("p", { class: "eyebrow", text: t("Muscle map") }),
    h("h2", { class: "section-title", text: t("Body map") }),
    h("p", {
      class: "plan-meta",
      text: t(
        "A 3D figure shaded by strength, growth, fatigue or efficiency — drag to spin, tap a muscle to read it.",
      ),
    }),
    h("div", { class: "btn-row" }, [
      h("button", { class: "btn", text: t("Open Body Map"), on: { click: () => nav.go("body") } }),
    ]),
  ]);

  // ── What to train today — recovered + under-dosed muscles, ranked ──────────
  function renderTrainTodayCard(): HTMLElement | null {
    const picks = trainTodayPicks(sessions);
    if (picks.length === 0) return null;
    const rows = picks.map((p) =>
      h("div", { class: "muscle-row" }, [
        h("span", { class: "muscle-name", text: t(MUSCLE_LABELS[p.muscle]) }),
        h("span", {
          class: "muscle-stat",
          text: t("{0} sets this week · {1}% recovered")
            .replace("{0}", String(p.weeklySets))
            .replace("{1}", String(Math.round(p.recovered * 100))),
        }),
      ]),
    );
    return h("section", { class: "card train-today" }, [
      h("p", { class: "eyebrow", text: t("Today") }),
      h("h2", { class: "section-title", text: t("What to train today") }),
      h("p", {
        class: "plan-meta",
        text: t(
          "Recovered muscle groups that have banked the least volume this week — fresh and under-dosed first.",
        ),
      }),
      ...rows,
      h("div", { class: "btn-row" }, [
        h("button", {
          class: "btn btn-primary",
          text: liveRunning ? t("Resume Session") : t("Start Live Session"),
          on: { click: () => nav.go("live") },
        }),
      ]),
    ]);
  }

  // ── Recovery — how recovered each muscle is since it was last trained ──────
  function renderRecoveryCard(): HTMLElement {
    const recoveries = muscleRecovery(sessions);
    const trained = recoveries.some((r) => r.lastTrainedAt !== null);

    const body: HTMLElement[] = [
      h("p", { class: "eyebrow", text: t("Readiness") }),
      h("h2", { class: "section-title", text: t("Recovery") }),
    ];

    if (!trained) {
      body.push(
        h("p", {
          class: "plan-meta",
          text: t(
            "Log a session to start tracking how recovered each muscle is — red just-worked, green ready again.",
          ),
        }),
      );
    } else {
      const overall = overallRecovery(recoveries);
      const systemic = systemicRecovery(sessions);
      const top = recoveries[0]!; // least recovered
      const meta =
        top.recovered >= 1
          ? t("All muscle groups recovered — ready for a new session.")
          : t("Most fatigued: {0} · {1}% (~{2}h to go).")
              .replace("{0}", t(MUSCLE_LABELS[top.muscle]))
              .replace("{1}", String(Math.round(top.recovered * 100)))
              .replace("{2}", String(top.hoursRemaining));
      body.push(
        h("div", { class: "recovery-home-row" }, [
          h("div", { class: "recovery-rings" }, [
            ringCell(recoveryRing(overall, overallStatus(overall), { size: "sm" }), t("Muscles")),
            ringCell(
              recoveryRing(systemic.readiness, overallStatus(systemic.readiness), { size: "sm" }),
              t("Systemic"),
            ),
          ]),
          h("p", { class: "plan-meta recovery-home-meta", text: meta }),
        ]),
      );
    }

    body.push(
      h("div", { class: "btn-row" }, [
        h("button", { class: "btn", text: t("Recovery"), on: { click: () => nav.go("recovery") } }),
      ]),
    );

    return h("section", { class: "card recovery-home" }, body);
  }

  // ── One-rep max — log a tested max from anywhere, not just mid-workout ─────
  function renderOneRmCard(): HTMLElement {
    const select = h(
      "select",
      { class: "onerm-log-select", aria: { label: t("Lift to log a one-rep max for") } },
      allMovements().map((mv) => h("option", { value: mv.id, text: exerciseKeyLabel(mv.id) })),
    );
    const kgInput = h("input", {
      class: "onerm-log-input",
      type: "number",
      inputmode: "decimal",
      min: "0",
      step: "2.5",
      placeholder: "—",
      aria: { label: t("Tested one-rep max in kg") },
    });
    const status = h("p", {
      class: "onerm-note",
      text: t("Saved on this device per lift, and shown beside your Stats estimate."),
    });
    const listHost = h("div", { class: "saved-list onerm-log-list" });

    // Mirror the stored max for the chosen lift into the input.
    const syncInput = (): void => {
      const current = loadOneRmMaxes()[select.value];
      kgInput.value = current !== undefined ? String(current) : "";
    };

    const renderList = (): void => {
      clear(listHost);
      const entries = Object.entries(loadOneRmMaxes()).sort((a, b) =>
        exerciseKeyLabel(a[0]).localeCompare(exerciseKeyLabel(b[0])),
      );
      if (entries.length === 0) {
        listHost.appendChild(h("p", { class: "empty", text: t("No maxes logged yet.") }));
        return;
      }
      for (const [key, kg] of entries) {
        const label = exerciseKeyLabel(key);
        listHost.appendChild(
          h("div", { class: "onerm-log-row" }, [
            h("span", { class: "onerm-log-name", text: label }),
            h("span", { class: "onerm-log-kg", text: `${kg} kg` }),
            h("button", {
              class: "icon-btn danger",
              type: "button",
              text: "✕",
              aria: { label: t("remove logged max for {0}").replace("{0}", label) },
              on: {
                click: () => {
                  clearOneRm(key);
                  renderList();
                  syncInput();
                },
              },
            }),
          ]),
        );
      }
    };

    select.addEventListener("change", syncInput);

    const saveBtn = h("button", {
      class: "btn btn-primary btn-small",
      type: "button",
      text: t("Save max"),
    });
    saveBtn.addEventListener("click", () => {
      const n = parseFloat(kgInput.value);
      const label = exerciseKeyLabel(select.value);
      if (Number.isFinite(n) && n > 0) {
        setOneRm(select.value, n);
        status.textContent = t("Saved {0} — {1} kg.")
          .replace("{0}", label)
          .replace("{1}", String(round2(n)));
      } else {
        clearOneRm(select.value);
        status.textContent = t("Cleared {0}.").replace("{0}", label);
      }
      renderList();
      syncInput();
    });

    syncInput();
    renderList();

    return h("section", { class: "card onerm-log" }, [
      h("p", { class: "eyebrow", text: t("Personal records") }),
      h("h2", { class: "section-title", text: t("One-rep max") }),
      h("p", {
        class: "plan-meta",
        text: t(
          "Log a max you tested — in or out of a workout. Pick the lift, enter the weight, and it shows up in Stats.",
        ),
      }),
      h("label", { class: "field" }, [h("span", { class: "field-label", text: t("Lift") }), select]),
      h("label", { class: "field" }, [
        h("span", { class: "field-label", text: t("Tested max (kg)") }),
        kgInput,
      ]),
      h("div", { class: "btn-row" }, [saveBtn]),
      status,
      listHost,
    ]);
  }

  // ── Share the app — a branded PNG invite + the install link, both copied so
  // a happy user (coach or student) can pass it on. The growth loop, surfaced. ─
  function renderShareAppCard(): HTMLElement {
    const status = h("p", { class: "plan-meta" });
    const shareBtn = h("button", {
      class: "btn btn-primary",
      type: "button",
      text: t("Share app"),
    });
    shareBtn.addEventListener("click", async () => {
      shareBtn.disabled = true;
      try {
        const { result } = await shareApp();
        status.textContent =
          result === "shared"
            ? t("Shared — link copied to your clipboard too.")
            : t("Saved the invite image — link copied to your clipboard.");
      } catch {
        status.textContent = t("Couldn't share just now — please try again.");
      } finally {
        shareBtn.disabled = false;
      }
    });

    return h("section", { class: "card" }, [
      h("p", { class: "eyebrow", text: t("Spread the word") }),
      h("h2", { class: "section-title", text: t("Share app") }),
      h("p", {
        class: "plan-meta",
        text: t(
          "Send a friend the app — a branded card with the install link, copied to your clipboard too.",
        ),
      }),
      h("div", { class: "btn-row" }, [shareBtn]),
      status,
    ]);
  }

  // ── Lane 2: the coach — author routines, share them, run them ─────────────
  const routinesLane = h("section", { class: "card" }, [
    h("p", { class: "eyebrow", text: t("For routines & coaching") }),
    h("h2", { class: "section-title", text: t("Routines") }),
    h("p", {
      class: "plan-meta",
      text: t(
        "Build or import training routines and share them as PNG/PDF on WhatsApp — for a coach handing plans to students. Run one live to log it, or as a checklist.",
      ),
    }),
    h("div", { class: "btn-row" }, [
      h("button", { class: "btn btn-accent", text: t("Routine Sheets"), on: { click: () => nav.go("sheet") } }),
    ]),
  ]);

  // Hard gate: Home shows only the active mode's lane. Student = train/track,
  // recovery, personal records, and the Claude getting-started draft (so a
  // student without a coach can still get a starting plan); Trainer = authoring.
  // App maintenance (Update app, Clear all data) lives in the Settings sheet.
  const cards =
    loadMode() === "trainer"
      ? [hero, routinesLane, renderShareAppCard()]
      : [
          hero,
          // Body map leads the day-to-day flow: the student opens Home to check
          // muscle state, then start/resume. It sits right under the hero, above
          // Train & track, so it's visible without scrolling. The map only shows
          // once there's training to fill it in.
          ...(last ? [bodyMapCard] : []),
          // "What to train today" sits right above Train & track — the answer to
          // the question a returning user opens the app with. Empty history → null.
          ...((): HTMLElement[] => {
            const card = renderTrainTodayCard();
            return card ? [card] : [];
          })(),
          trainingLane,
          renderRecoveryCard(),
          claudeStartCard,
          renderOneRmCard(),
          // Saved routines sit at the foot of the student home — the library is a
          // "go find a plan" destination, below the day-to-day train/track flow.
          savedRoutinesCard,
          // Share the app sits last — a low-priority "tell a friend" growth nudge.
          renderShareAppCard(),
        ];

  root.appendChild(h("div", { class: "view view-home" }, cards));
}
