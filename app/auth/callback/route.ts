import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { appOrigin, callbackPath } from "@/src/lib/auth/validation";
import type { Database } from "@/src/lib/supabase/database.types";
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  let origin: string;
  try { appOrigin(url.origin); origin = appOrigin(); } catch { return new NextResponse("Invalid callback origin", { status: 400 }); }
  let response = NextResponse.redirect(new URL("/auth/error", origin));
  const client = createServerClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookies, headers) {
        cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });
  const code = url.searchParams.get("code");
  if (code && code.length < 4096) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) {
      const redirect = NextResponse.redirect(new URL(callbackPath(url.searchParams.get("next")), origin));
      response.cookies.getAll().forEach(cookie => redirect.cookies.set(cookie));
      response = redirect;
    }
  }
  response.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate, max-age=0");
  response.headers.set("Pragma", "no-cache"); response.headers.set("Expires", "0");
  return response;
}
