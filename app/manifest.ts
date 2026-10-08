import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return { id: "/", name: "freewrite", short_name: "freewrite", description: "a distraction-free freewriting app", start_url: "/", scope: "/", display: "standalone", background_color: "#ffffff", theme_color: "#ffffff",
    icons: [
      { src: "/icons/icon-192.v1.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.v1.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.v1.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ] };
}
