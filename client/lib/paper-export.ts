// Turning rendered A4 papers into files or a print job. Every paper marks its
// exportable sheets with [data-paper-page] (see components/paper/paper.tsx and
// invoice-template/template-canvas.tsx); these helpers work on whatever root
// holds them, so the paper modal and the invoices page's bulk export share one
// path and can never produce different pages.

// Every sheet under `root` as a JPEG data URL, in page order. html-to-image
// renders through SVG foreignObject, so Tailwind 4's oklch colors and the
// self-hosted fonts survive (html2canvas chokes on both).
export async function renderSheets(root: HTMLElement): Promise<string[]> {
  const { toJpeg } = await import("html-to-image");
  const sheets = root.querySelectorAll<HTMLElement>("[data-paper-page]");
  const targets = sheets.length > 0 ? Array.from(sheets) : [root];
  const urls: string[] = [];
  for (const target of targets) {
    urls.push(await toJpeg(target, { quality: 0.92, pixelRatio: 2, backgroundColor: "#ffffff" }));
  }
  return urls;
}

// One JPG per sheet: name.jpg, or name-p1.jpg, name-p2.jpg ... for several.
export function saveJpgs(urls: string[], filename: string) {
  const base = filename.replace(/\.(jpe?g|pdf)$/i, "");
  urls.forEach((dataUrl, i) => {
    const a = document.createElement("a");
    a.download = urls.length > 1 ? `${base}-p${i + 1}.jpg` : `${base}.jpg`;
    a.href = dataUrl;
    a.click();
  });
}

// One A4 PDF page per sheet, in a single file.
export async function savePdf(urls: string[], filename: string) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  urls.forEach((dataUrl, i) => {
    if (i > 0) pdf.addPage();
    pdf.addImage(dataUrl, "JPEG", 0, 0, 210, 297);
  });
  pdf.save(`${filename.replace(/\.(jpe?g|pdf)$/i, "")}.pdf`);
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// Opens the system print dialog on the sheets, one sheet per A4 page with no
// margins. Printed from the same images the downloads use, in a throwaway
// iframe: printing the live page would drag the app shell and the modal along,
// and the sheet's own styles do not survive being copied into a fresh document.
export async function printSheets(urls: string[], title: string) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  // Off screen but laid out: some browsers print a zero-size or hidden frame blank.
  Object.assign(frame.style, {
    position: "fixed", left: "-10000px", top: "0", width: "794px", height: "1123px", border: "0",
  });
  document.body.appendChild(frame);

  const doc = frame.contentDocument!;
  doc.open();
  doc.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>` +
      "@page{size:A4 portrait;margin:0}html,body{margin:0;padding:0;background:#fff}" +
      "img{display:block;width:210mm;height:297mm;break-after:page;page-break-after:always}" +
      "img:last-child{break-after:auto;page-break-after:auto}" +
      `</style></head><body>${urls.map((u) => `<img src="${u}" alt="">`).join("")}</body></html>`,
  );
  doc.close();

  // Printing before the images decode prints blank pages.
  await Promise.all(
    Array.from(doc.images).map((img) => img.decode().catch(() => undefined)),
  );

  const win = frame.contentWindow!;
  let removed = false;
  const cleanup = () => {
    if (removed) return;
    removed = true;
    frame.remove();
  };
  // Chrome blocks inside print() until the dialog closes; Firefox and Safari do
  // not, so the frame must outlive the call until the dialog is done with it.
  win.addEventListener("afterprint", () => setTimeout(cleanup, 0));
  setTimeout(cleanup, 10 * 60 * 1000);
  win.focus();
  win.print();
}
