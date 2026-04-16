import type { DataRow } from "../types/data";

/** Best-effort display symbol for money columns (used in chat charts / messages). */
export function inferCurrencyPrefix(data: DataRow[], columns: string[]): string {
  const colLc = columns.map((c) => c.toLowerCase());
  const joined = colLc.join(" ");
  if (/\busd|\$|dollar/i.test(joined)) return "$";
  if (/\beur|€|euro/i.test(joined)) return "€";
  if (/\bgbp|£|pound/i.test(joined)) return "£";
  if (/\binr|₹|rupee|lakh|crore/i.test(joined)) return "₹";

  const curCol = columns.find((c) => /currency/i.test(c));
  if (curCol && data[0]) {
    const v = String(data[0][curCol] ?? "").toUpperCase();
    if (v === "USD") return "$";
    if (v === "EUR") return "€";
    if (v === "GBP") return "£";
    if (v === "INR" || v === "RS" || v === "RS.") return "₹";
    if (v.length <= 4 && v.length > 0) return v;
  }

  return "₹";
}
