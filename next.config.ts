import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: { "/docs/mcp-setup.md": ["./src/mcp/setup.md"] },
  async headers() {
    return [
      {
        // public/ files aren't content-hashed, so they're version-stamped by
        // hand (click.v1.wav, icon-192.v1.png, ...) and cached immutably (§22).
        source: "/:path(sounds|icons)/:file*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        // Never cache the service worker itself, or a broken one is unfixable.
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
