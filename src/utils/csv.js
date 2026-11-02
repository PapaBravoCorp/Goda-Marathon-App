// CSV files built in the browser and handed to the user as a download.

// A leading =, +, - or @ makes Excel treat the cell as a formula. The file
// lands on an organiser's laptop, so neutralise it.
export const csvCell = (value) => {
  if (value === null || value === undefined) return '""';
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

/** Download `rows` (arrays of cells) under `header` as a UTF-8 CSV Excel opens cleanly. */
export function downloadCsv(filename, header, rows) {
  const text = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
  // The byte-order mark tells Excel the file is UTF-8 (names in Marathi, ₹).
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
