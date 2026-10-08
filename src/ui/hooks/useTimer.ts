"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createTimer, formatTime, reset, tick, toggle, type TimerState } from "../../core/timer";

/** D4: self-hosted, not fetched from pomofocus.io on every launch. */
const CLICK_SOUND_SRC = "/sounds/click.v1.wav";

/** T3: fade duration before the timer resets to 15:00. */
const COMPLETE_FADE_MS = 5000;

const TICK_INTERVAL_MS = 1000;

/**
 * T1-T5, wrapping `core/timer.ts`'s wall-clock state machine. The interval
 * just triggers a recompute — `tick` derives remaining time from real elapsed
 * time, so a throttled background tab still catches up correctly (T2).
 */
export function useTimer() {
  const [state, setState] = useState<TimerState>(() => createTimer());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (state.status !== "running") return;
    const interval = setInterval(() => {
      setState((current) => tick(current, Date.now()));
    }, TICK_INTERVAL_MS);
    const wake = () => setState(current => tick(current, Date.now()));
    const visible = () => { if (document.visibilityState === "visible") wake(); };
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", visible);
    return () => { clearInterval(interval); window.removeEventListener("focus", wake); document.removeEventListener("visibilitychange", visible); };
  }, [state.status]);

  useEffect(() => {
    if (state.status !== "complete") return;
    const timeout = setTimeout(() => {
      setState((current) => (current.status === "complete" ? reset(current) : current));
    }, COMPLETE_FADE_MS);
    return () => clearTimeout(timeout);
  }, [state.status]);

  const handleToggle = useCallback(() => {
    setState((current) => toggle(current, Date.now()));
    // Audio is optional: media initialization/seeking can also throw synchronously.
    try {
      if (!audioRef.current) audioRef.current = new Audio(CLICK_SOUND_SRC);
      audioRef.current.currentTime = 0;
      void audioRef.current.play().catch(() => {});
    } catch { /* The timer must still work when sound is unavailable. */ }
  }, []);

  return {
    status: state.status,
    label: formatTime(state.remainingSeconds),
    toggle: handleToggle,
    reset: () => setState(current => reset(current)),
  };
}
