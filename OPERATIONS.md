# Release operations

Local preparation is not a production release. No hosted settings, migration,
push or deployment has been performed by this work. Record the exact commit,
environment and outcome for each gate below; keep credentials out of evidence.

## Environment and promotion

Use Node 22, pnpm 11.10.0 and the committed lockfile. `vercel.json` runs the full
build including the offline worker. Configure Node 22 in the project settings.
The ignored-build script disables Git preview builds by default. Before removing
that restriction, provision a separate test Supabase project with synthetic data,
scope preview public URL/key variables to it, and test its owned HTTPS callback
origin. Never copy production journal credentials into shared previews. This
script does not block manual deployments or secure an already deployed preview.

Production needs `NEXT_PUBLIC_SUPABASE_URL`, its publishable key, `APP_ORIGIN`
and any exact owned `APP_ALLOWED_ORIGINS`. These values are build/environment
specific; rebuild when public values change. No service-role key belongs in
the app, Vercel variables or this CI workflow. Do not use wildcard preview redirects.

Before an authorized release:

1. Confirm the Vercel project, repository root, production branch and owned domain.
2. Enable automatic production aliasing and add the actual GitHub `test` job from
   the `CI` workflow as a required Deployment Check. Select its emitted check in
   the dashboard; do not assume a typed display label configures it.
3. Use a controlled candidate to prove a pending/failing check preserves the
   current production alias, then that passing checks promote that same commit.
   Record both deployment and commit IDs. Never use a manual bypass as evidence.
4. Confirm preview isolation/disabled status, email confirmation, minimum password
   length eight, exact redirect allowlists, mail sender and real delivery/recovery.
5. On a fresh production account: confirm, write, sync on a second device, open
   history, copy/open an AI prompt. Check sign-out and private Storage/RLS denial
   with another account. Use harmless acceptance text.
6. Verify actual CDN headers: authenticated HTML/auth responses must not be shared
   cached; `/sw.js` revalidates with JavaScript MIME; versioned icons/sound and
   hashed static assets have intended cache headers. Confirm offline readiness,
   cold launch and worker upgrade on real iPhone and Android hardware.

Vercel's [Deployment Checks](https://vercel.com/docs/deployment-checks) gate
production promotion, not build creation. The preview rule uses the documented
[ignored build command](https://vercel.com/docs/project-configuration/vercel-json#ignorecommand).
Neither checked-in configuration nor local tests prove those hosted gates.

## Database and recovery

Never reset a linked or ordinary local journal database. The test harness checks
the disposable project label and loopback ports before privileged operations.
`reset` and `upgrade-check` destroy disposable fixtures; use only when deliberately
testing migrations. `start`, `build`, `test`, `stop` reuse retained volumes.
The seven existing migrations are preserved. Before separately authorized hosted
changes, compare its migration history/schema with the repository and test forward
application against representative old data. Inspect private bucket and policies;
local `config.toml` is not evidence of hosted auth settings. No blind config push.

Before schema changes, establish and verify a recovery procedure for both database
metadata and Storage bodies. A metadata-only backup cannot restore missing note
objects. Roll back application code only after checking schema and IndexedDB
compatibility; never downgrade/delete data to fit an older client. Keep known-good
static assets accessible for old service workers. Do not force worker activation
or clear browser storage to fix a release while unsynced writing exists.

## Retention and capacity review

Each successful publication stores a complete immutable UTF-8 body and a receipt.
Superseded revisions and ambiguous uploads are retained. Tombstones and receipts
are synchronization evidence, not disposable logs. There is no automatic GC or
user-facing version history. Entry deletion retries known object removal; do not
promise complete historical erasure or backups. Account deletion and export are
not an implemented operator workflow.

Estimate body growth using the sum of all published revision byte lengths, plus
orphan uploads. For example, sixty 100 KiB revisions add about 5.86 MiB per session;
1,000 such daily sessions add about 5.72 GiB/day before metadata, receipts and
overhead. This is a capacity scenario, not a measured usage claim. Retries reuse
the same mutation/object identity rather than deliberately create new revisions.
Remote traffic also includes reads, metadata paging, auth and preferences.

Before release and regularly afterward, record aggregate notes object count/bytes,
entry/tombstone/receipt counts, database size, Storage/API egress, retry/error rates
and oldest pending work without collecting journal contents. Compare real growth
to configured limits and set an owner/budget alert. Local fixture counts do not
predict production usage. Browser static caches retain old builds; measure their
growth across releases. Clearing site data also removes local drafts, so never
recommend that as routine cache maintenance.

Any future GC needs a separate reviewed protocol covering receipts, offline devices,
pending mutations, retained references and recovery. Age alone is not proof of safety.

## Asset and dependency gates

Font copyright/licences and exact hashes are in `src/fonts/`; icon provenance is
in `public/icons/SOURCE.txt`. Existing sound `/sounds/click.v1.wav` originated from
`https://pomofocus.io/audios/general/button.wav`. Redistribution permission is not
documented: obtain it or approve a replacement before release. Downloadability and
the original application's MIT package field do not establish third-party rights.

Run `pnpm audit` against the current registry before each release, review actual
dependency paths and patch compatibly; do not force a framework downgrade or major
upgrade to satisfy historical audit counts. Keep lockfile changes with verified
typecheck, lint, unit, production build and browser results. ESLint 9 is now marked
unsupported upstream; a future major tooling migration needs separate compatibility
work even if the current audit is clear.

Outstanding acceptance also includes real two-device conflicts, airplane-mode
reconnect, phone keyboards/background/restart, and verified hosted mail. Emulated
browser tests are complementary evidence. Push and deployment each require explicit
authorization; completing this checklist does not grant it.
