import { cancelRestAlert, isNativeApp, scheduleRestAlert } from "../notify";
import { cueRestOver } from "../restAlert";

/**
 * Every timer the live logger runs, owned in one place so a single `stopAll()`
 * (on each re-render and on unmount) can never leave one ticking behind:
 *
 *  - the running-set / rest stopwatch, a requestAnimationFrame loop;
 *  - the session HUD's once-a-second elapsed tick;
 *  - the rest alert: an in-page wall-clock timeout plus, in the native app, an
 *    OS notification scheduled for the same instant (it fires with the phone
 *    locked and, once accepted, owns the sound so the page stays quiet);
 *  - a visibilitychange hook that re-arms the rest alert on unlock, since a
 *    phone that slept froze the pending timeout with it.
 */
export class LiveTimers {
  private rafId = 0;
  private hudTimer = 0;
  private restAlertTimer = 0;
  /** A native rest-over notification may be pending, so stopping must cancel it. */
  private restNotifyArmed = false;
  /** Bumped on every (re-)arm so a slow native schedule result can't speak for a replaced alert. */
  private restArmGen = 0;
  private onWake: (() => void) | null = null;
  private readonly onVisibility = (): void => {
    if (!document.hidden) this.onWake?.();
  };

  constructor() {
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  /** Run `tick` every animation frame until the next {@link stopAll}. */
  loop(tick: () => void): void {
    const frame = (): void => {
      tick();
      this.rafId = requestAnimationFrame(frame);
    };
    this.rafId = requestAnimationFrame(frame);
  }

  /** Run `tick` now and then once a second (the HUD clock) until {@link stopAll}. */
  everySecond(tick: () => void): void {
    tick();
    if (this.hudTimer) clearInterval(this.hudTimer);
    this.hudTimer = window.setInterval(tick, 1000);
  }

  /**
   * (Re-)arm the rest alert for `dueEpoch` (null = alert off). `onDue` runs when
   * it passes; the audible/vibration/notification cue fires with it unless the
   * native notification owns the sound or the timeout only fired on unlock,
   * long after the moment. An alert already past when armed (resumed later, or
   * re-checked on wake) runs `onDue` silently. The same arming re-runs when the
   * page becomes visible again.
   */
  armRestAlert(
    dueEpoch: number | null,
    cue: { title: string; body: string },
    onDue: () => void,
  ): void {
    const arm = (): void => {
      if (this.restAlertTimer) {
        clearTimeout(this.restAlertTimer);
        this.restAlertTimer = 0;
      }
      const gen = ++this.restArmGen;
      const remainingMs = dueEpoch === null ? 0 : dueEpoch - Date.now();
      if (dueEpoch === null || remainingMs <= 0) {
        this.cancelNative();
        // Already past (resumed later, or the phone slept through it): flip the
        // dial, but a cue this late would only startle — stay quiet.
        if (dueEpoch !== null) onDue();
        return;
      }
      let nativeOwnsCue = false;
      if (isNativeApp()) {
        this.restNotifyArmed = true;
        void scheduleRestAlert(dueEpoch, cue.title, cue.body).then((ok) => {
          if (gen === this.restArmGen) nativeOwnsCue = ok;
        });
      }
      this.restAlertTimer = window.setTimeout(() => {
        this.restAlertTimer = 0;
        onDue();
        const late = Date.now() - dueEpoch > LATE_CUE_MS;
        if (!nativeOwnsCue && !late) cueRestOver(cue.title, cue.body);
      }, remainingMs);
    };
    this.onWake = arm;
    arm();
  }

  /** Stop every loop, tick and pending alert (re-armed by the next render). */
  stopAll(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    if (this.restAlertTimer) {
      clearTimeout(this.restAlertTimer);
      this.restAlertTimer = 0;
    }
    this.cancelNative();
    this.restArmGen++;
    this.onWake = null;
    if (this.hudTimer) {
      clearInterval(this.hudTimer);
      this.hudTimer = 0;
    }
  }

  /** {@link stopAll} and detach the wake listener — the view is going away. */
  dispose(): void {
    this.stopAll();
    document.removeEventListener("visibilitychange", this.onVisibility);
  }

  private cancelNative(): void {
    if (this.restNotifyArmed) {
      this.restNotifyArmed = false;
      cancelRestAlert();
    }
  }
}

/** A cue that only fires this long after its moment (a timeout frozen while locked) stays quiet. */
const LATE_CUE_MS = 5000;
