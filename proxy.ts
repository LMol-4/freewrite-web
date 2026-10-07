import type { NextProxy } from "next/server";

import { updateSession } from "@/src/lib/supabase/session";

// See §8: this refreshes the Supabase session on every matched request and
// redirects unauthenticated users away from `/`. RLS is the real boundary
// (§6) — this is UX, not security.
export const proxy: NextProxy = (request) => updateSession(request);

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons|sounds|sw.js|manifest.webmanifest|offline).*)",
  ],
};
