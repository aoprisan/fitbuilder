import { clear, h } from "../dom";
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
import { registerTranslations, t } from "../i18n";
import { repeatSession } from "../log";
import { clearProgress, loadProgress } from "../liveProgress";
import { deleteSession, getSession, loadSessions, saveSession } from "../logStorage";
import type { Cleanup, Nav } from "../router";
import { exerciseKey, type ExerciseKey } from "../stats";
import { setActiveLog, state } from "../state";
import {
  FATIGUE_LABELS,
  MUSCLE_GROUPS,
  MUSCLE_LABELS,
  type MuscleGroup,
  type TrainingSession,
} from "../types";
import {
  formatDuration,
  formatSessionDate,
  formatSessionTime,
  sessionDurationSec,
  sessionSetCount,
  sessionVolume,
} from "../util";
import { seedExercise } from "./exercise";
import { renderSessionSummary } from "./sessionSummary";
import { showUndo } from "./snackbar";

registerTranslations({
  History: "Istoric",
  "Every logged session — resume or repeat one, or send a stretch of history to Claude.":
    "Fiecare sesiune înregistrată — reia sau repetă una, sau trimite o bucată de istoric la Claude.",
  "No sessions yet — your training history lands here.":
    "Încă nicio sesiune — istoricul antrenamentelor apare aici.",
  // — Analyze with Claude —
  "Analyze with Claude": "Analizează cu Claude",
  "Sends a training report to Claude for a read on progress, fatigue and what to do next.":
    "Trimite un raport de antrenament la Claude pentru o analiză a progresului, oboselii și pașilor următori.",
  Scope: "Interval",
  "This session": "Sesiunea curentă",
  All: "Toate",
  "Analyze ▸": "Analizează ▸",
  "Copy prompt": "Copiază prompt",
  "analyze the selected sessions in Claude": "analizează sesiunile selectate în Claude",
  "copy the selected sessions as a prompt for any AI":
    "copiază sesiunile selectate ca prompt pentru orice AI",
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
  // — Session cards —
  "{0} exercises · {1} sets": "{0} exerciții · {1} serii",
  "{0} kg lifted": "{0} kg ridicate",
  "Untitled session": "Sesiune fără titlu",
  "Effort & recovery": "Efort și recuperare",
  Resume: "Reia",
  Repeat: "Repetă",
  Delete: "Șterge",
  'Deleted "{0}".': "S-a șters „{0}”.",
  "repeat {0} as a new session": "repetă {0} ca o sesiune nouă",
  "this session": "această sesiune",
  "Started {0}": "Început {0}",
  "Ended {0}": "Terminat {0}",
  "Duration {0}": "Durată {0}",
  "In progress": "În desfășurare",
  "Fatigue: {0}": "Oboseală: {0}",
  "open history for {0}": "deschide istoricul pentru {0}",
  "Export · Analyze": "Export · Analizează",
  "Share ▸": "Partajează ▸",
  "share {0}": "partajează {0}",
  "save {0} as PNG": "salvează {0} ca PNG",
  "save {0} as PDF": "salvează {0} ca PDF",
  "ask Claude about {0}": "întreabă Claude despre {0}",
  "copy {0} as a prompt for any AI": "copiază {0} ca prompt pentru orice AI",
  "Ask Claude ▸": "Întreabă Claude ▸",
  "Export JSON": "Exportă JSON",
  "export {0} as JSON": "exportă {0} ca JSON",
  "Opened the share sheet — pick WhatsApp.":
    "S-a deschis fereastra de partajare — alege WhatsApp.",
  "Sharing isn't available here, so the PNG was downloaded instead.":
    "Partajarea nu este disponibilă aici, așa că PNG-ul a fost descărcat în schimb.",
  // — Filters —
  "Search sessions": "Caută sesiuni",
  "search sessions by name or exercise": "caută sesiuni după nume sau exercițiu",
  "Filter by muscle": "Filtrează după mușchi",
  "All muscles": "Toți mușchii",
  "No sessions match these filters.": "Nicio sesiune nu se potrivește acestor filtre.",
  // — Export all —
  "Export sessions": "Exportă sesiuni",
  "Download all {0} logged {1} to import into other tools and analyse elsewhere.":
    "Descarcă toate cele {0} {1} înregistrate pentru a le importa în alte instrumente și a le analiza altundeva.",
  session: "sesiune",
  sessions: "sesiuni",
  "Download JSON": "Descarcă JSON",
  "Download XML": "Descarcă XML",
});

