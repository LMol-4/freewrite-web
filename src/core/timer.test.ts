import { describe, expect, it } from "vitest";
import {
  TIMER_DURATION_SECONDS,
  createTimer,
  start,
  pause,
  toggle,
  tick,
  reset,
  formatTime,
} from "./timer";

const T0 = 1_700_000_000_000;

describe("createTimer", () => {
  it("starts idle at the full duration", () => {
    const state = createTimer();
    expect(state.status).toBe("idle");
    expect(state.remainingSeconds).toBe(TIMER_DURATION_SECONDS);
  });
});

describe("start / pause / toggle", () => {
  it("start transitions to running and anchors the wall clock", () => {
    const state = start(createTimer(), T0);
    expect(state.status).toBe("running");
    expect(state.startedAt).toBe(T0);
  });

  it("start is a no-op if already running", () => {
    const running = start(createTimer(), T0);
    const again = start(running, T0 + 5000);
    expect(again).toEqual(running);
  });

  it("pause preserves the remaining time rather than resetting it (T5)", () => {
    const running = start(createTimer(), T0);
    const paused = pause(running, T0 + 10_000); // 10s elapsed
    expect(paused.status).toBe("idle");
    expect(paused.remainingSeconds).toBe(TIMER_DURATION_SECONDS - 10);

    // Resuming continues the countdown from where it was paused, not from the top.
    const resumed = start(paused, T0 + 60_000);
    const later = tick(resumed, T0 + 65_000);
    expect(later.remainingSeconds).toBe(TIMER_DURATION_SECONDS - 15);
  });

  it("toggle flips between running and idle", () => {
    const running = toggle(createTimer(), T0);
    expect(running.status).toBe("running");
    const paused = toggle(running, T0 + 1000);
    expect(paused.status).toBe("idle");
  });
});

describe("tick", () => {
  it("computes remaining time from a wall-clock delta, not accumulated ticks (T2)", () => {
    const running = start(createTimer(), T0);
    // A single large jump (simulating a throttled background tab) is handled
    // correctly, unlike a counter incremented once per setInterval firing.
    const state = tick(running, T0 + 61_000);
    expect(state.remainingSeconds).toBe(TIMER_DURATION_SECONDS - 61);
    expect(state.status).toBe("running");
  });

  it("is a no-op while idle", () => {
    const idle = createTimer();
    expect(tick(idle, T0 + 5000)).toEqual(idle);
  });

  it("transitions to complete once the duration elapses (T3)", () => {
    const running = start(createTimer(), T0);
    const done = tick(running, T0 + TIMER_DURATION_SECONDS * 1000);
    expect(done.status).toBe("complete");
    expect(done.remainingSeconds).toBe(0);
  });

  it("clamps to zero rather than going negative", () => {
    const running = start(createTimer(), T0);
    const done = tick(running, T0 + (TIMER_DURATION_SECONDS + 500) * 1000);
    expect(done.remainingSeconds).toBe(0);
    expect(done.status).toBe("complete");
  });
});

describe("reset", () => {
  it("returns a fresh idle timer at the full duration", () => {
    const running = start(createTimer(), T0);
    const done = tick(running, T0 + TIMER_DURATION_SECONDS * 1000);
    const restarted = reset(done);
    expect(restarted).toEqual(createTimer());
  });
});

describe("formatTime", () => {
  it("formats minutes and seconds, seconds zero-padded", () => {
    expect(formatTime(TIMER_DURATION_SECONDS)).toBe("15:00");
    expect(formatTime(61)).toBe("1:01");
    expect(formatTime(9)).toBe("0:09");
    expect(formatTime(0)).toBe("0:00");
  });
});

it("preserves fractional pauses and ignores toggles during completion", () => {
  let timer = createTimer(1);
  timer = pause(start(timer, T0), T0 + 400);
  expect(timer.remainingSeconds).toBeCloseTo(.6);
  timer = pause(start(timer, T0 + 1000), T0 + 1400);
  expect(timer.remainingSeconds).toBeCloseTo(.2);
  timer = toggle(start(timer, T0 + 2000), T0 + 2300);
  expect(timer.status).toBe("complete");
  expect(toggle(timer, T0 + 2400)).toEqual(timer);
});
it("backward clock steps never increase remaining time; forward jumps may complete", () => {
  const running = tick(start(createTimer(10), T0), T0 + 3000);
  expect(tick(running, T0 - 5000).remainingSeconds).toBe(7);
  expect(tick(running, T0 + 20000).status).toBe("complete");
});
