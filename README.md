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
Copy [.env.example](.env.example) to `.env.local` and fill in your local configuration.
For hosting, apply the Supabase migrations and set the same environment variables.

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

Open the plug icon to connect agents with read-only access to synced notes.
Your API key is created automatically and can be revealed, copied, or rotated.

## Future implementations

- Full OAuth implementation.
- An option to disable backspace while writing.

## Credits

Based on [the original Freewrite](https://freewrite.io/) and its
[Windows port](https://kaitodev.com/freewrite/).
