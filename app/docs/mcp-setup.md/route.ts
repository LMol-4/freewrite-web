import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { appOrigin } from "@/src/lib/auth/validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const template = await readFile(join(process.cwd(), "src/mcp/setup.md"), "utf8");
  return new Response(template.replaceAll("{{APP_ORIGIN}}", appOrigin()), {
    headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
