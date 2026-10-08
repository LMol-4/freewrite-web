import type { NextProxy } from "next/server";

import { updateSession } from "@/src/lib/supabase/session";

// Refresh the session; the home page chooses the landing page or writer.
// RLS remains the data security boundary.
export const proxy: NextProxy = (request) => updateSession(request);

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons|sounds|sw.js|manifest.webmanifest|offline).*)",
  ],
};
