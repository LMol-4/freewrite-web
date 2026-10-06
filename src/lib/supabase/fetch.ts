/** Bound network waits without changing Supabase's error/session-removal contract. */
export async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const upstream = init?.signal ?? (input instanceof Request ? input.signal : null);
  const abort = () => controller.abort(upstream?.reason);
  if (upstream?.aborted) abort();
  else upstream?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException("Request timed out", "TimeoutError")), 10000);
  try { return await fetch(input, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); upstream?.removeEventListener("abort", abort); }
}
