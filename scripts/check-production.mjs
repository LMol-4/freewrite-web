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

export async function verifyDatabase(env, request = fetch) {
      const ref = env.SUPABASE_PROJECT_REF;
      if (!/^[a-z0-9]+$/.test(ref ?? '') || !env.SUPABASE_ACCESS_TOKEN) throw Error('Missing database verification credentials');
      // Reuse the migration account token; runtime secrets stay inside Vercel.
      const response = await request(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: "select to_regclass('public.mcp_keys') is not null and to_regprocedure('public.authenticate_mcp_key(text)') is not null and to_regprocedure('public.replace_mcp_key(uuid,uuid,uuid,text,text)') is not null as ready", read_only: true }),
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok || (await response.json())[0]?.ready !== true) throw Error('MCP database verification failed; check migration');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.includes('--database')) {
      await verifyDatabase(process.env);
    } else if (process.env.VERCEL_ENV === 'production') {
      validateProduction(process.env, process.env.SUPABASE_PROJECT_REF);
      const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const { error } = await client.from('entries').select('id', { head: true }).limit(0);
      if (error) throw Error('Production Supabase credential verification failed');
    } else {
      console.log('Production preflight skipped outside Vercel production builds.');
      process.exit(0);
    }
    console.log(process.argv.includes('--database') ? 'MCP database schema verified.' : 'Production configuration verified.');
  } catch (error) {
    // Never dump provider responses, environment values, or credentials into CI logs.
    console.error(error instanceof Error ? error.message : 'Production verification failed');
    process.exitCode = 1;
  }
}
