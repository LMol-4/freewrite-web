# Freewrite Web

A simple, open-source, web-native version of
[Freewrite by Farza](https://github.com/farzaa/freewrite). This fork brings the
original distraction-free writing experience to your browser.

## Usage

1. Create an account or sign in.
2. Pick something to write about.
3. Start the timer and keep writing. Let your mind wander.

Your writing saves on this device and syncs to your account. Choose your font,
switch themes, or go fullscreen. Once prepared, the app can reopen offline too.

## Development

Use Node 22, pnpm 11.10.0, and a local Supabase stack (Docker required).
Copy `.env.example` to `.env.local` and fill in your local configuration.

```sh
pnpm install --frozen-lockfile
supabase start
pnpm dev
```

```sh
pnpm test
pnpm lint
pnpm build
```

## MCP connector

Open the plug icon in the writer (or the mobile menu) to connect an agent.
Generate one read-only API key, reveal or copy it later, and rotate it whenever
needed. Rotation invalidates the previous key for subsequent requests, so update
each connected agent. The setup prompt contains instructions, never your key.

The remote endpoint is `/mcp` (Streamable HTTP with an Authorization bearer header).
It exposes `list_notes` and `get_notes` for synced notes, including marked recovered
copies. Deleted notes are excluded. Lists are paginated; long notes have
continuation cursors. No search or write tools are exposed.

### Server configuration

Apply the Supabase migrations, including `20261008120000_mcp_keys.sql`, and configure:

- `APP_ORIGIN`: the canonical application origin, such as https://freewrite.example.
  It also populates the setup prompt and dynamically served Markdown at
  `/docs/mcp-setup.md`.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only Supabase credential. The MCP backend
  uses explicit account filters for every metadata read and validates Storage
  paths against that account. Never expose this credential to browsers or agents.
- `MCP_KEY_ENCRYPTION_SECRET`: 32 random bytes encoded as 64 hex characters.
  Generate with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
  Keep it stable and backed up across deployments. Changing it prevents revealing
  existing keys until the affected users rotate their keys.

API keys are random, stored encrypted with AES-256-GCM, and authenticated using a
SHA-256 hash. Key management requires the owner's browser session; key rows and
credential RPCs are not accessible to browser Supabase clients. Authentication
and the 120-request-per-minute limit are checked in the database on every MCP
request. The server never accepts the MCP key as a Supabase login credential.

The connector works with clients supporting custom bearer headers, such as local
coding agents. It does not provide OAuth or ChatGPT web setup. The Markdown
template lives in `src/mcp/setup.md` and is included in the deployment automatically.

### MCP verification

`pnpm test` includes protocol interoperability with the official MCP SDK client.
For database, ownership, rotation, and browser checks, use the disposable harness:

~~~sh
node scripts/local-test.mjs prepare
node scripts/local-test.mjs start
node scripts/local-test.mjs migrate
node scripts/local-test.mjs build
node scripts/local-test.mjs test e2e/mcp.spec.ts
~~~

The harness creates a separate local encryption secret and uses only the verified
disposable backend. It does not apply migrations to a hosted project.

## Future implementations

- Full OAuth implementation.
- An option to disable backspace while writing.

## Credits

Based on [the original Freewrite](https://freewrite.io/) and its
[Windows port](https://kaitodev.com/freewrite/).
