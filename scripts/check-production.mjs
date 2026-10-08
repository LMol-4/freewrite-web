import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';

export function validateProduction(env, projectRef) {
  for (const name of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'APP_ORIGIN', 'SUPABASE_SERVICE_ROLE_KEY', 'MCP_KEY_ENCRYPTION_SECRET']) {
    if (!env[name]?.trim() || env[name].startsWith('replace-with-')) throw Error(`Missing production setting: ${name}`);
  }
  if (!projectRef || new URL(env.NEXT_PUBLIC_SUPABASE_URL).origin !== `https://${projectRef}.supabase.co`) {
    throw Error('Supabase migration target does not match the production app');
  }
  const origin = new URL(env.APP_ORIGIN);
  if (origin.protocol !== 'https:' || origin.origin !== env.APP_ORIGIN || origin.hostname === 'localhost') {
    throw Error('APP_ORIGIN must be the canonical HTTPS origin without a trailing slash');
  }
  if (!/^[a-f0-9]{64}$/i.test(env.MCP_KEY_ENCRYPTION_SECRET)) throw Error('MCP_KEY_ENCRYPTION_SECRET must contain 64 hexadecimal characters');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const env = parseEnv(readFileSync('.vercel/.env.production.local', 'utf8'));
    validateProduction(env, process.env.SUPABASE_PROJECT_REF);
    if (process.argv.includes('--database')) {
      const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const table = await client.from('mcp_keys').select('generation', { head: true }).limit(0);
      // A deliberately invalid hash verifies the RPC and service credential without changing keys.
      const rpc = await client.rpc('authenticate_mcp_key', { p_hash: 'deployment-check-invalid-hash' });
      if (table.error || rpc.error || rpc.data?.length !== 0) throw Error('MCP database verification failed; check migration and service credential');
    }
    console.log('Production configuration verified' + (process.argv.includes('--database') ? ', including MCP database access.' : '.'));
  } catch (error) {
    // Never dump provider responses, environment values, or credentials into CI logs.
    console.error(error instanceof Error ? error.message : 'Production verification failed');
    process.exitCode = 1;
  }
}
