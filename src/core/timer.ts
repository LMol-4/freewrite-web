/** 15 minutes, fixed (§18 resolved question 1 — no duration setting). */
export const TIMER_DURATION_SECONDS = 15 * 60;

export type TimerStatus = "idle" | "running" | "complete";

export interface TimerState {
  status: TimerStatus;
  /** Seconds left as of the last `tick`. Authoritative while idle or complete. */
  remainingSeconds: number;
  /** Epoch ms the current run started at, or null while not running. */
  startedAt: number | null;
  /** `remainingSeconds` snapshot at the moment `start` was called. */
  remainingAtStart: number;
}

export function createTimer(
  durationSeconds: number = TIMER_DURATION_SECONDS,
): TimerState {
  return {
    status: "idle",
    remainingSeconds: durationSeconds,
    startedAt: null,
    remainingAtStart: durationSeconds,
  };
}

/** T1: click starts the countdown. No-op if already running. */
export function start(state: TimerState, now: number): TimerState {
  if (state.status === "running") return state;
  return {
    ...state,
    status: "running",
    startedAt: now,
    remainingAtStart: state.remainingSeconds,
  };
}

/** T5: pausing preserves the remaining time rather than resetting it. */
export function pause(state: TimerState, now: number): TimerState {
  if (state.status !== "running") return state;
  const ticked = tick(state, now);
  return { ...ticked, status: "idle", startedAt: null };
}

/** T1: click toggles run/pause. */
export function toggle(state: TimerState, now: number): TimerState {
  return state.status === "running" ? pause(state, now) : start(state, now);
}

/**
 * T2: recompute remaining time from the wall-clock delta since `start`, not
 * from an accumulated tick count — background tabs throttle `setInterval` to
 * once a minute, so counting ticks drifts badly.
 */
export function tick(state: TimerState, now: number): TimerState {
  if (state.status !== "running" || state.startedAt === null) return state;
  const elapsed = Math.floor((now - state.startedAt) / 1000);
  const remaining = Math.max(0, state.remainingAtStart - elapsed);
  if (remaining <= 0) {
    return { ...state, status: "complete", remainingSeconds: 0, startedAt: null };
  }
  return { ...state, remainingSeconds: remaining };
}

/** T3: called after the 5s completion fade to return to a fresh countdown. */
export function reset(
  state: TimerState,
  durationSeconds: number = TIMER_DURATION_SECONDS,
): TimerState {
  return createTimer(durationSeconds);
}

/** `js/renderer.js:304-308`: `M:SS`, seconds zero-padded, minutes not. */
export function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}
