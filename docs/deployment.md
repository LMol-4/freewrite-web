# Production deployment

CI owns production releases: all checks and both browser suites → production
build → pending Supabase migrations → MCP database check → Vercel deployment.
Pull requests only use disposable databases. Releases run serially and are not
automatically cancelled by newer pushes. A failed step stops the release.

## One-time setup

In GitHub repository **Settings → Environments**, create `production` and restrict
deployment branches to `main`. Add these environment secrets:

| Secret | Value |
| --- | --- |
| `VERCEL_TOKEN` | Vercel account token with access to the project's team |
| `SUPABASE_ACCESS_TOKEN` | Supabase account access token with access to the project |
| `SUPABASE_DB_PASSWORD` | The Supabase project's database password (not an API key) |

Add these environment variables in the same GitHub environment:

| Variable | Current project value |
| --- | --- |
| `VERCEL_ORG_ID` | `team_AfeU1RcyaZjIbM0t8qZJGJnf` |
| `VERCEL_PROJECT_ID` | `prj_jeZBTojhVIKf7yjlgiQRsVcJ5BIs` |
| `SUPABASE_PROJECT_REF` | `fnfdfnwkcdpdxifagngw` |

In Vercel's `freewrite-web` project, configure the **Production** environment
variables listed in [.env.example](../.env.example), using production values.
`APP_ALLOWED_ORIGINS` is optional; omit it unless you have additional trusted
origins. Keep `MCP_KEY_ENCRYPTION_SECRET` stable across deployments. The Supabase
service credential and MCP encryption secret belong in Vercel, not in public
variables or the repository. CI pulls this configuration for its production build.
Set the project's Node.js version to **22.x**, matching CI.

`vercel.json` disables automatic Git deployments; leave that setting in place.
GitHub Actions deploys through the Vercel CLI instead. No Git disconnect is needed.
Remove any external deploy hooks or automation that independently deploys this
project. Do not require the old Vercel Git deployment status for merging PRs;
require the existing GitHub **CI / test** check instead.

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

The release's database check verifies MCP table/RPC access without creating users,
reading notes, or rotating keys. After deployment, open `/connect` while signed in
to confirm the complete account flow.

References: [Vercel GitHub Actions](https://vercel.com/kb/guide/how-can-i-use-github-actions-with-vercel),
[Vercel Git deployment configuration](https://vercel.com/docs/project-configuration/git-configuration),
[Supabase deployment environments](https://supabase.com/docs/guides/deployment/managing-environments).
