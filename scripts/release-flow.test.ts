import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { checkReleaseAccess } from './check-release-access.mjs';
import { fetchWithRetry } from './release-http.mjs';

const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
for (const job of ['checks', 'browsers', 'release-tools']) {
  const block = workflow.split(`  ${job}:`)[1].split(/\n  [a-z][a-z-]*:/)[0];
  const condition = block.match(/if: \$\{\{ (.+) \}\}/)![1].replaceAll('needs.production-access', 'needs["production-access"]');
  // These expressions use the same boolean/property syntax as JavaScript.
  const allows = new Function('github', 'needs', 'cancelled', `return (${condition});`);
  it.each([
    ['push', 'refs/heads/main', 'success', false, true],
    ['push', 'refs/heads/main', 'failure', false, false],
    ['push', 'refs/heads/main', 'skipped', false, false],
    ['push', 'refs/heads/main', 'cancelled', false, false],
    ['workflow_dispatch', 'refs/heads/main', 'failure', false, false],
    ['pull_request', 'refs/pull/1/merge', 'skipped', false, true],
    ['workflow_dispatch', 'refs/heads/feature', 'skipped', false, true],
    ['pull_request', 'refs/pull/1/merge', 'skipped', true, false],
  ])(`${job} gate: %s %s %s cancelled=%s`, (event_name, ref, result, cancelled, expected) => {
    expect(block).toContain('needs: [production-access]');
    expect(allows({ event_name, ref }, { 'production-access': { result } }, () => cancelled)).toBe(expected);
  });
}

it('runs API preflight without migrations or using the database password', async () => {
  const urls: string[] = [];
  await checkReleaseAccess({ VERCEL_TOKEN: 'token', VERCEL_ORG_ID: 'team_test', VERCEL_PROJECT_ID: 'prj_test', SUPABASE_ACCESS_TOKEN: 'token', SUPABASE_PROJECT_REF: 'project', SUPABASE_DB_PASSWORD: 'unused-password' }, async (url, options) => {
    urls.push(String(url));
    expect(JSON.stringify(options)).not.toContain('unused-password');
    if (String(url).endsWith('/database/query')) {
      expect(JSON.parse(options!.body as string)).toEqual({ query: 'select true as ready', read_only: true });
      return Response.json([{ ready: true }]);
    }
    return Response.json({ id: 'prj_test', accountId: 'team_test', nodeVersion: '22.x' });
  });
  expect(urls).toHaveLength(4);
});

it('does not retry authentication failures', async () => {
  let attempts = 0;
  const result = await fetchWithRetry('https://example.test', {}, async () => { attempts++; return new Response('', { status: 403 }); });
  expect(result.status).toBe(403);
  expect(attempts).toBe(1);
});
it('bounds retries for temporary server failures', async () => {
  let attempts = 0;
  const result = await fetchWithRetry('https://example.test', {}, async () => { attempts++; return new Response('', { status: 503 }); }, async () => {});
  expect(result.status).toBe(503);
  expect(attempts).toBe(3);
});
