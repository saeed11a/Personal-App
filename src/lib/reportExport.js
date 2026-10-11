import { base44 } from "@/api/base44Client";

const cell = (value) => (value === undefined || value === null ? "" : String(value));

export function downloadCSV(filename, columns, rows) {
  const header = columns.map((column) => `"${column.label}"`).join(",");
  const body = rows
    .map((row) => columns.map((column) => `"${cell(row[column.key]).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([`\uFEFF${header}\n${body}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function printReport({ title, subtitle, columns, rows }) {
  const win = window.open("", "_blank");
  if (!win) return;
  const head = columns.map((column) => `<th>${column.label}</th>`).join("");
  const body = rows
    .map((row) => `<tr>${columns.map((column) => `<td>${cell(row[column.key])}</td>`).join("")}</tr>`)
    .join("");
  win.document.write(`<!doctype html><html><head><title>${title}</title><style>
    *{box-sizing:border-box}
    body{font-family:Inter,Arial,sans-serif;padding:32px;color:#141414}
    h1{font-size:20px;margin:0 0 4px}
    p{margin:0 0 20px;color:#666;font-size:12px}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th{text-align:left;text-transform:uppercase;letter-spacing:.08em;font-size:10px;color:#666;border-bottom:1px solid #ddd;padding:8px}
    td{padding:8px;border-bottom:1px solid #f0f0f0}
  </style></head><body>
  <h1>${title}</h1>
  <p>${subtitle || ""} &middot; HIKER Shoes Factory ERP &middot; ${new Date().toLocaleString()}</p>
  <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
  <script>window.onload=function(){window.print();}<\/script>
  </body></html>`);
  win.document.close();
}

// Walks every page of a query - used only for exports.
export async function fetchAll(entityName, query = {}, sort = "-created_date") {
  const entity = base44.entities[entityName];
  const rows = [];
  let cursor;
  for (let i = 0; i < 40; i += 1) {
    const options = { sort, limit: 500 };
    if (cursor) options.cursor = cursor;
    const page = await entity.filter(query, options);
    rows.push(...(page?.items || []));
    if (!page?.has_more) break;
    cursor = page.next_cursor;
  }
  return rows;
}
