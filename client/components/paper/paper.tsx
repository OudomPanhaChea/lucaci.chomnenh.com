"use client";
import type { Settings } from "@/lib/types";

// Shared building blocks for the downloadable A4 papers (bonus award, owing
// statement). Deliberately minimal, they are handed to customers: white sheet,
// hairline rules, brand navy #304A59 for headings and totals, a single thin
// #FFA040 accent. Hex is hardcoded so the exported JPG looks identical
// whatever theme the app is in.

export const paperSlug = (name: string) =>
  name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "client";

// A4 portrait frame: 794 x 1123 css px at 96dpi (grows taller if needed).
// data-paper-page marks the exportable node: PaperModal downloads one JPG per
// sheet, and the shadow lives on a wrapper so it never bleeds into the export.
export function PaperSheet({ children }: { children: React.ReactNode }) {
  return (
    <div className="shadow-lg">
      <div
        data-paper-page
        className="flex min-h-[1123px] w-[794px] flex-col bg-white px-14 pb-10 pt-12 text-[#142332]"
      >
        {children}
      </div>
    </div>
  );
}

// Slim header for continuation sheets (page 2+) of a multi-page paper
export function PaperContinuation({
  title,
  subtitle,
  page,
  pages,
}: {
  title: string;
  subtitle?: string;
  page: number;
  pages: number;
}) {
  return (
    <>
      <div className="flex items-baseline justify-end gap-6">
        <p className="text-xs text-[#5b6b7a]">
          {subtitle ? `${subtitle} · ` : ""}Page {page} of {pages}
        </p>
      </div>
    </>
  );
}

// Business identity left, document title + ref/date right, orange+navy rule
export function PaperHeader({
  settings,
  title,
  refText,
  issuedText,
}: {
  settings: Settings | null;
  title: string;
  refText?: string;
  issuedText?: string;
}) {
  return (
    <>
      <div className="flex items-start justify-between gap-6">
        <div className="flex items-center gap-3.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={settings?.logo_url || "/images/chomnenh-mark.png"}
            alt=""
            className="h-12 w-12 rounded-lg object-cover"
          />
          <div>
            <p className="text-lg font-bold leading-tight text-[#304A59]">
              {settings?.business_name || "Chomnenh"}
            </p>
            {settings?.phone && (
              <p className="mt-0.5 text-xs text-[#5b6b7a]">Tel: {settings.phone}</p>
            )}
            {settings?.address && (
              <p className="text-xs text-[#5b6b7a]">{settings.address}</p>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold tracking-[0.08em] text-[#304A59]">{title}</p>
          {refText && <p className="mt-1 text-xs text-[#5b6b7a]">{refText}</p>}
          {issuedText && <p className="text-xs text-[#5b6b7a]">{issuedText}</p>}
        </div>
      </div>
    </>
  );
}

// Two signature lines pinned to the bottom of the sheet (with PaperFooter)
export function PaperSignatures({
  left,
  right,
}: {
  left: { name: string; label: string };
  right: { name: string; label: string };
}) {
  return (
    <div className="grid grid-cols-2 gap-16">
      {[left, right].map((s) => (
        <div key={s.label} className="text-center">
          <div className="h-12 border-b border-[#8a97a3]" />
          <p className="mt-2 text-xs font-medium">{s.name}</p>
          <p className="text-[11px] text-[#8a97a3]">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

export function PaperFooter({ settings }: { settings: Settings | null }) {
  return (
    <div className="mt-9 flex items-center justify-between border-t border-[#e6ebee] pt-4 text-[11px] text-[#8a97a3]">
      <span>{settings?.receipt_footer || "Thank you, see you again!"}</span>
      <span className="flex items-center gap-1.5">
        {settings?.business_name || "Chomnenh"}
      </span>
    </div>
  );
}
