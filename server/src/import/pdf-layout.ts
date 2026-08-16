/**
 * Coordinate-preserving PDF extraction for financial statements.
 *
 * Why this exists:
 * Many bank PDFs are tables. A plain text extractor can emit the amount column
 * at the end of the page, breaking the relationship date -> description -> value.
 * We reconstruct lines from PDF text coordinates before parsing.
 *
 * Dependency to add in server/package.json:
 *   "pdfjs-dist": "^5.4.149"
 */

export interface PdfTextItemLike {
  str: string;
  transform: number[];
  width?: number;
}

function normalizeY(value: number, tolerance = 2.2): number {
  return Math.round(value / tolerance) * tolerance;
}

export async function extractPdfLayoutText(buffer: Uint8Array): Promise<string> {
  // Keep the import dynamic so the server starts only when the dependency exists.
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - package is supplied at runtime by server/package.json
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({ data: buffer, useSystemFonts: true });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    const rows = new Map<number, Array<{ x: number; text: string }>>();

    for (const raw of content.items as PdfTextItemLike[]) {
      if (!raw?.str?.trim?.()) continue;
      const x = Number(raw.transform?.[4] ?? 0);
      const y = normalizeY(Number(raw.transform?.[5] ?? 0));
      const row = rows.get(y) ?? [];
      row.push({ x, text: raw.str.trim() });
      rows.set(y, row);
    }

    const ordered = [...rows.entries()]
      .sort((a, b) => b[0] - a[0]) // PDF y grows bottom-up
      .map(([, cells]) => cells
        .sort((a, b) => a.x - b.x)
        .map(cell => cell.text)
        .join('    ')
        .replace(/\s+/g, ' ')
        .trim())
      .filter(Boolean);

    pages.push(ordered.join('\n'));
  }

  return pages.join('\n\f\n');
}
