# Freewrite Web

A browser freewriting editor with email/password accounts, immediate device-local saving,
cloud-synced entries and theme/font preferences. Cloud publication uses immutable Markdown
revisions, conditional server versions and replayable mutation receipts. History and recovery
browsing are the next milestone; recovery records are currently verified programmatically.

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
node scripts/local-test.mjs upgrade-check
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
- IndexedDB v3 partitions entries, pending generations, attempted mutations, cleanup work and
  preferences by account. It preserves existing v2 account data. Version 1
  ownerless records move unchanged to `legacy`; their count is shown, but their content is
  neither displayed nor assigned to the next user. Ownership/import needs an explicit decision.
- One tab coordinates writing through Web Locks and a transaction-checked token. Without
  Web Locks, a fenced 15-second IndexedDB lease keeps other tabs read-only. After a fallback
  writer closes/crashes, wait for its lease to expire and reload the other tab. Stale writers
  cannot overwrite a newer generation. Generation conflicts preserve a separate local copy.
- Sign-out first quiesces writing and flushes entries/preferences. Failed/offline sync defaults
  to Cancel for unsynced work. Explicit discard clears only the authorized
  account, after successful auth removal. The installed Supabase SDK can remove the browser
  session even when remote logout fails; in that case drafts are retained for reauthentication.
  Interrupted/failed cleanup remains locked and can be retried. No other device is signed out.
- Preferences persist field patches before remote send, use server versions, and retry on
  startup/focus/reconnect/backoff. A server account guard rejects stale-account publication.
  The optional pre-paint theme cache contains no journal text and is scoped to its active account.
- Cloud writes run after two idle seconds or fifteen seconds of continuous input, plus focus,
  reconnect and explicit **Sync now / Ctrl+S / Cmd+S**. Failures retain durable work; retries use
  backoff and honor server Retry-After. Authentication and permission failures remain visible.
- Each attempted mutation keeps the same ID, immutable object path, exact bytes and base version
  through retries. Later typing remains a successor. A conflict preserves the latest local text
  as a separate read-only recovered entry; it never overwrites the winning body's object.
- Metadata is paged by date and ID, including tombstones. Missing list rows never delete local
  writing. Bodies download lazily; an unavailable body is not an empty note. A clean focus refresh
  adopts a downloaded revision only if no local edit intervened. Dirty base versions stay unchanged.
- Conditional deletion and durable object cleanup exist in storage for M5's delete UI. A stale
  delete requires a new decision. Removal failures remain pending. Recovered entries have separate
  IDs/objects and survive deletion of their original. Unsent blank scratch entries stay local.
- “Synced” requires acknowledged entry and preference work; it is not shown for a newer local
  transaction. Page termination delivery is not relied upon; there is no keepalive transport.
- Offline reload/install support is a later milestone. An open editor can retain local work;
  a cold offline launch is not promised. Reload starts a new timer; a large forward wall-clock
  change may complete it. Fractional pauses and backward changes do not grant extra time.

## Migrations and release gates

The four historical migrations remain unchanged. Forward migrations add preference versions,
immutable entry metadata and retained mutation receipts, and restrict direct mutation grants.
The obsolete `save_entry_meta` function and Storage UPDATE policy are removed. New publication
uses `publish_entry`; legacy `{user}/{entry}.md` objects remain readable. Existing rows are retained;
new constraints are enforced on writes without assuming historical data is already valid.
Regenerate types with `node scripts/local-test.mjs types` (UTF-8 output). The target-checked
`upgrade-check` resets only the disposable stack to the M3 schema, creates a legacy fixture,
applies forward migrations and asserts its body, metadata and preferences survive. `migrate`
applies pending forward migrations to that disposable stack without resetting it.
Test both clean replay and upgrade with representative old data before any separately
authorized hosted migration. Do not use `db push` as part of automated tests.

Superseded immutable objects, ambiguous orphan uploads and mutation receipts are retained in v1.
There is no automatic garbage collector or user-facing version history. Review storage growth
before release. A client digest detects corrupt downloads/retries; it is not server verification
of client-supplied body metadata. No backup or erasure guarantee is implied.

Hosted confirmation/password settings, callback allowlists and real email delivery still
require manual verification (MAN-5/6/7). Real hardware checks have not been replaced by
WebKit/Chromium emulation. M4's real two-device conflict and airplane-mode reconnect checks
(MAN-8/9) remain pending; cold offline launch belongs to M7. Before production release, configure Vercel Deployment Checks
to require GitHub's **CI / test** check and verify failing/pending checks block production
promotion (MAN-15). That setting is still pending; the workflow alone does not configure it.
No hosted settings, deployment, or Git push is authorized by these local test commands.
