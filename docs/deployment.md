# Production deployment

CI owns production releases: all checks and both browser suites → staged Vercel
production build → pending Supabase migrations → MCP schema check → promotion.
Pull requests only use disposable databases. Releases run serially and are not
automatically cancelled by newer pushes. A failed step stops the release.
CLI installation is tested in a fast parallel CI job before release. Once tests
pass, database linking, a migration dry run, and verification-API permissions are
checked before the Vercel build. These checks do not apply migrations.

Vercel builds once using its production settings and build cache. `--skip-domain`
keeps the existing site on the production domain until `vercel promote` runs.
GitHub coordinates the gates; it does not rebuild the production app locally or
download Vercel's sensitive environment variables. Staged deployments still have
their own URL and production database access; they are not isolated test backends.

## One-time setup

In GitHub repository **Settings → Environments**, create `production` and restrict
deployment branches to `main`. Add these environment secrets:

| Secret | Value |
| --- | --- |
| `VERCEL_TOKEN` | Create at [Vercel account tokens](https://vercel.com/account/tokens), scoped to the project's team |
| `SUPABASE_ACCESS_TOKEN` | Create at [Supabase account tokens](https://supabase.com/dashboard/account/tokens), with access to the project |
| `SUPABASE_DB_PASSWORD` | The Supabase project's database password (not an API key) |

Scope the Supabase token to this project. Grant **Project Settings**, **API Keys**,
and **API Key Secrets** Read permissions for `supabase link`, plus **Database Read**
for the schema verification query. Also grant **Connection Pooling → Read**:
the pinned CLI reads the session-pooler connection settings so hosted runners
can connect without depending on direct-database IPv6 access.
SQL migrations authenticate with the database
password. Do not add required environment reviewers if you want automatic releases.

Add these environment variables in the same GitHub environment:

| Variable | Current project value |
| --- | --- |
| `VERCEL_ORG_ID` | `team_AfeU1RcyaZjIbM0t8qZJGJnf` |
| `VERCEL_PROJECT_ID` | `prj_jeZBTojhVIKf7yjlgiQRsVcJ5BIs` |
| `SUPABASE_PROJECT_REF` | `fnfdfnwkcdpdxifagngw` |

In Vercel's `freewrite-web` project, configure the **Production** environment
variables below (also listed in [.env.example](../.env.example)):

| Variable | Production value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://fnfdfnwkcdpdxifagngw.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | This project's publishable/anon key |
| `APP_ORIGIN` | Your live site's HTTPS origin, without a trailing slash |
| `SUPABASE_SERVICE_ROLE_KEY` | This project's server-only service-role key |
| `MCP_KEY_ENCRYPTION_SECRET` | Your existing 64-character hexadecimal encryption secret |

`APP_ALLOWED_ORIGINS` is optional; omit it unless you have additional trusted
origins. Keep `MCP_KEY_ENCRYPTION_SECRET` stable across deployments. The Supabase
service credential and MCP encryption secret belong in Vercel, not in public
variables or the repository. Mark both server secrets Sensitive; validation runs
inside Vercel where they are available. Do not regenerate an existing encryption
secret. CI passes the expected project reference to the build automatically.
Set the project's Node.js version to **22.x**, matching CI.
Leave access to system environment variables enabled for Next.js deployment
metadata. Production validation itself runs explicitly and cannot be skipped by
disabling that setting.

`vercel.json` disables automatic Git deployments; leave that setting in place.
GitHub Actions deploys through the Vercel CLI instead. No Git disconnect is needed.
Remove any external deploy hooks or automation that independently deploys this
project. Do not require the old Vercel Git deployment status for merging PRs;
require the existing GitHub **CI / test** check instead.
No Vercel Deployment Check or deploy hook needs to be added: GitHub waits for the
staged build and migrations, then explicitly promotes that exact deployment.
Keep normal deployment protection enabled for staged deployment URLs.

Configure these settings before merging the pipeline PR. Then merge into `main`
and watch **Actions → CI → release**. The first successful release applies the
pending MCP migration automatically. No manual SQL is needed.

## Failures and retries

Missing settings, failed tests, or a failed build stop before migrations. A failed
migration prevents app deployment. Successful migrations remain applied if a
later deployment fails; the next run applies only outstanding migrations.
Do not reset the production database or edit already-applied migration files.

After correcting a setting, use **Actions → CI → Run workflow → main** to run the
whole pipeline again. Outdated commit reruns are rejected. Because the existing
app stays live during migration (and if deployment fails), write backward-compatible
migrations; remove old columns only after deployed code no longer uses them.

GitHub may replace an older queued run with the newest one; the running release
is not cancelled. The newest checkout contains all committed migrations, so
intermediate queued releases do not need to deploy individually. Manual cancellation
and job timeouts can still interrupt a release. If promotion times out, inspect
Vercel before retrying: promotion may continue after the CLI stops waiting.

The schema check uses Supabase's documented Management API query endpoint (currently
Beta). A provider outage or permission error blocks promotion; it never bypasses
the check. GitHub and Vercel cannot make database migration and app promotion one
atomic transaction, and rolling back the app does not roll back the database.

The release's database check verifies MCP table/function existence without creating users,
reading notes, or rotating keys. After deployment, open `/connect` while signed in
to confirm the complete account flow.

References: [Vercel staged deployments](https://vercel.com/docs/cli/deploying-from-cli#deploying-a-staged-production-build),
[Vercel Git deployment configuration](https://vercel.com/docs/project-configuration/git-configuration),
[Supabase deployment environments](https://supabase.com/docs/guides/deployment/managing-environments).
