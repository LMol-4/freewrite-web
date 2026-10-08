import { describe, expect, it } from 'vitest';
import { validateProduction } from './check-production.mjs';

const env = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://exampleproject.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'public-test-key',
  APP_ORIGIN: 'https://writing.example',
  SUPABASE_SERVICE_ROLE_KEY: 'private-test-key',
  MCP_KEY_ENCRYPTION_SECRET: 'ab'.repeat(32),
};
describe('production release preflight', () => {
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
  it.each(['http://localhost:3000', 'https://writing.example/path', 'https://writing.example/'])('rejects invalid origin %s', origin => {
    expect(() => validateProduction({ ...env, APP_ORIGIN: origin }, 'exampleproject')).toThrow('canonical HTTPS');
  });
});
