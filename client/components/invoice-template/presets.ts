import type { TemplateElement } from "./types";

// Built-in starting templates. The user picks one in Settings; it is saved as a
// real template row they can then freely edit on the canvas. Coordinates are in
// the 794 x 1123 A4 space. Brand navy #304A59 + orange #FFA040 accents (the app
// brand), replacing the reference's green while keeping its clean content layout.

const NAVY = "#304A59";
const INK = "#142332";
const MUTE = "#5b6b7a";

let seq = 0;
const el = (e: Omit<TemplateElement, "id">): TemplateElement => ({ id: `e${++seq}`, ...e });

// "Modern" — the clean Billed To / Amount Due layout from the owner's reference,
// with a proper logo + business header.
export const modernPreset = (): TemplateElement[] => {
  seq = 0;
  return [
    // Header band
    el({ kind: "logo", x: 48, y: 44, w: 54, h: 54 }),
    el({ kind: "field", binding: "business_name", label: "", x: 112, y: 46, w: 320, h: 26, fontSize: 19, fontWeight: 700, color: NAVY, align: "left" }),
    el({ kind: "field", binding: "business_phone", label: "", x: 112, y: 74, w: 320, h: 16, fontSize: 11, color: MUTE, align: "left" }),
    el({ kind: "field", binding: "business_address", label: "", x: 112, y: 90, w: 320, h: 16, fontSize: 11, color: MUTE, align: "left" }),
    el({ kind: "text", text: "INVOICE", x: 500, y: 48, w: 246, h: 36, fontSize: 30, fontWeight: 700, color: NAVY, align: "right" }),
    el({ kind: "line", x: 48, y: 122, w: 698, h: 0, color: "#e0e6ea" }),

    // Info row
    el({ kind: "field", binding: "client_name", label: "Billed To", x: 48, y: 156, w: 210, h: 52, fontSize: 15, fontWeight: 600, color: INK, align: "left" }),
    el({ kind: "field", binding: "issue_date", label: "Date of Issue", x: 280, y: 156, w: 150, h: 44, fontSize: 13, color: INK, align: "left" }),
    el({ kind: "field", binding: "due_date", label: "Due Date", x: 280, y: 214, w: 150, h: 44, fontSize: 13, color: INK, align: "left" }),
    el({ kind: "field", binding: "invoice_number", label: "Invoice Number", x: 440, y: 156, w: 130, h: 44, fontSize: 13, color: INK, align: "right" }),
    el({ kind: "field", binding: "amount_due", label: "Amount Due (USD)", x: 578, y: 156, w: 168, h: 64, fontSize: 26, fontWeight: 700, color: INK, align: "right" }),

    // Items + totals
    el({ kind: "items", x: 48, y: 300, w: 698, h: 320, fontSize: 13, color: INK }),
    el({ kind: "totals", x: 446, y: 660, w: 300, h: 120, fontSize: 13, color: INK }),

    // Payment QR + footer
    el({ kind: "qr", x: 566, y: 820, w: 150, h: 186 }),
    el({ kind: "text", text: "Thank you for your business.", x: 48, y: 1046, w: 420, h: 24, fontSize: 12, color: MUTE, align: "left" }),
  ];
};

// "Minimal" — a compact, single-accent layout.
export const minimalPreset = (): TemplateElement[] => {
  seq = 0;
  return [
    el({ kind: "field", binding: "business_name", label: "", x: 48, y: 52, w: 400, h: 30, fontSize: 22, fontWeight: 700, color: INK, align: "left" }),
    el({ kind: "text", text: "INVOICE", x: 446, y: 56, w: 300, h: 26, fontSize: 20, fontWeight: 600, color: MUTE, align: "right" }),
    el({ kind: "field", binding: "invoice_number", label: "Invoice", x: 446, y: 92, w: 300, h: 40, fontSize: 13, color: INK, align: "right" }),
    el({ kind: "line", x: 48, y: 150, w: 698, h: 0, color: "#e0e6ea" }),

    el({ kind: "field", binding: "client_name", label: "Billed To", x: 48, y: 180, w: 300, h: 50, fontSize: 15, fontWeight: 600, color: INK, align: "left" }),
    el({ kind: "field", binding: "issue_date", label: "Date", x: 446, y: 180, w: 300, h: 44, fontSize: 13, color: INK, align: "right" }),

    el({ kind: "items", x: 48, y: 280, w: 698, h: 340, fontSize: 13, color: INK }),
    el({ kind: "totals", x: 446, y: 660, w: 300, h: 120, fontSize: 13, color: INK }),
    el({ kind: "qr", x: 566, y: 820, w: 150, h: 186 }),
  ];
};

export const PRESETS: { key: string; name: string; build: () => TemplateElement[] }[] = [
  { key: "modern", name: "Modern", build: modernPreset },
  { key: "minimal", name: "Minimal", build: minimalPreset },
];
