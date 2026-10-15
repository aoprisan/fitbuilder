/**
 * Between-sessions reminders: "fully recovered" once every muscle still on its
 * recovery clock has cleared, and "time to train" when the gap since the last
 * session reaches a chosen number of days. Both are scheduled as ordinary OS
 * notifications in the native app (`notify.ts`), so a watch that mirrors the
 * phone's notifications — a Fitbit Versa via the Fitbit app, Wear OS, Garmin —
 * shows them on the wrist too. Texts are kept short for a small watch screen.
 *
 * Nothing runs in the background: `syncReminders()` re-plans from the logged
 * history at boot, whenever the app is backgrounded and after a settings
 * change, replacing whatever it scheduled before. A browser can't schedule
 * notifications ahead, so there every call is a no-op.
 */

import { registerTranslations, t } from "./i18n";
import { loadSessions } from "./logStorage";
import { isNativeApp, replaceReminders, requestNotifyPermission, type Reminder } from "./notify";
import { muscleRecovery } from "./recovery";
import { MUSCLE_LABELS, type TrainingSession } from "./types";

registerTranslations({
  "Fully recovered": "Complet refăcut",
  "Ready again: {0}.": "Din nou pregătit: {0}.",
  "Time to train": "E timpul pentru antrenament",
  "{0} days since your last session.": "{0} zile de la ultima sesiune.",
  "Gym Log test": "Test Gym Log",
  "Notifications reach your watch.": "Notificările ajung pe ceas.",
});

const KEY = "gymlog.notifyPrefs";

/** Fixed ids, one per kind, so a re-plan simply replaces the previous one. */
const RECOVERED_ID = 4301;
const TRAIN_ID = 4302;
const TEST_ID = 4303;
const OWN_IDS: readonly number[] = [RECOVERED_ID, TRAIN_ID];

/** Day gaps offered for the "time to train" nudge; 0 = off. */
export const TRAIN_AFTER_OPTIONS: readonly number[] = [0, 2, 3, 4, 7];
/** Local hours the "time to train" nudge may fire at. */
export const REMINDER_HOUR_OPTIONS: readonly number[] = [7, 12, 17, 19];

export interface NotifyPrefs {
  /** Notify once every muscle on the recovery clock is ready again. */
  recovery: boolean;
  /** Days without a session before the "time to train" nudge; 0 = off. */
  trainAfterDays: number;
  /** Local hour of day the "time to train" nudge fires. */
  hour: number;
}

const DEFAULTS: NotifyPrefs = { recovery: false, trainAfterDays: 0, hour: 17 };

export function loadNotifyPrefs(): NotifyPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return { ...DEFAULTS };
    const v = JSON.parse(raw) as Partial<Record<keyof NotifyPrefs, unknown>>;
    return {
      recovery: v.recovery === true,
      trainAfterDays: TRAIN_AFTER_OPTIONS.includes(v.trainAfterDays as number)
        ? (v.trainAfterDays as number)
        : DEFAULTS.trainAfterDays,
      hour: REMINDER_HOUR_OPTIONS.includes(v.hour as number) ? (v.hour as number) : DEFAULTS.hour,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveNotifyPrefs(prefs: NotifyPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Quota or privacy-mode failure: the choice just won't persist.
  }
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
// Nothing buzzes a wrist overnight: a recovery that lands in quiet hours waits
// for the morning.
const QUIET_FROM = 22;
const QUIET_UNTIL = 8;

function outOfQuietHours(at: Date): Date {
  const h = at.getHours();
  if (h >= QUIET_UNTIL && h < QUIET_FROM) return at;
  const morning = new Date(at);
  if (h >= QUIET_FROM) morning.setDate(morning.getDate() + 1);
  morning.setHours(QUIET_UNTIL, 0, 0, 0);
  return morning;
}

/** "Chest, Back, Biceps +2" — short enough for a watch face. */
function muscleList(names: readonly string[]): string {
  const shown = names.slice(0, 3).join(", ");
  return names.length > 3 ? `${shown} +${names.length - 3}` : shown;
}

/**
 * The reminders the given history and prefs call for, as of `now`. Pure —
 * `syncReminders()` hands the result to the OS.
 */
export function planReminders(
  sessions: readonly TrainingSession[],
  prefs: NotifyPrefs,
  now: Date = new Date(),
): Reminder[] {
  const out: Reminder[] = [];
  const nowMs = now.getTime();

  if (prefs.recovery) {
    const pending = muscleRecovery(sessions, now).filter((r) => r.hoursRemaining > 0);
    if (pending.length > 0) {
      const hours = Math.max(...pending.map((r) => r.hoursRemaining));
      out.push({
        id: RECOVERED_ID,
        view: "body",
        at: outOfQuietHours(new Date(nowMs + hours * HOUR_MS)),
        title: t("Fully recovered"),
        body: t("Ready again: {0}.").replace(
          "{0}",
          muscleList(pending.map((r) => t(MUSCLE_LABELS[r.muscle]))),
        ),
      });
    }
  }

  if (prefs.trainAfterDays > 0) {
    let lastMs = Number.NEGATIVE_INFINITY;
    for (const s of sessions) {
      if (!s.exercises.some((ex) => ex.sets.length > 0)) continue;
      const at = new Date(s.endedAt ?? s.startedAt).getTime();
      if (at > lastMs) lastMs = at;
    }
    // Never trained yet: nothing to measure a gap from.
    if (Number.isFinite(lastMs)) {
      const at = new Date(lastMs + prefs.trainAfterDays * DAY_MS);
      at.setHours(prefs.hour, 0, 0, 0);
      // Already overdue: the next time that hour comes round.
      while (at.getTime() <= nowMs) at.setDate(at.getDate() + 1);
      const days = Math.max(prefs.trainAfterDays, Math.floor((at.getTime() - lastMs) / DAY_MS));
      out.push({
        id: TRAIN_ID,
        view: "live",
        at,
        title: t("Time to train"),
        body: t("{0} days since your last session.").replace("{0}", String(days)),
      });
    }
  }

  return out;
}

/** Re-plan and (re)schedule every reminder. Native only; a no-op elsewhere. */
export function syncReminders(): Promise<boolean> {
  if (!isNativeApp()) return Promise.resolve(false);
  return replaceReminders(OWN_IDS, planReminders(loadSessions(), loadNotifyPrefs()));
}

/** Seconds between the test tap and its notification — long enough to lock the phone. */
export const TEST_DELAY_SEC = 5;

/**
 * Post a test notification a few seconds out, to check it reaches the watch.
 * Call from a user gesture (it may ask for permission first). Resolves false
 * when notifications are unavailable or were declined.
 */
export async function sendTestNotification(): Promise<boolean> {
  const title = t("Gym Log test");
  const body = t("Notifications reach your watch.");
  if (isNativeApp()) {
    if (!(await requestNotifyPermission())) return false;
    return replaceReminders(
      [TEST_ID],
      [{ id: TEST_ID, at: new Date(Date.now() + TEST_DELAY_SEC * 1000), title, body }],
    );
  }
  // Browser / PWA: a page notification. On Android it is posted under the
  // browser's name, so the browser must be allowed in the watch app.
  try {
    if (typeof Notification === "undefined") return false;
    if (Notification.permission === "default") await Notification.requestPermission();
    if (Notification.permission !== "granted") return false;
  } catch {
    return false;
  }
  const post = async (): Promise<void> => {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, { body });
    else new Notification(title, { body });
  };
  window.setTimeout(() => {
    post().catch(() => {
      // No way to post one here.
    });
  }, TEST_DELAY_SEC * 1000);
  return true;
}
