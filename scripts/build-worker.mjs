import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

// Next's emitted static directory is authoritative. Include all chunks (including
// lazy controls), styles and fonts instead of guessing an internal route graph.
function files(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap(item => item.isDirectory() ? files(join(dir, item.name)) : [join(dir, item.name)]); }
const html = readFileSync('.next/server/app/offline.html', 'utf8');
if (!html.includes('Checking local access') || /"userId":/.test(html)) throw Error('Expected a neutral prerendered offline shell');
const assets = files('.next/static').filter(file => /\.(js|css|woff2?)$/.test(file)).map(file => '/_next/static/' + relative('.next/static', file).replaceAll('\\', '/'));
for (const dir of ['public/icons', 'public/sounds']) for (const file of files(dir).filter(file => /\.(png|wav)$/.test(file))) assets.push('/' + relative('public', file).replaceAll('\\', '/'));
const build = readFileSync('.next/BUILD_ID', 'utf8').trim();
const shellHash = createHash('sha256').update(html).digest('hex');
const source = readFileSync('src/pwa/worker.js', 'utf8');
writeFileSync('public/sw.js', `/* Generated for ${build}; do not edit. */\nconst BUILD = ${JSON.stringify(build)};\nconst ASSETS = ${JSON.stringify(assets)};\nconst SHELL_HASH = ${JSON.stringify(shellHash)};\n${source}`);
console.log(`Prepared neutral shell and ${assets.length} static assets for ${build}.`);
