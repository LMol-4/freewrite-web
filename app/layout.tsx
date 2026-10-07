import type { Metadata, Viewport } from "next";

import { lato, notoSerifKannada, ebGaramond, libreBaskerville } from "@/src/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Freewrite",
  description: "A distraction-free freewriting app",
  appleWebApp: { capable: true, title: "Freewrite", statusBarStyle: "default" },
  icons: { apple: "/icons/icon-180.v1.png" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#ffffff" };

// §9 Theming: applies `data-theme` before first paint so a dark-mode user
// never sees a white flash. `beforeInteractive` runs this in <head>, before
// hydration. The `freewrite:prefs` key and its shape are duplicated from
// `usePreferences` on purpose — this has to run standalone, before any
// bundle loads.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var raw = localStorage.getItem("freewrite:active-theme");
    var theme = "light";
    if (raw) {
      var parsed = JSON.parse(raw);
      if (parsed && (parsed.theme === "light" || parsed.theme === "dark")) {
        theme = parsed.theme;
      }
    }
    document.documentElement.setAttribute("data-theme", theme);
    var color = document.querySelector('meta[name="theme-color"]');
    if (color) color.setAttribute("content", theme === "dark" ? "#1e1e1e" : "#ffffff");
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "light");
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="light"
      suppressHydrationWarning
      className={`${lato.variable} ${notoSerifKannada.variable} ${ebGaramond.variable} ${libreBaskerville.variable}`}
    >
      <head><script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} /></head>
      <body>
        {children}
      </body>
    </html>
  );
}
