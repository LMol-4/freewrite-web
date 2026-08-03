import localFont from "next/font/local";

/**
 * D5: self-hosted webfonts for the "Random" pool entries that aren't safe
 * system fonts on Android/iOS. Files come from `scripts/fetch-fonts.sh`
 * (Google Fonts `latin` subsets) and are never in `public/` — `next/font/local`
 * emits them under `/_next/static/media/` with a content hash and immutable
 * caching (§22).
 *
 * Only Lato is preloaded, since it's the default font (D7); the rest only
 * load if "Random" happens to pick them.
 */

export const lato = localFont({
  src: "./Lato-Regular.woff2",
  variable: "--font-lato",
  display: "swap",
  preload: true,
});

export const notoSerifKannada = localFont({
  src: "./NotoSerifKannada-Regular.woff2",
  variable: "--font-noto-serif-kannada",
  display: "swap",
  preload: false,
});

export const ebGaramond = localFont({
  src: "./EBGaramond-Regular.woff2",
  variable: "--font-eb-garamond",
  display: "swap",
  preload: false,
});

export const libreBaskerville = localFont({
  src: "./LibreBaskerville-Regular.woff2",
  variable: "--font-libre-baskerville",
  display: "swap",
  preload: false,
});
