import { afterEach, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const script = resolve("scripts/build-worker.mjs");
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture(adapter: boolean, staticShell = false) {
  const root = mkdtempSync(join(tmpdir(), "freewrite-worker-"));
  roots.push(root);
  const put = (path: string, content: string) => {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  };
  const html = '<html>Checking local access</html>';
  const shell = adapter
    ? `.next/output/${staticShell ? "static/offline.html" : "functions/offline.prerender-fallback.html"}`
    : ".next/server/app/offline.html";
  put(shell, html);
  put(`${adapter ? ".next/output/static/_next" : ".next"}/static/chunks/app.js`, "app");
  put(".next/BUILD_ID", "test-build");
  put("public/icons/icon.png", "icon");
  put("public/sounds/click.wav", "sound");
  put("src/pwa/worker.js", "// worker source");
  if (adapter) {
    put(".next/output/config.json", '{"version":3}');
    put(".next/output/static/sw.js", "stale worker copied by adapter");
    // Never use stale local output when deployable adapter output is present.
    put(".next/server/app/offline.html", "stale shell");
    put(".next/static/chunks/stale.js", "stale chunk");
  }
  return { root, put, html, shell, run: () => spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" }) };
}

it.each(["local", "adapter prerender", "adapter static"])("builds the worker from %s output", mode => {
  const adapter = mode !== "local";
  const f = fixture(adapter, mode === "adapter static");
  const result = f.run();
  expect(result.status, result.stderr).toBe(0);
  const worker = readFileSync(join(f.root, "public/sw.js"), "utf8");
  expect(worker).toContain(createHash("sha256").update(f.html).digest("hex"));
  expect(worker).toContain('/_next/static/chunks/app.js');
  expect(worker).not.toContain("stale");
  if (adapter) expect(readFileSync(join(f.root, ".next/output/static/sw.js"), "utf8")).toBe(worker);
});

it("rejects a non-neutral adapter shell instead of publishing a worker", () => {
  const f = fixture(true);
  f.put(f.shell, '<html>Checking local access {"userId":"private"}</html>');
  const result = f.run();
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("Expected a neutral prerendered offline shell");
  expect(readFileSync(join(f.root, ".next/output/static/sw.js"), "utf8")).toBe("stale worker copied by adapter");
});
