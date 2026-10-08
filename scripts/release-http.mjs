import { setTimeout } from 'node:timers/promises';

// Only for read-only access checks, never deploys, promotions or migrations.
export async function fetchWithRetry(url, options, request = fetch, wait = setTimeout) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await request(url, { ...options, signal: AbortSignal.timeout(10000) });
      if (response.status !== 429 && response.status < 500) return response;
      if (attempt === 2) return response;
      await response.body?.cancel();
    } catch {
      if (attempt === 2) throw Error('API access check could not connect after three attempts');
    }
    await wait(500 * (attempt + 1));
  }
  throw Error('API access check failed');
}
