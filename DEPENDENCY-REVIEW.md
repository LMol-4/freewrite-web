# Dependency review — 2026-10-07

Registry audit of the original lockfile reported 22 findings: three critical,
13 high and six moderate. Updated within the existing major versions, including
Next/eslint-config-next 16.3.6, Vitest 4.1.11, Supabase SSR 0.12.7/JS 2.117.2,
idb 8.0.4 and Playwright 1.63.0, with compatible transitive refreshes.
React stays 19.2.4; pnpm stays pinned at 11.10.0. No runtime library was added.

Next's [Windows server advisory](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36)
affects this development host, and the patched release also includes the
[ImageResponse fix](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j).
The app does not currently use ImageResponse. Do not infer that every audited
dependency vulnerability is reachable from journal input.

`pnpm audit --prod` reports zero findings. The full audit reports **one high finding**, in development tooling:
`eslint-config-next -> @next/eslint-plugin-next -> fast-glob -> micromatch -> braces@3.0.3`.
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
describes stack exhaustion on deeply nested brace patterns. No application input
is routed to this lint glob parser. Treat untrusted repository/tool configuration
as capable of failing lint; CI already has a timeout and no hosted credentials.

The registry audit suggested >=3.0.4, but installing that exact version returned
`ERR_PNPM_NO_MATCHING_VERSION`; the published advisory lists no patched version.
The attempted override was removed. Do not suppress the finding, claim a clean
full audit, or force a major tooling change. Recheck upstream before release;
this remains an explicit release risk requiring review. ESLint 9 also carries
an upstream unsupported-version warning; plan its major upgrade separately.

Audit results are time-dependent. Repeat `pnpm audit` and `pnpm audit --prod`
before release. Local raw reports live in ignored `.local-test/`; they are not
an ongoing security guarantee. Browser/production build acceptance is recorded
in the local progress log. No remote CI run or deployed audit is implied.
