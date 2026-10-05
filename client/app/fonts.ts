import {
  Fira_Sans,
  Fira_Code,
  Playfair_Display,
  Lora,
  Noto_Sans_Khmer,
  Battambang,
  Hanuman,
  Kantumruy_Pro,
  Moul,
} from "next/font/google";

// Every typeface the app can print with, self-hosted by next/font. The app UI
// uses Fira Sans + Fira Code; the rest exist only so an invoice template can be
// set to them (see lib/invoice-fonts.ts) and are therefore NOT preloaded — the
// browser fetches one only when a sheet actually references its variable.
//
// next/font calls take LITERAL object arguments: a shared `...options` spread
// is a build error ("Unexpected spread"), so the optional families repeat
// display/preload by hand.

export const firaSans = Fira_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-fira-sans",
});

export const firaCode = Fira_Code({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-fira-code",
});

const playfair = Playfair_Display({
  subsets: ["latin"], variable: "--font-playfair", display: "swap", preload: false,
});
const lora = Lora({
  subsets: ["latin"], variable: "--font-lora", display: "swap", preload: false,
});
const notoKhmer = Noto_Sans_Khmer({
  subsets: ["khmer"], variable: "--font-noto-khmer", display: "swap", preload: false,
});
const battambang = Battambang({
  subsets: ["khmer"], weight: ["300", "400", "700", "900"],
  variable: "--font-battambang", display: "swap", preload: false,
});
const hanuman = Hanuman({
  subsets: ["khmer"], weight: ["300", "400", "700", "900"],
  variable: "--font-hanuman", display: "swap", preload: false,
});
// Also the app UI's Khmer face: Fira Sans has no Khmer glyphs, so the font
// stack falls through to Kantumruy for them (globals.css --font-sans).
const kantumruy = Kantumruy_Pro({
  subsets: ["khmer"], variable: "--font-kantumruy", display: "swap",
});
const moul = Moul({
  subsets: ["khmer"], weight: ["400"], variable: "--font-moul", display: "swap", preload: false,
});

// One className for <body>: declares every font variable so any sheet can use
// any family without the page that renders it having to know which.
export const fontVariables = [
  firaSans.variable, firaCode.variable, playfair.variable, lora.variable,
  notoKhmer.variable, battambang.variable, hanuman.variable, kantumruy.variable, moul.variable,
].join(" ");
