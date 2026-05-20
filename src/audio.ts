let ctx: AudioContext | null = null;

/**
 * Create/resume the AudioContext. Must be called from a user gesture
 * (e.g. the START button) to satisfy browser autoplay policies.
 */
export function ensureAudio(): void {
  if (ctx === null) {
    try {
      ctx = new AudioContext();
    } catch {
      ctx = null;
      return;
    }
  }
  if (ctx.state === "suspended") void ctx.resume();
}

/** Play a short tone. No-op if audio was never unlocked. */
export function beep(freq = 880, durationMs = 140, volume = 0.18): void {
  if (ctx === null || ctx.state !== "running") return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, now);

  const dur = durationMs / 1000;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + dur + 0.02);
}

/** Low countdown tick (3-2-1). */
export function tickBeep(): void {
  beep(660, 130, 0.16);
}

/** Higher "go" tone when rest ends. */
export function goBeep(): void {
  beep(990, 220, 0.2);
}
