import { clear, h } from "../dom";
import { registerTranslations, t } from "../i18n";
import { MUSCLE_LABELS, type TrainingSession } from "../types";
import { sessionSetCount } from "../util";

registerTranslations({
  Calendar: "Calendar",
  "previous month": "luna anterioară",
  "next month": "luna următoare",
  "{0} sessions this month": "{0} sesiuni în această lună",
  "1 session this month": "1 sesiune în această lună",
  "{0} exercises · {1} sets": "{0} exerciții · {1} seturi",
  "Tap a marked day to see what you trained.": "Atinge o zi marcată ca să vezi ce ai antrenat.",
});

/**
 * Month calendar of logged sessions — the at-a-glance training journal. Days
 * with sessions carry a dot; tapping one unfolds that day's sessions (name,
 * size, muscles trained) under the grid. Weeks start on Monday, matching the
 * streak logic in records.ts. Pure display — no navigation side effects.
 */

/** Local-date key, e.g. "2026-06-11" (not ISO/UTC — training days are local days). */
function dayKey(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Muscles a session touched (primaries only), as display labels. */
function sessionMuscles(s: TrainingSession): string {
  const seen = new Set<string>();
  for (const ex of s.exercises) seen.add(t(MUSCLE_LABELS[ex.muscle]));
  return [...seen].join(" · ");
}

export function sessionCalendar(sessions: readonly TrainingSession[]): HTMLElement {
  const byDay = new Map<string, TrainingSession[]>();
  for (const s of sessions) {
    const at = new Date(s.startedAt);
    if (Number.isNaN(at.getTime())) continue;
    const key = dayKey(at);
    const list = byDay.get(key) ?? [];
    list.push(s);
    byDay.set(key, list);
  }

  const today = new Date();
  let monthAnchor = new Date(today.getFullYear(), today.getMonth(), 1);
  let selected: string | null = null;

  const host = h("section", { class: "card session-calendar" });

  // Localized weekday initials for a Monday-first week (2024-01-01 was a Monday).
  const weekdayNames = Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2),
  );

  const paint = (): void => {
    clear(host);
    const year = monthAnchor.getFullYear();
    const month = monthAnchor.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const leadBlanks = (new Date(year, month, 1).getDay() + 6) % 7; // Monday = 0

    const monthLabel = monthAnchor.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });
    const monthSessions = [...byDay.entries()]
      .filter(([key]) => key.startsWith(`${year}-${String(month + 1).padStart(2, "0")}-`))
      .reduce((n, [, list]) => n + list.length, 0);

    host.append(
      h("div", { class: "cal-head" }, [
        h("button", {
          class: "icon-btn",
          type: "button",
          text: "◀",
          aria: { label: t("previous month") },
          on: {
            click: () => {
              monthAnchor = new Date(year, month - 1, 1);
              selected = null;
              paint();
            },
          },
        }),
        h("span", { class: "cal-title", text: monthLabel }),
        h("button", {
          class: "icon-btn",
          type: "button",
          text: "▶",
          aria: { label: t("next month") },
          on: {
            click: () => {
              monthAnchor = new Date(year, month + 1, 1);
              selected = null;
              paint();
            },
          },
        }),
      ]),
      h("p", {
        class: "cal-meta",
        text:
          monthSessions === 1
            ? t("1 session this month")
            : t("{0} sessions this month").replace("{0}", String(monthSessions)),
      }),
      h(
        "div",
        { class: "cal-grid", role: "grid", aria: { label: monthLabel } },
        [
          ...weekdayNames.map((w) => h("span", { class: "cal-weekday", text: w })),
          ...Array.from({ length: leadBlanks }, () => h("span", { class: "cal-blank" })),
          ...Array.from({ length: daysInMonth }, (_, i) => {
            const date = new Date(year, month, i + 1);
            const key = dayKey(date);
            const dayList = byDay.get(key);
            const classes = ["cal-day"];
            if (dayList) classes.push("has-sessions");
            if (key === dayKey(today)) classes.push("is-today");
            if (key === selected) classes.push("is-selected");
            return h(
              "button",
              {
                class: classes.join(" "),
                type: "button",
                disabled: !dayList,
                aria: {
                  label: dayList
                    ? `${date.toLocaleDateString()} — ${dayList.length}`
                    : date.toLocaleDateString(),
                  pressed: String(key === selected),
                },
                on: {
                  click: () => {
                    selected = selected === key ? null : key;
                    paint();
                  },
                },
              },
              [
                h("span", { class: "cal-day-num", text: String(i + 1) }),
                ...(dayList ? [h("span", { class: "cal-dot" })] : []),
              ],
            );
          }),
        ],
      ),
    );

    const selectedList = selected !== null ? byDay.get(selected) : undefined;
    if (selectedList) {
      host.append(
        ...selectedList.map((s) =>
          h("div", { class: "cal-session" }, [
            h("p", {
              class: "cal-session-name",
              text:
                (s.name ||
                  new Date(s.startedAt).toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })) ,
            }),
            h("p", {
              class: "cal-session-meta",
              text: t("{0} exercises · {1} sets")
                .replace("{0}", String(s.exercises.length))
                .replace("{1}", String(sessionSetCount(s))),
            }),
            h("p", { class: "cal-session-muscles", text: sessionMuscles(s) }),
          ]),
        ),
      );
    } else {
      host.append(h("p", { class: "cal-hint", text: t("Tap a marked day to see what you trained.") }));
    }
  };

  paint();
  return host;
}
