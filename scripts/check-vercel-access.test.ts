import { expect, it } from 'vitest';
import { checkVercelAccess } from './check-vercel-access.mjs';

const env = { VERCEL_TOKEN: 'test-token', VERCEL_ORG_ID: 'team_test', VERCEL_PROJECT_ID: 'prj_test' };
it('checks both team and project before approving the target', async () => {
  const paths: string[] = [];
  await checkVercelAccess(env, async url => {
    paths.push(String(url));
    return Response.json({ id: 'prj_test', accountId: 'team_test', nodeVersion: '22.x' });
  });
  expect(paths).toEqual(['https://api.vercel.com/teams/team_test', 'https://api.vercel.com/v9/projects/prj_test?teamId=team_test']);
});
it.each([401, 403, 404])('explains HTTP %s without printing provider payloads', async status => {
  await expect(checkVercelAccess(env, async () => new Response('sensitive provider detail', { status }))).rejects.toThrow(`team access failed (HTTP ${status})`);
});
it('rejects an unexpected owner', async () => {
  await expect(checkVercelAccess(env, async () => Response.json({ id: 'prj_test', accountId: 'team_other', nodeVersion: '22.x' }))).rejects.toThrow('different project or owner');
});
it('rejects whitespace in a pasted token before making a request', async () => {
  await expect(checkVercelAccess({ ...env, VERCEL_TOKEN: 'test-token\n' })).rejects.toThrow('whitespace');
});
