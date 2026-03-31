import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { DataRow, SheetData } from "../types/data";

export interface ParseResult {
  sheets: SheetData[];
  success: boolean;
  error?: string;
}

// Financial keywords to validate if the data is financial
const FINANCIAL_KEYWORDS = [
  "revenue", "sales", "profit", "loss", "expense", "cost", "income", "price",
  "amount", "total", "balance", "payment", "invoice", "transaction", "account",
  "debit", "credit", "asset", "liability", "equity", "tax", "interest", "margin",
  "budget", "forecast", "variance", "ytd", "quarter", "fiscal"
];

function isFinancialData(columns: string[]): boolean {
  const lowerColumns = columns.map(col => col.toLowerCase());
  
  // Check if any column name contains financial keywords
  const hasFinancialKeyword = lowerColumns.some(col =>
    FINANCIAL_KEYWORDS.some(keyword => col.includes(keyword))
  );
  
  // Also check if there are numeric columns (financial data usually has numbers)
  return hasFinancialKeyword;
}

function processRows(rawRows: any[]): DataRow[] {
  return rawRows.map((row) => {
    const processed: DataRow = {};
    for (const [key, value] of Object.entries(row)) {
      if (value === null || value === undefined || value === "") {
        processed[key] = "";
        continue;
      }
      
      const strValue = String(value).trim();
      
      // Remove currency symbols and commas before checking if it's a number
      const cleanValue = strValue.replace(/[$,€£¥]/g, "");
      
      // Try to convert to number if it looks like a number
      if (cleanValue && !isNaN(Number(cleanValue))) {
        processed[key] = Number(cleanValue);
      } else {
        processed[key] = value;
      }
    }
    return processed;
  });
}

