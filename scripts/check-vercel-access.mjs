import { pathToFileURL } from 'node:url';
import { fetchWithRetry } from './release-http.mjs';

export async function checkVercelAccess(env, request = fetch) {
  for (const name of ['VERCEL_TOKEN', 'VERCEL_ORG_ID', 'VERCEL_PROJECT_ID']) {
    if (!env[name]?.trim()) throw Error(`Missing GitHub production setting: ${name}`);
    if (env[name] !== env[name].trim()) throw Error(`Remove surrounding whitespace from ${name}`);
  }
  const team = encodeURIComponent(env.VERCEL_ORG_ID);
  const project = encodeURIComponent(env.VERCEL_PROJECT_ID);
  async function get(path, label) {
    let response;
    try {
      response = await fetchWithRetry(`https://api.vercel.com${path}`, {
        headers: { Authorization: `Bearer ${env.VERCEL_TOKEN}` },
      }, request);
    } catch { throw Error(`Vercel ${label} check could not connect. Retry the access check.`); }
    if (!response.ok) throw Error(`Vercel ${label} access failed (HTTP ${response.status}). Check the IDs and replace VERCEL_TOKEN with a token scoped to the owning team, not a personal or project-only token.`);
    try { return await response.json(); }
    catch { throw Error(`Vercel ${label} returned an invalid response.`); }
  }
  // The CLI resolves both the team and project, even for a project-only deploy.
  await get(`/teams/${team}`, 'team');
  const settings = await get(`/v9/projects/${project}?teamId=${team}`, 'project');
  if (settings.id !== env.VERCEL_PROJECT_ID || settings.accountId !== env.VERCEL_ORG_ID) throw Error('Vercel returned a different project or owner. Check the GitHub variables.');
  if (settings.nodeVersion !== '22.x') throw Error('Set Vercel project Node.js Version to 22.x.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await checkVercelAccess(process.env);
    console.log('Vercel team, project access, and Node.js version verified. No deployment created.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Vercel access check failed.');
    process.exitCode = 1;
  }
}
