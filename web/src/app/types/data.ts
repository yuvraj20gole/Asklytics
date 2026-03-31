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