export async function parseFile(file: File): Promise<ParseResult> {
  const fileName = file.name.toLowerCase();

  try {
    // CSV Files
    if (fileName.endsWith(".csv")) {
      return await parseCSV(file);
    }
    
    // Excel Files
    if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
      return await parseExcel(file);
    }
    
    // JSON Files
    if (fileName.endsWith(".json")) {
      return await parseJSON(file);
    }
    
    // PDF Files (simulated - in production would need backend processing)
    if (fileName.endsWith(".pdf")) {
      return {
        success: false,
        error: "PDF parsing requires backend processing. Please export your PDF to CSV or Excel format and upload that instead.",
        sheets: [],
      };
    }

    return {
      success: false,
      error: "Unsupported file format. Please upload CSV, Excel (.xlsx/.xls), or JSON files.",
      sheets: [],
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to parse file: ${error instanceof Error ? error.message : "Unknown error"}`,
      sheets: [],
    };
  }
}

async function parseCSV(file: File): Promise<ParseResult> {
  return new Promise((resolve) => {
    // First parse without header to detect structure
    Papa.parse(file, {
      complete: (results) => {
        try {
          const allRows = results.data as string[][];

          // Remove completely empty rows
          const nonEmptyRows = allRows.filter((row) =>
            row.some((cell) => cell && cell.trim() !== "")
          );

          if (nonEmptyRows.length === 0) {
            resolve({
              success: false,
              error: "The CSV file appears to be empty.",
              sheets: [],
            });
            return;
          }

          // NEW: Find the first valid data section
          const firstSectionData = findFirstValidSection(nonEmptyRows);
          
          if (!firstSectionData) {
            resolve({
              success: false,
              error: "Could not find a valid data section in the CSV file.",
              sheets: [],
            });
            return;
          }

          const { headerRow, dataRows } = firstSectionData;
          
          // Convert to objects
          const columns = headerRow.map(col => col.trim());
          const rows = dataRows.map(row => {
            const obj: any = {};
            headerRow.forEach((header, idx) => {
              obj[header.trim()] = row[idx] || "";
            });
            return obj;
          });

          // Validate if it's financial data
          if (!isFinancialData(columns)) {
            resolve({
              success: false,
              error: "This file doesn't appear to contain financial data. Please upload a financial document with columns like revenue, sales, expenses, etc.",
              sheets: [],
            });
            return;
          }

          const processedRows = processRows(rows);

          resolve({
            success: true,
            sheets: [{
              name: "Sheet1",
              columns,
              rows: processedRows,
            }],
          });
        } catch (err) {
          resolve({
            success: false,
            error: "Failed to process the CSV file. Please check the format.",
            sheets: [],
          });
        }
      },
      header: false, // Parse as raw array to detect structure
      skipEmptyLines: true,
      error: (err) => {
        resolve({
          success: false,
          error: `Failed to parse CSV file: ${err.message}`,
          sheets: [],
        });
      },
    });
  });
}

async function parseExcel(file: File): Promise<ParseResult> {
  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: "binary" });

        const sheets: SheetData[] = [];

        // Parse ALL sheets
        for (const sheetName of workbook.SheetNames) {
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet);

          if (jsonData.length === 0) {
            continue; // Skip empty sheets
          }

          const columns = Object.keys(jsonData[0] as any);

          // Only include financial data sheets
          if (isFinancialData(columns)) {
            const processedRows = processRows(jsonData);
            sheets.push({
              name: sheetName,
              columns,
              rows: processedRows,
            });
          }
        }

        if (sheets.length === 0) {
          resolve({
            success: false,
            error: "No sheets with financial data found. Please upload a financial document with columns like revenue, sales, expenses, etc.",
            sheets: [],
          });
          return;
        }

        resolve({
          success: true,
          sheets,
        });
      } catch (err) {
        resolve({
          success: false,
          error: `Failed to parse Excel file: ${err instanceof Error ? err.message : "Unknown error"}`,
          sheets: [],
        });
      }
    };

    reader.onerror = () => {
      resolve({
        success: false,
        error: "Failed to read the Excel file.",
        sheets: [],
      });
    };

    reader.readAsBinaryString(file);
  });
}

async function parseJSON(file: File): Promise<ParseResult> {
  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const jsonData = JSON.parse(text);

        // Handle array of objects
        if (!Array.isArray(jsonData)) {
          resolve({
            success: false,
            error: "JSON file must contain an array of objects.",
            sheets: [],
          });
          return;
        }

        if (jsonData.length === 0) {
          resolve({
            success: false,
            error: "The JSON file appears to be empty.",
            sheets: [],
          });
          return;
        }

        const columns = Object.keys(jsonData[0]);

        // Validate if it's financial data
        if (!isFinancialData(columns)) {
          resolve({
            success: false,
            error: "This file doesn't appear to contain financial data. Please upload a financial document with columns like revenue, sales, expenses, etc.",
            sheets: [],
          });
          return;
        }

        const processedRows = processRows(jsonData);

        resolve({
          success: true,
          sheets: [{
            name: "Sheet1",
            columns,
            rows: processedRows,
          }],
        });
      } catch (err) {
        resolve({
          success: false,
          error: `Failed to parse JSON file: ${err instanceof Error ? err.message : "Unknown error"}`,
          sheets: [],
        });
      }
    };

    reader.onerror = () => {
      resolve({
        success: false,
        error: "Failed to read the JSON file.",
        sheets: [],
      });
    };

    reader.readAsText(file);
  });
}

// NEW: Find the first valid data section in a multi-section CSV
function findFirstValidSection(rows: string[][]): { headerRow: string[], dataRows: string[][] } | null {
  // Look for a row that could be a header (has at least 3 columns with text)
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    
    // Check if this looks like a header row
    const nonEmptyCells = row.filter(cell => cell && cell.trim() !== "");
    if (nonEmptyCells.length < 3) continue; // Need at least 3 columns
    
    // Check if the next rows have data (numbers or FY patterns)
    const dataRows: string[][] = [];
    for (let j = i + 1; j < rows.length; j++) {
      const dataRow = rows[j];
      
      // Check if this row has data that matches the header structure
      if (dataRow.length < row.length * 0.5) break; // Stop if row doesn't have enough columns
      
      // Check if first column has year-like data (FY 2019, 2019, etc.) or if row has numbers
      const firstCell = dataRow[0]?.trim().toLowerCase() || "";
      const hasYearPattern = /^fy\s*\d{4}$|^\d{4}$/.test(firstCell);
      const hasNumbers = dataRow.some(cell => {
        const cleaned = String(cell).replace(/[,₹$]/g, "").trim();
        return cleaned && !isNaN(Number(cleaned));
      });
      
      // If it's another header-like row or empty, stop
      const looksLikeHeader = dataRow.every(cell => isNaN(Number(String(cell).replace(/[,₹$]/g, ""))));
      if (looksLikeHeader && !hasYearPattern && dataRows.length > 0) break;
      
      if (hasYearPattern || hasNumbers) {
        dataRows.push(dataRow);
      }
    }
    
    // If we found data rows, this is a valid section
    if (dataRows.length > 0) {
      return {
        headerRow: row,
        dataRows: dataRows
      };
    }
  }
  
  return null;
}