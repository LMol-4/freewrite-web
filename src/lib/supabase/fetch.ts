/** Bound network waits without changing Supabase's error/session-removal contract. */
let retryNotBefore = 0;
/** Backend Retry-After is a transport hint, never account state. */
export function retryAfterDelay() { return Math.max(0, retryNotBefore - Date.now()); }
export async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const upstream = init?.signal ?? (input instanceof Request ? input.signal : null);
  const abort = () => controller.abort(upstream?.reason);
  if (upstream?.aborted) abort();
  else upstream?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException("Request timed out", "TimeoutError")), 10000);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    if (response.status === 429 || response.status === 503) {
      const value = response.headers.get("Retry-After");
      if (value) {
        const delay = /^\d+$/.test(value) ? Number(value) * 1000 : Date.parse(value) - Date.now();
        if (Number.isFinite(delay) && delay > 0) retryNotBefore = Math.max(retryNotBefore, Date.now() + delay);
      }
    }
    return response;
  }
  finally { clearTimeout(timer); upstream?.removeEventListener("abort", abort); }
}
