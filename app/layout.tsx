import type { Metadata } from "next";
import { lato, notoSerifKannada, ebGaramond, libreBaskerville } from "@/src/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Freewrite",
  description: "A distraction-free freewriting app",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="light"
      className={`${lato.variable} ${notoSerifKannada.variable} ${ebGaramond.variable} ${libreBaskerville.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
