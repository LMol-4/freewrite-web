import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, readdirSync, copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
const root = resolve(import.meta.dirname, '..');
const work = resolve(root, '.local-test');
const project = 'freewrite-web-disposable';
function command(file, args, options = {}) {
  const result = spawnSync(file, args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, ...options });
  if (result.error || result.status !== 0) throw Error(`${file} ${args.join(' ')} failed\n${result.stderr ?? result.error ?? ''}`);
  return result.stdout;
}
function verifyConfig() {
  if (!existsSync(resolve(work, 'DISPOSABLE')) || readFileSync(resolve(work, 'supabase/config.toml'), 'utf8').match(/^project_id = "([^"]+)"/m)?.[1] !== project) throw Error('Refusing an unverified local stack');
  if (existsSync(resolve(work, 'supabase/.temp/project-ref'))) throw Error('Disposable stack must never be linked');
}
function status() {
  verifyConfig();
  const value = JSON.parse(command('supabase', ['status', '--workdir', work, '-o', 'json']));
  if (value.API_URL !== 'http://127.0.0.1:55321' || new URL(value.DB_URL).hostname !== '127.0.0.1' || new URL(value.DB_URL).port !== '55322') throw Error('Unexpected backend target');
  const label = command('docker', ['inspect', `supabase_db_${project}`, '--format', '{{ index .Config.Labels "com.supabase.cli.project" }}']).trim();
  if (label !== project) throw Error('Unexpected database container');
  return value;
}
function environment() {
  const value = status();
  const secretPath = resolve(work, "mcp-secret");
  if (!existsSync(secretPath)) writeFileSync(secretPath, randomBytes(32).toString("hex"));
  const env = { NEXT_PUBLIC_SUPABASE_URL: value.API_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: value.ANON_KEY,
    LOCAL_TEST_SERVICE_KEY: value.SERVICE_ROLE_KEY, SUPABASE_SERVICE_ROLE_KEY: value.SERVICE_ROLE_KEY,
    MCP_KEY_ENCRYPTION_SECRET: readFileSync(secretPath, "utf8"), APP_ORIGIN: 'http://127.0.0.1:3000', APP_ALLOWED_ORIGINS: 'http://localhost:3000', LOCAL_TEST_MAIL_URL: 'http://127.0.0.1:55324' };
  writeFileSync(resolve(work, 'env.json'), JSON.stringify(env));
  return { ...process.env, ...env };
}
const task = process.argv[2];
if (task === 'prepare') {
  mkdirSync(resolve(work, 'supabase/migrations'), { recursive: true });
  let config = readFileSync(resolve(root, 'supabase/config.toml'), 'utf8').replace('project_id = "freewrite-web"', `project_id = "${project}"`).replaceAll('5432', '5532');
  // Disable unused services in the disposable copy only. Unlike --exclude,
  // realtime.enabled=false also skips its database initialization job.
  // Disabling Studio also disables its postgres-meta service.
  for (const service of ['realtime', 'studio']) {
    const setting = new RegExp(`(\\[${service}\\]\\r?\\n)enabled = (?:true|false)`);
    if (!setting.test(config)) throw Error(`Missing ${service} setting in disposable config`);
    config = config.replace(setting, '$1enabled = false');
  }
  writeFileSync(resolve(work, 'supabase/config.toml'), config);
  writeFileSync(resolve(work, 'DISPOSABLE'), project);
  for (const name of readdirSync(resolve(root, 'supabase/migrations'))) if (name.endsWith('.sql')) copyFileSync(resolve(root, 'supabase/migrations', name), resolve(work, 'supabase/migrations', name));
  console.log('Prepared isolated local project on ports 55320–55329.');
} else if (task === 'start') {
  verifyConfig(); command('supabase', ['start', '--workdir', work, '--exclude', 'vector,logflare,studio,edge-runtime']); environment(); console.log('Disposable local stack ready.');
} else if (task === 'reset') {
  status(); command('supabase', ['db', 'reset', '--local', '--workdir', work]); environment(); console.log('Disposable local migrations replayed.');
} else if (task === 'migrate') {
  status(); command('supabase', ['migration', 'up', '--local', '--workdir', work]); console.log('Disposable local upgrade applied.');
} else if (task === 'types') {
  status(); writeFileSync(resolve(root, 'src/lib/supabase/database.types.ts'), command('supabase', ['gen', 'types', 'typescript', '--local', '--workdir', work]));
} else if (task === 'upgrade-check') {
  status(); command('supabase', ['db', 'reset', '--local', '--version', '20261006140000', '--workdir', work]);
  const env = environment();
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.LOCAL_TEST_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.auth.admin.createUser({ email: 'upgrade-fixture@example.test', password: 'Disposable-Upgrade-Only-123', email_confirm: true });
  if (error) throw error;
  const userId = data.user.id;
  const id = 'b322c5c0-005a-430f-8b0a-b1a48fc058af';
  const path = `${userId}/${id}.md`;
  try {
    for (const result of [await admin.storage.from('notes').upload(path, 'legacy complete body'),
      await admin.from('entries').insert({ id, user_id: userId, storage_path: path, preview_text: 'legacy complete body', version: 7, word_count: 3, char_count: 20 }),
      await admin.from('preferences').update({ theme: 'dark', font: 'serif', font_size: 24 }).eq('user_id', userId)]) if (result.error) throw result.error;
    command('supabase', ['migration', 'up', '--local', '--workdir', work]);
    const row = await admin.from('entries').select('*').eq('id', id).single();
    const body = await admin.storage.from('notes').download(path);
    const preferences = await admin.from('preferences').select('*').eq('user_id', userId).single();
    if (row.error || row.data.version !== 7 || row.data.storage_path !== path || row.data.revision_id !== null || row.data.preview_text !== 'legacy complete body' || body.error || await body.data.text() !== 'legacy complete body' || preferences.data?.theme !== 'dark' || preferences.data?.font_size !== 24) throw Error('Upgrade did not preserve the representative legacy data');
    console.log('Forward upgrade preserved legacy metadata/body and preferences.');
  } finally { await admin.storage.from('notes').remove([path]); await admin.auth.admin.deleteUser(userId); }
} else if (task === 'stop') {
  verifyConfig(); command('supabase', ['stop', '--workdir', work]); console.log('Disposable local stack stopped; volumes retained.');
} else if (task === 'build' || task === 'test') {
  const env = environment();
  const fingerprint = createHash("sha256").update(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).digest("hex");
  if (task === "test") {
    const stamp = JSON.parse(readFileSync(resolve(work, "build.json"), "utf8"));
    if (stamp.buildId !== readFileSync(resolve(root, ".next/BUILD_ID"), "utf8") || stamp.url !== env.NEXT_PUBLIC_SUPABASE_URL || stamp.keyHash !== fingerprint) throw Error("Build is not verified for this disposable backend. Run local-test build first.");
  }
  // Administrative fixture credentials are never passed to the application build.
  if (task === 'build') { delete env.LOCAL_TEST_SERVICE_KEY; delete env.SUPABASE_SERVICE_ROLE_KEY; delete env.MCP_KEY_ENCRYPTION_SECRET; }
  const args = task === 'build' ? ['node_modules/next/dist/bin/next', 'build'] : ['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(3)];
  command(process.execPath, args, { env, stdio: 'inherit' });
  if (task === 'build') command(process.execPath, ['scripts/build-worker.mjs'], { env, stdio: 'inherit' });
  if (task === "build") writeFileSync(resolve(work, "build.json"), JSON.stringify({ buildId: readFileSync(resolve(root, ".next/BUILD_ID"), "utf8"), url: env.NEXT_PUBLIC_SUPABASE_URL, keyHash: fingerprint }));
} else throw Error('Use prepare/start/reset/build/test/stop');
