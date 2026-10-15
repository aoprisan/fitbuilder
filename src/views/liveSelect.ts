import { nextSetTarget } from "../benchmark";
import { clear, h } from "../dom";
import { filterField, matchesFilter } from "./filter";
import { type SelectMode } from "../liveProgress";
import { loadSessions } from "../logStorage";
import {
  findMovement,
  isCompoundMovement,
  isolationMovementsForMuscle,
  type Movement,
  movementsForMuscle,
  muscleShares,
} from "../movements";
import { loadIncrementKg } from "../overload";
import { muscleRecovery, type MuscleRecovery, recoveryColor } from "../recovery";
import { radialSelector, type RadialItem, type RadialRing } from "./radial";
import {
  compoundMovementsByFrequency,
  exerciseKey,
  musclesByFrequency,
  recentMovements,
} from "../stats";
import { bySectionRuns, renderSessionSummary } from "./sessionSummary";
import { state } from "../state";
import {
  FATIGUE_LABELS,
  FATIGUE_LEVELS,
  MUSCLE_LABELS,
  type LoggedExercise,
  type MuscleGroup,
  type TrainingSession,
} from "../types";
import { formatSessionDate } from "../util";
import { t } from "../i18n";
import { renderList } from "./liveList";
import {
  lastPerformance,
  QUICK_PICK_RING,
  RECOVERY_WARN_BELOW,
  renderExpectation,
  renderLastPerformance,
  renderOverloadHint,
  renderRecoveryWarning,
  usualReps,
} from "./livePanels";
import type { LiveCtx } from "./liveState";

/* =============================================================================
   The select screen of an open session: name + start fatigue, the logged-so-far
   list, and the concentric ring picker (muscle → exercise → recent) with its
   compound / custom modes, recovery caution and last-time recall.
   Rendered by views/live.ts through the shared LiveCtx.
   ========================================================================== */

/**
 * Pre-session fatigue picker (Fresh … Exhausted), logged at the start of the
 * session. Tapping the active chip clears it. Captures readiness the logged work
 * can't see — high fatigue coming in depresses performance — and feeds the UI
 * read-out and the analysis prompt.
 */
export function renderFatiguePicker(ctx: LiveCtx, session: TrainingSession): HTMLElement {
  return h("div", { class: "field" }, [
    h("span", { class: "field-label", text: t("Fatigue coming in") }),
    h(
      "div",
      { class: "toggle", role: "group", aria: { label: t("Fatigue coming in") } },
      FATIGUE_LEVELS.map((lvl) =>
        h("button", {
          class: session.startFatigue === lvl ? "toggle-btn active" : "toggle-btn",
          type: "button",
          text: t(FATIGUE_LABELS[lvl]),
          aria: { pressed: String(session.startFatigue === lvl) },
          on: {
            click: () => {
              if (session.startFatigue === lvl) delete session.startFatigue;
              else session.startFatigue = lvl;
              ctx.persist();
              ctx.render();
            },
          },
        }),
      ),
    ),
    h("p", {
      class: "plan-meta plan-note",
      text: t("Logged at the start — pre-session fatigue affects performance."),
    }),
  ]);
}

// ──────────────────────────── Select screen ─────────────────────────────────

