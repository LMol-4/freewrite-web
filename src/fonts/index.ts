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
  src: [
    { path: "./Lato-Regular.woff2", weight: "400", style: "normal" },
    { path: "./Lato-Black.woff2", weight: "900", style: "normal" },
  ],
  variable: "--font-lato",
  display: "swap",
  preload: true,
});

export const notoSerifKannada = localFont({
  src: "./NotoSerifKannada-Regular.woff2",
  variable: "--font-noto-serif-kannada",
  display: "swap",
  preload: false,
  // The latin subset retains Kannada's very deep descent (71% em). Normalize
  // line metrics to Lato after the editor's x-height adjustment (.5065/.547).
  declarations: [
    { prop: "ascent-override", value: "106.592%" },
    { prop: "descent-override", value: "23.003%" },
    { prop: "line-gap-override", value: "0%" },
  ],
});

export const ebGaramond = localFont({
  src: "./EBGaramond-Regular.woff2",
  variable: "--font-eb-garamond",
  display: "swap",
  preload: false,
  declarations: [
    { prop: "ascent-override", value: "77.947%" },
    { prop: "descent-override", value: "16.821%" },
    { prop: "line-gap-override", value: "0%" },
  ],
});

export const libreBaskerville = localFont({
  src: "./LibreBaskerville-Regular.woff2",
  variable: "--font-libre-baskerville",
  display: "swap",
  preload: false,
  declarations: [
    { prop: "ascent-override", value: "103.281%" },
    { prop: "descent-override", value: "22.288%" },
    { prop: "line-gap-override", value: "0%" },
  ],
});
