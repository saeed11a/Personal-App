import { jsPDF } from "jspdf";

// A readable PDF table: title, export date, table name, filters, column headers that
// repeat on every page, page breaks and page numbers. Wide tables are laid out
// landscape automatically.

const A4 = { portrait: { w: 595.28, h: 841.89 }, landscape: { w: 841.89, h: 595.28 } };
const MARGIN = 34;
const ROW_HEIGHT = 18;

function fitText(doc, text, maxWidth) {
  const value = text === null || text === undefined ? "" : String(text);
  if (doc.getTextWidth(value) <= maxWidth) return value;
  let cut = value;
  while (cut.length > 1 && doc.getTextWidth(`${cut}…`) > maxWidth) cut = cut.slice(0, -1);
  return `${cut}…`;
}

/**
 * columns: [{ key, label, type?: 'text'|'number', width?: number }]
 * rows: array of objects
 */
export function exportTablePdf({ title, subtitle, filters, tableLabel, columns = [], rows = [], filename = "export.pdf" }) {
  const landscape = columns.length > 6;
  const page = A4[landscape ? "landscape" : "portrait"];
  const doc = new jsPDF({ orientation: landscape ? "landscape" : "portrait", unit: "pt", format: "a4" });
  const usableWidth = page.w - MARGIN * 2;

  const weights = columns.map((column) => column.width ?? Math.min(Math.max(String(column.label).length + 2, 10), 26));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  const widths = weights.map((weight) => (weight / totalWeight) * usableWidth);
  const offsets = widths.reduce((acc, width, index) => [...acc, (acc[index] ?? MARGIN) + width], [MARGIN]);

  let y = MARGIN;

  const drawHead = () => {
    doc.setFillColor(15, 118, 110);
    doc.rect(MARGIN, y, usableWidth, ROW_HEIGHT + 4, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    columns.forEach((column, index) => {
      doc.text(fitText(doc, column.label, widths[index] - 8), offsets[index] + 4, y + 14);
    });
    doc.setTextColor(30, 30, 30);
    doc.setFont("helvetica", "normal");
    y += ROW_HEIGHT + 4;
  };

  const drawTitle = () => {
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(title || "Export", MARGIN, y + 12);
    y += 20;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(110, 110, 110);
    doc.text(
      `${tableLabel || ""}${filters ? ` · ${filters}` : ""} · exported ${new Date().toLocaleString()} · ${rows.length} record${
        rows.length === 1 ? "" : "s"
      }`,
      MARGIN,
      y + 8
    );
    y += 22;
    doc.setTextColor(30, 30, 30);
    drawHead();
  };

  drawTitle();

  doc.setFontSize(8.5);
  rows.forEach((row) => {
    if (y + ROW_HEIGHT > page.h - MARGIN - 18) {
      doc.addPage();
      y = MARGIN;
      doc.setFontSize(9);
      doc.setTextColor(110, 110, 110);
      doc.text(`${title || "Export"} (continued)`, MARGIN, y + 10);
      y += 18;
      doc.setTextColor(30, 30, 30);
      doc.setFontSize(8.5);
      drawHead();
    }
    columns.forEach((column, index) => {
      const value = row[column.key];
      const text = column.type === "number" && value !== null && value !== undefined ? Number(value).toLocaleString() : value;
      doc.text(fitText(doc, text, widths[index] - 8), offsets[index] + 4, y + 12);
    });
    doc.setDrawColor(238, 238, 238);
    doc.line(MARGIN, y + ROW_HEIGHT, MARGIN + usableWidth, y + ROW_HEIGHT);
    y += ROW_HEIGHT;
  });

  if (rows.length === 0) {
    doc.setTextColor(120, 120, 120);
    doc.text("No records matched this export.", MARGIN + 4, y + 14);
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(130, 130, 130);
    doc.text(`HIKER+ Shoes Factory ERP · page ${i} of ${pages}`, MARGIN, page.h - 18);
  }

  doc.save(filename);
}
