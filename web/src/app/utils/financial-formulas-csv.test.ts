import { describe, expect, it } from "vitest";
import {
  csvQuestionAsksCagr,
  csvQuestionAsksFlowSumOrTotal,
  csvQuestionAsksRunningTotal,
  extractYearRangeFromQuestion,
  periodOverlapsYearRange,
} from "./financial-formulas-csv";

describe("extractYearRangeFromQuestion", () => {
  it("parses hyphen range", () => {
    expect(extractYearRangeFromQuestion("ROE 2020-2023")).toEqual({ lo: 2020, hi: 2023 });
  });
  it("parses between … and …", () => {
    expect(extractYearRangeFromQuestion("average margin between 2019 and 2021")).toEqual({
      lo: 2019,
      hi: 2021,
    });
  });
  it("parses from … to …", () => {
    expect(extractYearRangeFromQuestion("revenue from 2020 to 2022")).toEqual({ lo: 2020, hi: 2022 });
  });
  it("returns null when no range", () => {
    expect(extractYearRangeFromQuestion("FY 2024 ROE")).toBeNull();
  });
});

describe("periodOverlapsYearRange", () => {
  it("matches FY label", () => {
    expect(periodOverlapsYearRange("FY 2021", 2020, 2022)).toBe(true);
    expect(periodOverlapsYearRange("FY 2021", 2022, 2023)).toBe(false);
  });
});

describe("intent helpers", () => {
  it("detects sum/total flow", () => {
    expect(csvQuestionAsksFlowSumOrTotal("total revenue across years")).toBe(true);
    expect(csvQuestionAsksFlowSumOrTotal("roe trend")).toBe(false);
  });
  it("detects CAGR", () => {
    expect(csvQuestionAsksCagr("cagr on revenue")).toBe(true);
    expect(csvQuestionAsksCagr("compound annual growth for sales")).toBe(true);
  });
  it("detects running total", () => {
    expect(csvQuestionAsksRunningTotal("running total revenue")).toBe(true);
    expect(csvQuestionAsksRunningTotal("cumulative net income")).toBe(true);
  });
});
