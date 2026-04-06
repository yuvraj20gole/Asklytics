/** Shared table shapes (pure types — safe to import from .ts utilities). */

export interface DataRow {
  [key: string]: string | number;
}

export interface SheetData {
  name: string;
  columns: string[];
  rows: DataRow[];
}

export interface UploadedData {
  fileName: string;
  sheets: SheetData[];
  uploadDate: Date;
}

/** Result of local `executeQuery` / CSV formula engine (chat + insights). */
export interface QueryResult {
  sql: string;
  table: DataRow[];
  chartData: Array<{ name: string; [key: string]: unknown }>;
  message: string;
  chartType?: "line" | "bar" | "multi-line" | "multi-bar";
  /** Chart Y-axis: % for margin/ratio queries. */
  chartValueFormat?: "percent" | "currency";
  insight?: string;
  metrics?: string[];
}
