import { pathToFileURL } from 'node:url';
import { checkVercelAccess } from './check-vercel-access.mjs';
import { verifyDatabase } from './check-production.mjs';
import { fetchWithRetry } from './release-http.mjs';

export async function checkReleaseAccess(env, request = fetch) {
  for (const name of ['VERCEL_TOKEN', 'VERCEL_ORG_ID', 'VERCEL_PROJECT_ID', 'SUPABASE_ACCESS_TOKEN', 'SUPABASE_PROJECT_REF', 'SUPABASE_DB_PASSWORD']) {
    if (!env[name]?.trim()) throw Error(`Missing GitHub production setting: ${name}`);
  }
  const ref = env.SUPABASE_PROJECT_REF;
  if (!/^[a-z0-9]+$/.test(ref)) throw Error('Invalid SUPABASE_PROJECT_REF');
  await checkVercelAccess(env, request);
  const response = await fetchWithRetry(`https://api.supabase.com/v1/projects/${ref}`, {
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` },
  }, request);
  if (!response.ok) throw Error(`Supabase project access failed (HTTP ${response.status}). Check SUPABASE_ACCESS_TOKEN scope and SUPABASE_PROJECT_REF.`);
  await verifyDatabase(env, request, false);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await checkReleaseAccess(process.env);
    console.log('Vercel and Supabase API access verified. Database password and migration history will be checked in the release job.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Production API access check failed');
    process.exitCode = 1;
  }
}
