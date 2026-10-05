// The typefaces an invoice-template element can be set to.
//
// Every family is self-hosted by next/font (loaded once in app/layout.tsx, see
// app/fonts.ts) and referenced here through its CSS variable, never by its real
// family name: next/font rewrites the family to a hashed name, so only the
// variable resolves. Self-hosting also matters for the paper export —
// html-to-image inlines @font-face rules from same-origin stylesheets, so a
// Google-hosted <link> could come back without the font.
//
// Khmer families list Fira Sans after themselves: a Khmer-subset file carries no
// Latin glyphs, so numbers and English words fall through to the sheet font
// instead of a random system face.

export interface InvoiceFont {
  key: string;
  label: string;
  stack: string;
}

const SANS = "var(--font-fira-sans), system-ui, sans-serif";
const KHMER_FALLBACK = "var(--font-fira-sans), system-ui, sans-serif";

export const INVOICE_FONTS: InvoiceFont[] = [
  { key: "default", label: "Sheet default (Fira Sans)", stack: SANS },
  { key: "fira-code", label: "Fira Code (mono)", stack: "var(--font-fira-code), ui-monospace, monospace" },
  { key: "playfair", label: "Playfair Display (serif)", stack: "var(--font-playfair), Georgia, serif" },
  { key: "lora", label: "Lora (serif)", stack: "var(--font-lora), Georgia, serif" },
  { key: "noto-khmer", label: "Noto Sans Khmer", stack: `var(--font-noto-khmer), ${KHMER_FALLBACK}` },
  { key: "battambang", label: "Battambang (Khmer)", stack: `var(--font-battambang), ${KHMER_FALLBACK}` },
  { key: "hanuman", label: "Hanuman (Khmer)", stack: `var(--font-hanuman), ${KHMER_FALLBACK}` },
  { key: "kantumruy", label: "Kantumruy Pro (Khmer)", stack: `var(--font-kantumruy), ${KHMER_FALLBACK}` },
  { key: "moul", label: "Moul (Khmer display)", stack: `var(--font-moul), ${KHMER_FALLBACK}` },
];

// Resolve an element's stored font key to a CSS font-family stack. An unknown
// or missing key falls back to the sheet font, so a template saved before a
// family was removed still renders.
export const fontStack = (key?: string): string =>
  INVOICE_FONTS.find((f) => f.key === key)?.stack ?? INVOICE_FONTS[0].stack;
