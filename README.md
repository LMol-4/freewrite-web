# Freewrite Web

A browser freewriting editor with email/password accounts, immediate device-local saving,
and synced theme/font preferences. **Entry cloud sync is not implemented yet (M4).**
Nonempty writing therefore requires an explicit discard confirmation before sign-out.

## Development

Use Node 22 (verified locally with 22.17.1), the pinned **pnpm 11.10.0**, Docker Desktop
with Linux containers, and Supabase CLI **2.75.0**. Install from the existing lockfile:

```sh
corepack pnpm install --frozen-lockfile
```

If the global pnpm shim is broken on Windows, `corepack pnpm` still selects the version
from `packageManager`. Ensure your selected Node installation is on PATH. The PowerShell
commands below are also valid in a Unix shell; no global configuration change is required.

Copy `.env.example` to `.env.local`, supply your local stack's public key, and set
`APP_ORIGIN` to the exact app origin. `APP_ALLOWED_ORIGINS` is a comma-separated list of
additional owned origins; no wildcard or arbitrary request Origin is accepted. Production
must use HTTPS. Never configure a hosted journal project for automated testing.

```sh
supabase start
corepack pnpm dev
```

The ordinary local stack uses ports 54320–54329. Its configuration requires confirmed
email and passwords of at least eight characters. The local mail catcher is on port 54324.
Local configuration does **not** change hosted auth settings.

## Isolated automated verification

The harness creates the separate, unlinked `freewrite-web-disposable` project under
ignored `.local-test/`, on ports **55320–55329**. It verifies project/container identity
and loopback endpoints before reset or privileged fixture operations. It preserves
ordinary local and hosted projects. Optional analytics/studio/edge services are excluded.

```sh
corepack pnpm exec tsc --noEmit
corepack pnpm lint
corepack pnpm exec vitest run
node scripts/local-test.mjs prepare
node scripts/local-test.mjs start
node scripts/local-test.mjs reset
node scripts/local-test.mjs build
corepack pnpm exec playwright install chromium webkit
node scripts/local-test.mjs test
node scripts/local-test.mjs stop
```

On Linux, install browser system libraries with
`corepack pnpm exec playwright install --with-deps chromium webkit`.

`reset` only resets the verified disposable stack, never `--linked`. `stop` retains its
volumes. Build and test explicitly override `.env.local` with loopback values. A build-ID
stamp prevents tests using an unrelated/stale-backend production build. Existing app
servers are never reused. Local administrative credentials remain in ignored test state,
are excluded from the application build/server environment, and are not browser public vars.

Each browser test creates unique accounts and tears them down, removing fixture objects
first. RLS tests use user JWTs, not admin access. Separate confirmation/recovery tests use
actual local mail links, including expiry/reuse. Failed traces are under `test-results/`
and `playwright-report/`; they contain disposable fixture data and must not be committed.
CI's `test` job runs the same local stack, migrations, build, Chromium/WebKit and trace upload.
No deployment or push job is included.

## Persistence and sign-out

- Every input requests a serialized IndexedDB transaction. “Saved on this device” means
  the current local transaction completed; it never means the writing is cloud-synced.
- A failed save leaves the buffer visible with a retry action. Copy unsaved text before
  leaving if storage continues to fail. Browser storage can be evicted or cleared; it is
  not a backup or a guarantee against device/OS failure.
- IndexedDB v2 partitions entries, pending generations and preferences by account. Version 1
  ownerless records move unchanged to `legacy`; their count is shown, but their content is
  neither displayed nor assigned to the next user. Ownership/import needs an explicit decision.
- One tab coordinates writing through Web Locks and a transaction-checked token. Without
  Web Locks, a fenced 15-second IndexedDB lease keeps other tabs read-only. After a fallback
  writer closes/crashes, wait for its lease to expire and reload the other tab. Stale writers
  cannot overwrite a newer generation. Generation conflicts preserve a separate local copy.
- Sign-out defaults to Cancel for unsynced work. Explicit discard clears only the authorized
  account, after successful auth removal. The installed Supabase SDK can remove the browser
  session even when remote logout fails; in that case drafts are retained for reauthentication.
  Interrupted/failed cleanup remains locked and can be retried. No other device is signed out.
- Preferences persist field patches before remote send, use server versions, and retry on
  startup/focus/reconnect/backoff. A server account guard rejects stale-account publication.
  The optional pre-paint theme cache contains no journal text and is scoped to its active account.
- Offline reload/install support is a later milestone. An open editor can retain local work;
  a cold offline launch is not promised. Reload starts a new timer; a large forward wall-clock
  change may complete it. Fractional pauses and backward changes do not grant extra time.

## Migrations and release gates

The four historical migrations remain unchanged. New preference migrations add/backfill
server versions, restrict mutation grants and publish conditional account-bound field patches.
Regenerate types from the disposable migrated schema with
`supabase gen types typescript --local --workdir .local-test` (UTF-8 output).
Test both clean replay and upgrade with representative old data before any separately
authorized hosted migration. Do not use `db push` as part of automated tests.

Hosted confirmation/password settings, callback allowlists and real email delivery still
require manual verification (MAN-5/6/7). Real hardware checks have not been replaced by
WebKit/Chromium emulation. Before production release, configure Vercel Deployment Checks
to require GitHub's **CI / test** check and verify failing/pending checks block production
promotion (MAN-15). That setting is still pending; the workflow alone does not configure it.
No hosted settings, deployment, or Git push is authorized by these local test commands.
