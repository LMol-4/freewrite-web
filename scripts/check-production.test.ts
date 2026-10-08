import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { validateProduction, verifyDatabase } from './check-production.mjs';

const env = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://exampleproject.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'public-test-key',
  APP_ORIGIN: 'https://writing.example',
  SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test-key',
  MCP_KEY_ENCRYPTION_SECRET: 'ab'.repeat(32),
};
describe('production release preflight', () => {
  it('requires production settings even without Vercel system variables', () => {
    const result = spawnSync(process.execPath, ['scripts/check-production.mjs', '--production'], { env: {}, encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Missing production setting');
  });
  it('accepts a complete configuration for the migration target', () => {
    expect(() => validateProduction(env, 'exampleproject')).not.toThrow();
  });
  it.each(Object.keys(env))('rejects missing %s', name => {
    expect(() => validateProduction({ ...env, [name]: '' }, 'exampleproject')).toThrow('Missing production setting');
  });
  it('rejects a different database before migrations', () => {
    expect(() => validateProduction(env, 'otherproject')).toThrow('does not match');
  });
  it('rejects malformed encryption keys', () => {
    expect(() => validateProduction({ ...env, MCP_KEY_ENCRYPTION_SECRET: 'short' }, 'exampleproject')).toThrow('64 hexadecimal');
  });
  it('rejects a public key in the server credential setting', () => {
    expect(() => validateProduction({ ...env, SUPABASE_SERVICE_ROLE_KEY: 'sb_publishable_test-key' }, 'exampleproject')).toThrow('not a publishable/anon key');
  });
  it('accepts legacy service-role keys for the matching project', () => {
    const key = 'header.' + Buffer.from(JSON.stringify({ role: 'service_role', ref: 'exampleproject' })).toString('base64url') + '.signature';
    expect(() => validateProduction({ ...env, SUPABASE_SERVICE_ROLE_KEY: key }, 'exampleproject')).not.toThrow();
  });
  it.each(['http://localhost:3000', 'https://writing.example/path', 'https://writing.example/'])('rejects invalid origin %s', origin => {
    expect(() => validateProduction({ ...env, APP_ORIGIN: origin }, 'exampleproject')).toThrow('canonical HTTPS');
  });
});

describe('post-migration gate', () => {
  const credentials = { SUPABASE_PROJECT_REF: 'exampleproject', SUPABASE_ACCESS_TOKEN: 'test-token' };
  it('accepts a complete schema', async () => {
    await expect(verifyDatabase(credentials, async () => Response.json([{ ready: true }]))).resolves.toBeUndefined();
  });
  it.each([{ result: [] }, { result: [{ ready: false }] }, { result: [{ ready: 'true' }] }])('rejects incomplete schema: $result', async ({ result }) => {
    await expect(verifyDatabase(credentials, async () => Response.json(result))).rejects.toThrow('verification failed');
  });
  it('rejects provider errors without exposing their response', async () => {
    await expect(verifyDatabase(credentials, async () => new Response('private diagnostic', { status: 403 }))).rejects.toThrow('verification failed; check migration');
  });
  it('rejects malformed provider responses without logging their contents', async () => {
    await expect(verifyDatabase(credentials, async () => new Response('private diagnostic'))).rejects.toThrow('MCP database verification failed');
  });
});
