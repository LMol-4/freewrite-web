import { authenticateKey } from "@/src/mcp/backend";
import { handleMcp } from "@/src/mcp/protocol";
import { noteRepository } from "@/src/mcp/repository";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export function POST(request: Request) { return handleMcp(request, authenticateKey, noteRepository); }
export const GET = POST;
export const DELETE = POST;
