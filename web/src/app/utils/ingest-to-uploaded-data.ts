import type { DataRow, UploadedData } from "../types/data";

/** Rows returned by `/ingest/pdf` and `/ingest/image` — same shape as `IngestPdfResult.rows` / `IngestImageResult.rows`. */
export type IngestFactRow = {
  year: number;
  metric: string;
  value: number;
  raw: string;
  currency?: string | null;
};

export function ingestRowsToUploadedData(
  fileName: string,
  rows: IngestFactRow[],
  options?: { detectedCurrency?: string | null },
): UploadedData {
  const columns = ["year", "metric", "value", "raw", "currency"] as const;
  if (!rows?.length) {
    return {
      fileName,
      sheets: [{ name: "Extracted facts", columns: [...columns], rows: [] }],
      uploadDate: new Date(),
    };
  }

  const dataRows: DataRow[] = rows.map((r) => {
    const y = typeof r.year === "number" ? r.year : Number(r.year);
    const v = typeof r.value === "number" ? r.value : Number(r.value);
    const cur = r.currency ?? options?.detectedCurrency ?? "";
    return {
      year: Number.isFinite(y) ? y : 0,
      metric: String(r.metric ?? ""),
      value: Number.isFinite(v) ? v : 0,
      raw: String(r.raw ?? ""),
      currency: cur != null && String(cur) !== "" ? String(cur) : "",
    };
  });

  return {
    fileName,
    sheets: [
      {
        name: "Extracted facts",
        columns: [...columns],
        rows: dataRows,
      },
    ],
    uploadDate: new Date(),
  };
}

