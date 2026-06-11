/**
 * Rest alert — an optional target for the between-sets rest clock. The clock
 * itself counts up freely; when a target is set, crossing it fires a short
 * audio/vibration cue (and a system notification when the page is hidden) so
 * the phone can sit face-down between sets. Best effort by design: browsers
 * may suspend timers on a locked phone, and every cue degrades silently when
 * its API is unavailable.
 */

const KEY = "gymlog.restAlert";

/** Selectable rest targets, seconds; 0 = no alert. */
export const REST_ALERT_OPTIONS: readonly number[] = [0, 60, 90, 120, 180];

/** The saved rest-alert target in seconds (0 = off, the default). */
export function loadRestAlertSec(): number {
  try {
    const raw = localStorage.getItem(KEY);
    const n = raw === null ? 0 : Number(raw);
    return REST_ALERT_OPTIONS.includes(n) ? n : 0;
  } catch {
    return 0;
  }
}

export function saveRestAlertSec(sec: number): void {
  try {
    localStorage.setItem(KEY, String(sec));
  } catch {
    // Quota or privacy-mode failure: the choice just won't persist.
  }
}

// One lazily created AudioContext, reused across cues — contexts are a limited
// resource and creating one per beep eventually fails on mobile Safari.
let audioCtx: AudioContext | null = null;

/** Two short beeps. Created inside a user-gesture-driven flow, so autoplay rules allow it. */
function beep(): void {
  try {
    audioCtx ??= new AudioContext();
    void audioCtx.resume();
    const t0 = audioCtx.currentTime;
    for (const at of [0, 0.35]) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, t0 + at);
      gain.gain.exponentialRampToValueAtTime(0.4, t0 + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.25);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t0 + at);
      osc.stop(t0 + at + 0.3);
    }
  } catch {
    // No audio (unsupported / blocked): vibration or notification still fire.
  }
}

/**
 * Fire the rest-over cue: beep + vibration always, plus a system notification
 * when the page isn't visible (backgrounded app / screen off but unlocked).
 */
export function cueRestOver(title: string, body: string): void {
  beep();
  try {
    navigator.vibrate?.([200, 100, 200]);
  } catch {
    // Vibration unsupported — fine.
  }
  try {
    if (document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(title, { body });
    }
  } catch {
    // Notification constructor can throw on some platforms (e.g. Android web
    // wants a ServiceWorkerRegistration) — the audible cue already fired.
  }
}

/**
 * Ask for notification permission the first time an alert target is chosen —
 * called from the chip tap so the request rides a user gesture.
 */
export function ensureNotifyPermission(): void {
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  } catch {
    // Unsupported — the in-page cues still work.
  }
}
