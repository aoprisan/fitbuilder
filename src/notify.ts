/**
 * Native notifications (Capacitor). Inside the iOS/Android shell the rest
 * alert is handed to the OS as a scheduled local notification, so it fires on
 * time with the phone locked or the app backgrounded — a JS timer is suspended
 * there. In a plain browser every call here is a no-op returning false, and
 * `restAlert.ts` falls back to its in-page cues.
 *
 * The plugin is imported lazily so the web build never pays for it up front.
 */

import { Capacitor } from "@capacitor/core";
import type { LocalNotificationsPlugin } from "@capacitor/local-notifications";
import { registerTranslations, t } from "./i18n";

registerTranslations({
  // Android notification channel, shown in the system's app-notification settings.
  "Rest timer": "Cronometru de pauză",
  "Rest-over alert between sets": "Alertă de final de pauză între seturi",
});

/** True inside the Capacitor iOS/Android shell (not a browser / PWA). */
export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

// One fixed id: there is only ever one pending rest alert, so re-scheduling
// simply replaces it and cancelling needs no bookkeeping.
const REST_ID = 4201;
const REST_CHANNEL = "rest-timer";

let pluginP: Promise<LocalNotificationsPlugin> | null = null;
function plugin(): Promise<LocalNotificationsPlugin> {
  pluginP ??= import("@capacitor/local-notifications").then((m) => m.LocalNotifications);
  return pluginP;
}

// Android: the high-importance channel the rest alert posts to (heads-up,
// default sound, vibration, shown on the lock screen). Created once per run.
let channelP: Promise<void> | null = null;
function ensureChannel(p: LocalNotificationsPlugin): Promise<void> {
  if (Capacitor.getPlatform() !== "android") return Promise.resolve();
  channelP ??= p
    .createChannel({
      id: REST_CHANNEL,
      name: t("Rest timer"),
      description: t("Rest-over alert between sets"),
      importance: 5,
      visibility: 1,
      vibration: true,
    })
    .catch(() => {
      channelP = null; // retry on the next schedule
    });
  return channelP;
}

// Android 12+: without the exact-alarm setting the alert is scheduled inexact
// (may land late). With `isExactNotification` on, the plugin would open the
// "Alarms & reminders" screen on *every* schedule, so the prompt is asked once,
// from requestNotifyPermission(), instead.
const EXACT_ASKED_KEY = "gymlog.exactAlarmAsked";
function askedExactBefore(): boolean {
  try {
    return localStorage.getItem(EXACT_ASKED_KEY) === "1";
  } catch {
    return false;
  }
}
function markExactAsked(): void {
  try {
    localStorage.setItem(EXACT_ASKED_KEY, "1");
  } catch {
    // Privacy mode: we may ask again next time — harmless.
  }
}

/**
 * Ask for notification permission (and, on Android 12+, the exact-alarm
 * setting). Call from a user gesture. Resolves true when native notifications
 * can be posted; false in a browser or when the user declines.
 */
export async function requestNotifyPermission(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const p = await plugin();
    let perm = await p.checkPermissions();
    if (perm.display === "prompt" || perm.display === "prompt-with-rationale") {
      perm = await p.requestPermissions();
    }
    if (perm.display !== "granted") return false;
    if (Capacitor.getPlatform() === "android") {
      const exact = await p.checkExactNotificationSetting();
      // Open the "Alarms & reminders" screen once per install, not on every
      // chip tap — a user who declined there gets the (inexact) alert.
      if (exact.exact_alarm !== "granted" && !askedExactBefore()) {
        markExactAsked();
        await p.changeExactNotificationSetting();
      }
    }
    return true;
  } catch {
    return false;
  }
}

// Schedule and cancel calls are async bridge round-trips; run them strictly in
// order so a quick "start next set" (cancel) can never land before the
// schedule it is meant to undo and leave a stale alert armed.
let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(op: () => Promise<T>): Promise<T> {
  const run = queue.then(op, op);
  queue = run.catch(() => undefined);
  return run;
}

/**
 * Schedule the rest-over notification for `atEpochMs`, replacing any pending
 * one. Resolves true when the OS accepted it — the caller then leaves the
 * audible cue to the notification instead of beeping in-page as well.
 */
export function scheduleRestAlert(atEpochMs: number, title: string, body: string): Promise<boolean> {
  if (!isNativeApp()) return Promise.resolve(false);
  return enqueue(async () => {
    try {
      const p = await plugin();
      if ((await p.checkPermissions()).display !== "granted") return false;
      // Never let schedule() open the exact-alarm screen itself (it would on
      // every rest): ask exact only when it is already allowed.
      const exact =
        Capacitor.getPlatform() !== "android" ||
        (await p.checkExactNotificationSetting()).exact_alarm === "granted";
      await ensureChannel(p);
      await p.cancel({ notifications: [{ id: REST_ID }] });
      await p.schedule({
        notifications: [
          {
            id: REST_ID,
            title,
            body,
            schedule: { at: new Date(atEpochMs), allowWhileIdle: true },
            channelId: REST_CHANNEL,
            smallIcon: "ic_stat_timer",
            autoCancel: true,
            // iOS: show the banner (with sound) even while the app is open;
            // Android: present as a heads-up notification.
            foreground: true,
            isExactNotification: exact,
          },
        ],
      });
      return true;
    } catch {
      return false;
    }
  });
}

/** Drop a pending rest-over notification (next set started, screen left, alert turned off). */
export function cancelRestAlert(): void {
  if (!isNativeApp()) return;
  void enqueue(async () => {
    const p = await plugin();
    await p.cancel({ notifications: [{ id: REST_ID }] });
    // Also clear one already delivered to the tray — it's stale once the
    // next set is under way.
    await p.removeDeliveredNotificationsById({ ids: [REST_ID] });
  }).catch(() => {
    // Nothing pending / plugin unavailable — fine.
  });
}