/** Analysis scope: the open session, the last N logged, or everything. */
type AnalyzeScope = "this" | 3 | 5 | 10 | "all";

/**
 * History — every logged session as a card stack, with the Claude-analysis
 * entry point (current session or the last N) at the top. Exercise chips on
 * each card open the per-movement detail screen.
 */
export function mountHistory(root: HTMLElement, nav: Nav): Cleanup {
  const container = h("div", { class: "view view-history" });
  root.appendChild(container);

  const sessions = loadSessions().sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const chronological = [...sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt));

  // The open live session — analyzable as "this session" while it has work.
  const active = state.activeLog && sessionSetCount(state.activeLog) > 0 ? state.activeLog : null;
  let scope: AnalyzeScope = active ? "this" : 5;
  let filterText = "";
  let filterMuscle: MuscleGroup | "" = "";

  // ─────────────────────── Status + busy guard (shared) ──────────────────────

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

  // ───────────────────────── Analyze with Claude ──────────────────────────────

  /** The sessions the current scope selects, chronological (oldest first). */
  function scoped(): TrainingSession[] {
    if (scope === "this") return active ? [active] : [];
    if (scope === "all") return chronological;
    return chronological.slice(-scope);
  }

  function renderAnalyzeCard(): HTMLElement {
    const chips = h("div", { class: "toggle", role: "group", aria: { label: t("Scope") } });
    const options: AnalyzeScope[] = [...(active ? (["this"] as const) : []), 3, 5, 10, "all"];
    const paintChips = (): void => {
      clear(chips);
      for (const opt of options) {
        const label = opt === "this" ? t("This session") : opt === "all" ? t("All") : String(opt);
        chips.append(
          h("button", {
            class: scope === opt ? "toggle-btn active" : "toggle-btn",
            type: "button",
            text: label,
            aria: { pressed: String(scope === opt) },
            on: {
              click: () => {
                scope = opt;
                paintChips();
              },
            },
          }),
        );
      }
    };
    paintChips();

    return h("section", { class: "card history-analyze" }, [
      h("p", { class: "eyebrow", text: t("Analyze with Claude") }),
      h("p", {
        class: "plan-meta",
        text: t(
          "Sends a training report to Claude for a read on progress, fatigue and what to do next.",
        ),
      }),
      h("div", { class: "field" }, [h("span", { class: "field-label", text: t("Scope") }), chips]),
      h("div", { class: "btn-row" }, [
        h("button", {
          class: "btn btn-accent",
          type: "button",
          text: t("Analyze ▸"),
          aria: { label: t("analyze the selected sessions in Claude") },
          on: {
            click: () =>
              runExport("Analyze ▸", async () => {
                const picked = scoped();
                const result =
                  scope === "this" && picked.length === 1
                    ? await analyzeSessionInClaude(picked[0]!)
                    : await analyzeSessionsInClaude(picked);
                setStatus(analyzeMsg(result), "ok");
              }),
          },
        }),
        h("button", {
          class: "btn",
          type: "button",
          text: t("Copy prompt"),
          aria: { label: t("copy the selected sessions as a prompt for any AI") },
          on: {
            click: () =>
              runExport("Copy prompt", async () => {
                const picked = scoped();
                const result =
                  scope === "this" && picked.length === 1
                    ? await copySessionPrompt(picked[0]!)
                    : await copySessionsPrompt(picked);
                setStatus(copyMsg(result), "ok");
              }),
          },
        }),
      ]),
      statusEl,
    ]);
  }

  // ───────────────────────────── Session cards ────────────────────────────────

  function resumeSession(s: TrainingSession): void {
    // A mid-set snapshot of this same session resumes exactly where it left off;
    // opening any other session clears the snapshot so Live lands on it instead.
    if (loadProgress()?.sessionId !== s.id) {
      clearProgress();
      const fresh = getSession(s.id);
      if (!fresh) return;
      setActiveLog(fresh);
    }
    nav.go("live");
  }

  function repeatPastSession(src: TrainingSession): void {
    setActiveLog(saveSession(repeatSession(src)));
    clearProgress();
    nav.go("live");
  }

  /** Unique logged movements in a session, as chips that open Exercise detail. */
  function exerciseChips(s: TrainingSession): HTMLElement | null {
    const seen = new Set<ExerciseKey>();
    const chips: HTMLElement[] = [];
    for (const ex of s.exercises) {
      if (ex.sets.length === 0) continue;
      const key = exerciseKey(ex);
      if (seen.has(key)) continue;
      seen.add(key);
      chips.push(
        h("button", {
          class: "btn btn-tiny history-ex-chip",
          type: "button",
          text: ex.name,
          aria: { label: t("open history for {0}").replace("{0}", ex.name) },
          on: {
            click: () => {
              seedExercise(key);
              nav.go("exercise");
            },
          },
        }),
      );
    }
    return chips.length > 0 ? h("div", { class: "btn-row history-ex-chips" }, chips) : null;
  }

  function renderSessionCard(s: TrainingSession): HTMLElement {
    const sets = sessionSetCount(s);
    const vol = sessionVolume(s);
    const meta =
      t("{0} exercises · {1} sets")
        .replace("{0}", String(s.exercises.filter((ex) => ex.sets.length > 0).length))
        .replace("{1}", String(sets)) +
      (vol > 0 ? ` · ${t("{0} kg lifted").replace("{0}", String(vol))}` : "");
    const durSec = sessionDurationSec(s);
    const timingParts = [t("Started {0}").replace("{0}", formatSessionTime(s.startedAt))];
    if (s.endedAt !== undefined) {
      timingParts.push(t("Ended {0}").replace("{0}", formatSessionTime(s.endedAt)));
    }
    timingParts.push(
      durSec !== null
        ? t("Duration {0}").replace("{0}", formatDuration(durSec))
        : t("In progress"),
    );
    const summary = renderSessionSummary(s, sessions);
    const chips = exerciseChips(s);

    return h("section", { class: "card saved-item" }, [
      h("div", { class: "saved-info" }, [
        h("p", { class: "plan-name", text: s.name || t("Untitled session") }),
        h("p", { class: "plan-meta", text: formatSessionDate(s.startedAt) }),
        h("p", { class: "plan-meta", text: meta }),
        h("p", { class: "plan-meta", text: timingParts.join(" · ") }),
        ...(s.startFatigue !== undefined
          ? [
              h("p", {
                class: "plan-meta",
                text: t("Fatigue: {0}").replace(
                  "{0}",
                  `${t(FATIGUE_LABELS[s.startFatigue])} (${s.startFatigue}/5)`,
                ),
              }),
            ]
          : []),
      ]),
      ...(chips ? [chips] : []),
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
          on: { click: () => resumeSession(s) },
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
              deleteSession(s.id);
              render();
              showUndo(t('Deleted "{0}".').replace("{0}", s.name || t("this session")), () => {
                saveSession(s);
                render();
              });
            },
          },
        }),
      ]),
      ...(sets > 0
        ? [
            h("details", { class: "session-summary-toggle" }, [
              h("summary", { class: "session-summary-label", text: t("Export · Analyze") }),
              h("div", { class: "btn-row saved-actions" }, [
                h("button", {
                  class: "btn btn-small btn-accent",
                  type: "button",
                  text: t("Ask Claude ▸"),
                  aria: { label: t("ask Claude about {0}").replace("{0}", s.name || t("this session")) },
                  on: {
                    click: () =>
                      runExport("Ask Claude ▸", async () => {
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
                h("button", {
                  class: "btn btn-small",
                  type: "button",
                  text: t("Export JSON"),
                  aria: { label: t("export {0} as JSON").replace("{0}", s.name || t("this session")) },
                  on: { click: () => exportSessionsJson([s]) },
                }),
              ]),
              h("div", { class: "btn-row saved-actions" }, [
                h("button", {
                  class: "btn btn-small btn-accent",
                  type: "button",
                  text: t("Share ▸"),
                  aria: { label: t("share {0}").replace("{0}", s.name || t("this session")) },
                  on: {
                    click: () =>
                      runExport("Share ▸", async () => {
                        const result = await shareSession(s, sessions);
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
                  on: { click: () => runExport("Save PNG", () => exportSessionPng(s, sessions)) },
                }),
                h("button", {
                  class: "btn btn-small",
                  type: "button",
                  text: "PDF",
                  aria: { label: t("save {0} as PDF").replace("{0}", s.name || t("this session")) },
                  on: { click: () => runExport("Save PDF", () => exportSessionPdf(s, sessions)) },
                }),
              ]),
            ]),
          ]
        : []),
    ]);
  }

  // ───────────────────────────── List + filters ───────────────────────────────

  const matches = (s: TrainingSession): boolean => {
    const fm = filterMuscle;
    if (
      fm !== "" &&
      !s.exercises.some(
        (ex) =>
          ex.sets.length > 0 && (ex.muscle === fm || (ex.secondaryMuscles ?? []).includes(fm)),
      )
    ) {
      return false;
    }
    const q = filterText.trim().toLowerCase();
    if (q === "") return true;
    return (
      (s.name || "").toLowerCase().includes(q) ||
      s.exercises.some((ex) => ex.name.toLowerCase().includes(q))
    );
  };

  const listHost = h("div", { class: "saved-list" });
  function paintList(): void {
    clear(listHost);
    const filtered = sessions.filter(matches);
    if (filtered.length === 0) {
      listHost.append(h("p", { class: "empty", text: t("No sessions match these filters.") }));
      return;
    }
    filtered.forEach((s) => listHost.append(renderSessionCard(s)));
  }

  function renderExportAll(): HTMLElement {
    return h("section", { class: "card live-export" }, [
      h("h2", { class: "section-title", text: t("Export sessions") }),
      h("p", {
        class: "plan-meta",
        text: t("Download all {0} logged {1} to import into other tools and analyse elsewhere.")
          .replace("{0}", String(sessions.length))
          .replace("{1}", sessions.length === 1 ? t("session") : t("sessions")),
      }),
      h("div", { class: "btn-row" }, [
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

  function render(): void {
    clear(container);
    container.append(
      h("h1", { class: "view-title", text: t("History") }),
      h("p", {
        class: "lede",
        text: t("Every logged session — resume or repeat one, or send a stretch of history to Claude."),
      }),
    );

    if (sessions.length === 0) {
      container.append(
        h("p", { class: "empty", text: t("No sessions yet — your training history lands here.") }),
      );
      return;
    }

    container.append(renderAnalyzeCard());

    if (sessions.length > 1) {
      const searchInput = h("input", {
        class: "plan-name-input",
        type: "search",
        value: filterText,
        placeholder: t("Search sessions"),
        aria: { label: t("search sessions by name or exercise") },
      });
      searchInput.addEventListener("input", () => {
        filterText = searchInput.value;
        paintList();
      });
      const muscleSelect = h(
        "select",
        { class: "live-filter-muscle", aria: { label: t("Filter by muscle") } },
        [
          h("option", { value: "", text: t("All muscles") }),
          ...MUSCLE_GROUPS.map((m) => h("option", { value: m, text: t(MUSCLE_LABELS[m]) })),
        ],
      );
      muscleSelect.value = filterMuscle;
      muscleSelect.addEventListener("change", () => {
        filterMuscle = muscleSelect.value as MuscleGroup | "";
        paintList();
      });
      container.append(h("div", { class: "live-filter-row" }, [searchInput, muscleSelect]));
    }

    paintList();
    container.append(listHost, renderExportAll());
  }

  render();
  return () => {};
}