export function renderSelect(ctx: LiveCtx): void {
  const { st } = ctx;
  const session = state.activeLog;
  if (!session) {
    st.stage = "list";
    renderList(ctx);
    return;
  }

  // In a routine-loaded session, the next planned exercise drives this screen;
  // sync the toggles to its current selection so the user can confirm it.
  const planned = ctx.nextPlanned();
  if (planned) {
    st.muscle = planned.muscle;
    if (planned.exerciseId) {
      st.movementId = planned.exerciseId;
    } else {
      // No catalog identity yet (free-text routine row): pre-highlight only a
      // generic-gear option matching its load, never a named lift it didn't ask for.
      const match = movementsForMuscle(st.muscle).find(
        (mv) => mv.id.includes("::") && mv.equipment === planned.equipment,
      );
      if (match) st.movementId = match.id;
    }
  }
  // A compound selection (commonly a routine-prescribed lift) can't live in the
  // isolation-only Custom picker, so default to the Compound picker whenever the
  // current movement is a compound; the Mode toggle still lets the user switch.
  const selMv = findMovement(st.movementId);
  if (selMv && isCompoundMovement(selMv)) {
    st.selectMode = "compound";
  }
  if (st.selectMode === "compound") ctx.ensureCompound();
  else ctx.ensureMovement();

  const nameInput = h("input", {
    class: "plan-name-input",
    type: "text",
    value: session.name,
    placeholder: t("Session name"),
    aria: { label: t("Session name") },
  });
  nameInput.addEventListener("input", () => {
    session.name = nameInput.value;
    ctx.persist();
  });

  // Only exercises with logged sets — planned-but-untouched rows live in the
  // "next exercise" card instead, so they aren't duplicated here.
  const doneHost = h("div", { class: "live-done-list" });
  const logged = session.exercises.filter((ex) => ex.sets.length > 0);
  if (logged.length > 0) {
    doneHost.append(h("p", { class: "field-label", text: t("Logged so far — tap to add sets") }));
    // Grouped by session phase (Warm-up / Main / …) so a followed structured
    // session reads in order; unlabelled runs render without a header.
    bySectionRuns(logged).forEach((run) => {
      if (run.section !== "") {
        doneHost.append(h("p", { class: "live-section-label", text: run.section }));
      }
      run.items.forEach((ex) => {
        // Lead each row with the muscle group so it's clear what was trained —
        // generic-gear rows otherwise read as just the equipment (e.g. "Dumbbell").
        const muscleLabel = t(MUSCLE_LABELS[ex.muscle]);
        const setsText = (ex.sets.length === 1 ? t("{0} — {1} set") : t("{0} — {1} sets"))
          .replace("{0}", ex.name)
          .replace("{1}", String(ex.sets.length));
        doneHost.append(
          h(
            "button",
            {
              class: "btn btn-small live-done-row",
              type: "button",
              aria: { label: t("log sets for {0}").replace("{0}", `${muscleLabel} · ${ex.name}`) },
              on: { click: () => ctx.resumeExercise(ex) },
            },
            [
              h("span", { class: "live-done-muscle", text: muscleLabel }),
              h("span", { class: "live-done-name", text: setsText }),
              ...(ex.supersetGroup !== undefined
                ? [h("span", { class: "ss-chip", text: "SS" })]
                : []),
            ],
          ),
        );
      });
    });
  }

  const allSessions = loadSessions();
  const summary = renderSessionSummary(session, allSessions);

  ctx.container.append(
    h("h1", { class: "view-title", text: t("Live Session") }),
    h("section", { class: "card" }, [
      h("label", { class: "field" }, [
        h("span", { class: "field-label", text: t("Session name") }),
        nameInput,
      ]),
      // The default name *is* the start date — only repeat it once renamed.
      ...(session.name.trim() !== formatSessionDate(session.startedAt)
        ? [h("p", { class: "session-date", text: formatSessionDate(session.startedAt) })]
        : []),
      renderFatiguePicker(ctx, session),
    ]),
  );

  // Toggle picks update the view-level selection, and — when confirming a
  // planned routine exercise — write straight onto it so the choice sticks.
  const applyMovementToPlanned = (ex: LoggedExercise): void => {
    const mv = findMovement(st.movementId);
    if (!mv) return;
    ex.muscle = mv.primaryMuscle;
    ex.equipment = mv.equipment;
    ex.exerciseId = mv.id;
    if (mv.secondaryMuscles.length > 0) ex.secondaryMuscles = [...mv.secondaryMuscles];
    else delete ex.secondaryMuscles;
  };
  // Repaints the dial and the notes under it in place; wired up once the
  // picker is built. Picking on the rings must not rebuild the whole select
  // screen: a full render re-anchors the scroll, which used to yank the dial
  // out from under the thumb between two muscle taps.
  let repaintPicker: (() => void) | null = null;
  const pickMuscle = (m: string): void => {
    ctx.selectMuscle(m as MuscleGroup);
    if (planned) {
      applyMovementToPlanned(planned);
      ctx.persist();
    }
    if (repaintPicker) repaintPicker();
    else ctx.render();
  };
  const pickMovement = (id: string): void => {
    ctx.selectMovement(id);
    if (planned) {
      applyMovementToPlanned(planned);
      ctx.persist();
    }
    if (repaintPicker) repaintPicker();
    else ctx.render();
  };
  const pickMode = (m: string): void => {
    st.selectMode = m as SelectMode;
    if (st.selectMode === "compound") ctx.ensureCompound();
    else ctx.ensureMovement();
    if (planned) {
      applyMovementToPlanned(planned);
      ctx.persist();
    }
    ctx.render();
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

  // Per-muscle readiness (this session excluded) — drives the ready-first
  // ordering and dots on the muscle picker plus the pre-training warning.
  const recByMuscle = new Map(
    muscleRecovery(allSessions.filter((s) => s.id !== session.id)).map(
      (r): [MuscleGroup, MuscleRecovery] => [r.muscle, r],
    ),
  );

  // The dial swaps shape by mode: muscle + gear, or compound lifts with their
  // muscle split. The mode toggle sits above it. Compounds are ordered
  // most-trained first so the user's staples sit at the top.
  const compounds = compoundMovementsByFrequency(allSessions);

  // Ready muscles lead (in the user's usual frequency order); the still-
  // recovering ones sink below, each carrying its recovery dot — picking a
  // muscle becomes a readiness decision.
  const readiness = (m: MuscleGroup): number => recByMuscle.get(m)?.recovered ?? 1;
  const orderedMuscles = ((): readonly MuscleGroup[] => {
    const freqOrder = musclesByFrequency(allSessions);
    const rank = new Map(freqOrder.map((m, i) => [m, i] as const));
    return [...freqOrder].sort((a, b) => {
      const bandA = readiness(a) >= RECOVERY_WARN_BELOW ? 0 : 1;
      const bandB = readiness(b) >= RECOVERY_WARN_BELOW ? 0 : 1;
      return bandA - bandB || (rank.get(a) ?? 0) - (rank.get(b) ?? 0);
    });
  })();

  // Everything the dial's current pick implies — its muscle split, the last
  // time it was trained, the progression nudge and the recovery caution. It
  // sits under the dial and is repainted with it, so picking a muscle updates
  // the notes without rebuilding (and re-scrolling) the screen around them.
  const priorSessions = allSessions.filter((s2) => s2.id !== session.id);
  const contextHost = h("div", { class: "live-select-context" });
  const paintContext = (): void => {
    clear(contextHost);
    const key = exerciseKey({ muscle: st.muscle, equipment: st.equipment, exerciseId: st.movementId });
    const picked = findMovement(st.movementId);
    // Drawn from prior sessions only (the active one excluded), matching the
    // recovery-warning scope so a within-session repeat still recalls last week.
    const lastPerf = lastPerformance(priorSessions, key);
    // Progression nudge for a freestyle pick — a routine-planned exercise
    // defers to the trainer's prescribed scheme instead.
    const overloadHint = planned ? null : renderOverloadHint(priorSessions, key, st.equipment);
    // Caution if the picked movement's muscles haven't recovered from earlier
    // sessions; the active session is excluded so within-session repeats are fine.
    const targetMuscles = picked
      ? [picked.primaryMuscle, ...picked.secondaryMuscles]
      : [st.muscle];
    const recWarn = renderRecoveryWarning(targetMuscles, recByMuscle);
    if (picked && isCompoundMovement(picked)) contextHost.append(renderMuscleShares(picked));
    if (lastPerf) contextHost.append(renderLastPerformance(lastPerf.date, lastPerf.exercise));
    if (overloadHint) contextHost.append(overloadHint);
    const exp = ctx.expectationFor(st.muscle, st.equipment, st.movementId);
    if (exp) {
      contextHost.append(
        renderExpectation(
          exp,
          (planned ? nextSetTarget(planned)?.reps : undefined) ?? usualReps(lastPerf?.exercise ?? null),
          loadIncrementKg(st.equipment),
        ).el,
      );
    }
    if (recWarn) contextHost.append(recWarn);
  };

  /**
   * The picker: one dial instead of stacked chip rows. Muscle
   * groups ride the outer ring (recovery-tinted, ready first), the chosen
   * muscle's exercises the middle one, and the lifter's recent movements the
   * inner one — so a staple is one tap away from wherever the dial is pointed
   * and confirming is a tap on the hub. Compound mode drops the muscle ring
   * (a compound has no single muscle to pick) and dials the lifts directly.
   * The filter above narrows the exercise ring only; typing repaints the dial
   * alone, so the input keeps focus.
   */
  const radialPicker = (): HTMLElement => {
    const dialHost = h("div", { class: "radial-host" });
    const toItems = (movements: readonly Movement[]): RadialItem[] =>
      movements.map((mv) => ({ id: mv.id, label: mv.name }));

    // What the user actually trains, newest first. Compound mode keeps only
    // the compounds, so the recall runs deeper than the ring holds before it
    // is filtered. A fresh log has nothing to recall at all — the ring falls
    // back to the catalog's compounds, so it's never empty.
    const recentPicks = recentMovements(allSessions, QUICK_PICK_RING * 4).filter((mv) =>
      st.selectMode === "compound" ? isCompoundMovement(mv) : true,
    );
    const quickPicks = (): readonly Movement[] =>
      (recentPicks.length > 0 ? recentPicks : compounds).slice(0, QUICK_PICK_RING);

    const filtered = (movements: readonly Movement[]): readonly Movement[] => {
      const shown = movements.filter((mv) => matchesFilter(mv.name, st.movementFilter));
      return shown.length > 0 ? shown : movements;
    };

    const paintDial = (): void => {
      clear(dialHost);
      const exercises =
        st.selectMode === "compound" ? compounds : isolationMovementsForMuscle(st.muscle);
      // Picking a muscle clears the filter, so the input follows the dial.
      if (filterEl.value !== st.movementFilter) filterEl.value = st.movementFilter;
      // Only worth showing once the exercise ring has to page to hold its list.
      filterEl.hidden = exercises.length <= 9;
      const rings: RadialRing[] = [
        ...(st.selectMode === "compound"
          ? []
          : [
              {
                label: t("Muscle group"),
                items: orderedMuscles.map(
                  (m): RadialItem => ({
                    id: m,
                    label: t(MUSCLE_LABELS[m]),
                    tint: recoveryColor(readiness(m)),
                  }),
                ),
                activeId: st.muscle,
                onPick: pickMuscle,
                capacity: 10,
                weight: 1,
                tone: "muscle",
              },
            ]),
        {
          label: st.selectMode === "compound" ? t("Compound lift") : t("Exercise"),
          items: toItems(filtered(exercises)),
          activeId: st.movementId,
          onPick: pickMovement,
          capacity: 9,
          weight: 1.1,
          tone: "exercise",
        },
        {
          // Named for what it holds: with nothing logged yet it's the
          // catalog's compounds, not anything the lifter did recently.
          label: recentPicks.length > 0 ? t("Recent") : t("Suggested"),
          items: toItems(quickPicks()),
          activeId: st.movementId,
          onPick: pickMovement,
          capacity: QUICK_PICK_RING,
          weight: 1.15,
          tone: "quick",
        },
      ];
      const picked = findMovement(st.movementId);
      dialHost.append(
        radialSelector({
          rings,
          hub: {
            sub: t(MUSCLE_LABELS[st.muscle]),
            title: picked?.name ?? t("Pick an exercise"),
            action: {
              label: planned ? t("Start →") : t("Next →"),
              onClick: planned ? () => ctx.resumeExercise(planned) : ctx.startExercise,
            },
          },
        }),
      );
    };

    const filterEl = filterField(t("Filter exercises"), (q) => {
      st.movementFilter = q;
      paintDial();
    });
    // Keyboard focus sits on the wedge that was just picked, and the repaint
    // replaces it — so note which ring it belonged to and hand focus back to
    // that ring's new selection instead of letting it drop to the page body.
    const focusedRingIndex = (): number => {
      const el = document.activeElement;
      const ring = el instanceof Element ? el.closest(".radial-ring") : null;
      if (!ring || !dialHost.contains(ring)) return -1;
      return [...dialHost.querySelectorAll(".radial-ring")].indexOf(ring);
    };
    const refocusRing = (index: number): void => {
      if (index < 0) return;
      const ring = dialHost.querySelectorAll(".radial-ring")[index];
      const seg = ring?.querySelector(".radial-seg.is-active") ?? ring?.querySelector(".radial-seg");
      if (seg instanceof SVGElement) seg.focus({ preventScroll: true });
    };

    // From here on a pick repaints the dial and its notes, nothing else —
    // so the resume snapshot (which a full render would have taken) is taken
    // here instead, keeping a reload on the same pending selection.
    repaintPicker = (): void => {
      const ringIndex = focusedRingIndex();
      paintDial();
      paintContext();
      refocusRing(ringIndex);
      ctx.snapshot();
    };
    paintDial();
    // The dial is what this screen is for: park the scroll on it and point the
    // floating jump-back button at it, so it is always the thing in view.
    ctx.view.scrollTargetEl = dialHost;
    ctx.view.scrollTargetBlock = "nearest";
    ctx.view.focusAnchorEl = dialHost;
    ctx.view.focusAnchorText = t("↑ Selector");
    ctx.view.focusAnchorAria = t("Back to the exercise selector");
    return h("div", {}, [filterEl, dialHost]);
  };

  const picker = radialPicker();
  paintContext();

  ctx.container.append(
    h("section", { class: "card live-select" }, [
      ...(planned?.section
        ? [h("p", { class: "live-section-eyebrow", text: planned.section })]
        : []),
      h("h2", { class: "section-title", text: planned ? planned.name || t("Next exercise") : t("Next exercise") }),
      ...(planned && planned.prescription
        ? [h("p", { class: "now-target", text: planned.prescription })]
        : []),
      // Planned superset: name the partner exercise(s) so the pairing is
      // visible before the first set starts.
      ...(planned && planned.supersetGroup !== undefined
        ? [
            (() => {
              const partners = session.exercises
                .filter((e) => e !== planned && e.supersetGroup === planned.supersetGroup)
                .map((e) => e.name);
              return partners.length > 0
                ? h("p", {
                    class: "plan-meta live-ss-note",
                    text: t("Superset with {0}").replace("{0}", partners.join(" · ")),
                  })
                : null;
            })(),
          ]
        : []),
      ctx.renderToggle(
        t("Mode"),
        ["custom", "compound"],
        (m) => (m === "compound" ? t("Compound") : t("Custom")),
        st.selectMode,
        pickMode,
      ),
      picker,
      contextHost,
      h("div", { class: "btn-row" }, [
        h("button", {
          class: "btn btn-primary",
          type: "button",
          text: planned ? t("Start →") : t("Next →"),
          on: { click: planned ? () => ctx.resumeExercise(planned) : ctx.startExercise },
        }),
        ...(planned
          ? [
              h("button", {
                class: "btn",
                type: "button",
                text: t("+ Add off-plan"),
                aria: { label: t("add an exercise that isn't in the routine") },
                on: { click: ctx.startExercise },
              }),
            ]
          : []),
      ]),
      doneHost,
    ]),
    // Session footer: the effort dashboard + its Share/PNG/PDF export controls
    // drop to the bottom (the top of the screen stays focused on pick-exercise →
    // Start), with the session read-out sitting directly above "end session".
    ...(summary ? [ctx.sessionExportRow(session), ctx.statusEl, summary] : []),
    h("div", { class: "btn-row live-actions" }, [
      h("button", {
        class: "btn btn-accent",
        type: "button",
        text: t("✓ Done — end session"),
        on: { click: ctx.endSession },
      }),
    ]),
  );
}
