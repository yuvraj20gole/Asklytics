import { Navbar } from "../components/navbar";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  Area,
} from "recharts";
import { useData } from "../contexts/data-context";
import { useHistory } from "../contexts/history-context";
import { 
  AlertCircle, 
  TrendingUp, 
  DollarSign, 
  PieChart as PieChartIcon,
  Users,
  Mail,
  BarChart3,
  Activity,
  RotateCcw,
  Calendar,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useMotionPageEffects } from "../hooks/use-motion-page-effects";
import { useChartColors } from "../hooks/use-chart-colors";
import {
  aggregateFactsRevenueOtherIncomeByPeriod,
  aggregateFactsRevenueOtherIncomeByGroup,
  aggregateWideSheetRevenueOtherIncomeByGroup,
  aggregateWideSheetRevenueExpenseByPeriod,
  formatFiscalYearLabel,
  inferGroupByColumn,
  isFinancialFactsLayout,
} from "../utils/analytics-infer";
import { canUseCsvFormulaEngine } from "../utils/financial-formulas-csv";

export function Analytics() {
  const { data, isDataLoaded } = useData();
  const { history } = useHistory();
  const [activeTab, setActiveTab] = useState("overview");
  const colors = useChartColors();

  const rootRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const kpiGridRef = useRef<HTMLDivElement>(null);
  const kpi0Ref = useRef<HTMLDivElement>(null);
  const kpi1Ref = useRef<HTMLDivElement>(null);
  const kpi2Ref = useRef<HTMLDivElement>(null);
  const kpi3Ref = useRef<HTMLDivElement>(null);

  useMotionPageEffects({
    root: rootRef,
    header: navRef,
    hero: { section: shellRef, layers: [headRef] },
    introBlocks: [tabsRef],
    cardGroups: [
      { grid: kpiGridRef, cards: [kpi0Ref, kpi1Ref, kpi2Ref, kpi3Ref] },
    ],
    parallaxInners: [{ section: rootRef, inner: shellRef }],
  });

  // Generate analytics from uploaded data
  const analytics = useMemo(() => {
    if (!isDataLoaded || !data || !data.sheets || data.sheets.length === 0) {
      return null;
    }

    // Use first sheet for analytics
    const firstSheet = data.sheets[0];
    if (!firstSheet) {
      return null;
    }

    const { rows, columns } = firstSheet;

    if (!rows || rows.length === 0 || !columns || columns.length === 0) {
      return null;
    }

    // Create a unique counter for this analytics generation
    const uniqueCounter = Math.random().toString(36).substring(2, 15);

    // Detect currency from dataset
    let currency = "₹"; // Default to INR
    const currencyColumn = columns.find(col => 
      col.toLowerCase().includes("currency")
    );

    if (currencyColumn) {
      const firstCurrency = rows[0]?.[currencyColumn];
      if (typeof firstCurrency === "string") {
        const currencyMap: Record<string, string> = {
          "USD": "$", "INR": "₹", "EUR": "€", "GBP": "£", 
          "JPY": "¥", "AUD": "A$", "CAD": "C$"
        };
        currency = currencyMap[firstCurrency.toUpperCase()] || firstCurrency;
      }
    } else {
      // Check if any column name contains currency indicator
      const hasUSD = columns.some(col => col.toLowerCase().includes("usd") || col.toLowerCase().includes("dollar"));
      const hasINR = columns.some(col => col.toLowerCase().includes("inr") || col.toLowerCase().includes("rupee"));
      const hasEUR = columns.some(col => col.toLowerCase().includes("eur") || col.toLowerCase().includes("euro"));
      
      if (hasUSD) currency = "$";
      else if (hasINR) currency = "₹";
      else if (hasEUR) currency = "€";
    }

    // Find numeric columns (excluding year-like columns for value aggregation)
    const numericColumns = columns.filter((col) => {
      const isNumeric = rows.some((row) => typeof row[col] === "number");
      const isYearLike = /year/i.test(col);
      return isNumeric && !isYearLike;
    });

    // If we have no proper numeric columns, return null
    if (numericColumns.length === 0) {
      return null;
    }

    const longFactsLayout = isFinancialFactsLayout(columns);
    const wideFinancialSheet =
      canUseCsvFormulaEngine(columns, rows) && !longFactsLayout;
    const groupByCol = inferGroupByColumn(columns, rows);
    const groupIsYear = /^year$/i.test(groupByCol);
    const revenueSplitLayout =
      (longFactsLayout && groupIsYear) || (wideFinancialSheet && groupIsYear);
    const valueCol = numericColumns[0];
    // Look for "Expenses" column specifically, otherwise use second numeric column
    // Make sure we NEVER select the same column twice
    const expensesCol = numericColumns.find(col => /expense|cost|expenditure/i.test(col));
    let valueCol2;
    
    if (expensesCol && expensesCol !== valueCol) {
      valueCol2 = expensesCol;
    } else if (numericColumns.length > 1) {
      // Find the first column that's different from valueCol
      valueCol2 = numericColumns.find(col => col !== valueCol) || numericColumns[0];
    } else {
      // Only one numeric column exists, use it for both (but mark it)
      valueCol2 = numericColumns[0];
    }

    const chartSeries1Name =
      longFactsLayout || revenueSplitLayout ? "Revenue" : valueCol;
    /** Top Year / KPIs: wide CSV year split uses other income (same as long facts). */
    const chartSeries2Name =
      longFactsLayout || revenueSplitLayout ? "Other income" : valueCol2;
    const volumeLineSeries1Name =
      longFactsLayout || revenueSplitLayout ? "Revenue" : chartSeries1Name;
    const volumeLineSeries2Name =
      longFactsLayout && groupIsYear
        ? "Other income"
        : wideFinancialSheet && groupIsYear
          ? "Expenses"
          : longFactsLayout || revenueSplitLayout
            ? "Other income"
            : chartSeries2Name;

    const metricColFacts = columns.find((c) => /^metric$/i.test(c)) ?? "metric";

    let groupedData: Record<string, number>;
    let groupedData2: Record<string, number>;

    if (longFactsLayout && groupIsYear) {
      const agg = aggregateFactsRevenueOtherIncomeByGroup(
        rows,
        groupByCol,
        valueCol,
        metricColFacts,
      );
      groupedData = agg.groupedData;
      groupedData2 = agg.groupedData2;
    } else if (wideFinancialSheet && groupIsYear) {
      const agg = aggregateWideSheetRevenueOtherIncomeByGroup(rows, groupByCol, columns);
      groupedData = agg.groupedData;
      groupedData2 = agg.groupedData2;
    } else {
      groupedData = {};
      groupedData2 = {};
      rows.forEach((row) => {
        const rawKey = String(row[groupByCol] || "Unknown");
        const key = rawKey.trim();
        const value = Number(row[valueCol]) || 0;
        const value2 = Number(row[valueCol2]) || 0;

        const existingKey =
          Object.keys(groupedData).find((k) => k.toLowerCase() === key.toLowerCase()) || key;

        groupedData[existingKey] = (groupedData[existingKey] || 0) + value;
        groupedData2[existingKey] = (groupedData2[existingKey] || 0) + value2;
      });
    }

    const topItems = Object.entries(groupedData)
      .map(([name, value]) => {
        const v2 = groupedData2[name] ?? 0;
        const displayName = revenueSplitLayout ? formatFiscalYearLabel(name) : name;
        return {
          name: displayName,
          value: Math.round(value),
          value2: Math.round(v2),
          _tot: value + v2,
        };
      })
      .sort((a, b) => b._tot - a._tot)
      .slice(0, 15)
      .map(({ name, value, value2 }, index) => ({
        id: `item-${index}-${uniqueCounter}`,
        name,
        value,
        value2,
      }));

    // Time series data (if we have date/year column)
    const dateColumn = columns.find(col => 
      /year|date|month|time|period|fy|quarter|qtr/i.test(col)
    );
    
    let timeSeriesData: any[] = [];
    if (dateColumn) {
      let timeGrouped: Record<string, { value1: number; value2: number }>;

      if (longFactsLayout) {
        const metricCol = columns.find((c) => /^metric$/i.test(c)) ?? "metric";
        timeGrouped = aggregateFactsRevenueOtherIncomeByPeriod(rows, dateColumn, valueCol, metricCol);
      } else if (wideFinancialSheet) {
        // Volume over time only: second line = expenses (Top Year bars stay revenue vs other income).
        timeGrouped = aggregateWideSheetRevenueExpenseByPeriod(rows, dateColumn, columns);
      } else {
        timeGrouped = {};
        rows.forEach((row) => {
          const rawKey = String(row[dateColumn] || "Unknown");
          const key = rawKey.trim();
          const v1 = Number(row[valueCol]) || 0;
          const v2 = Number(row[valueCol2]) || 0;
          
          const existingKey = Object.keys(timeGrouped).find(k => k.toLowerCase() === key.toLowerCase()) || key;
          
          if (!timeGrouped[existingKey]) {
            timeGrouped[existingKey] = { value1: 0, value2: 0 };
          }
          timeGrouped[existingKey].value1 += v1;
          timeGrouped[existingKey].value2 += v2;
        });
      }
      
      timeSeriesData = Object.entries(timeGrouped)
        .sort(([a], [b]) => {
          // Try to extract year for sorting
          const yearA = a.match(/\d{4}/)?.[0] || a;
          const yearB = b.match(/\d{4}/)?.[0] || b;
          return yearA.localeCompare(yearB);
        })
        .slice(0, 30)
        .map(([period, values], index) => {
          // Create absolutely unique ID and period to prevent duplicate keys
          const uniqueId = `time-${uniqueCounter}-${index}`;
          
          // Create a truly unique display period by always including index
          let displayPeriod = period.length > 15 ? period.slice(0, 12) + "..." : period;
          
          // Make period absolutely unique by appending index to avoid Recharts duplicate key warnings
          displayPeriod = `${displayPeriod}_${index}`;
          
          return {
            id: uniqueId,
            period: displayPeriod,
            fullPeriod: period,
            value1: Math.round(values.value1),
            value2: Math.round(values.value2),
          };
        });
    } else {
      // Fallback: try using the first column or groupByCol as time axis
      const fallbackDateCol = groupByCol;
      const timeGrouped: Record<string, { value1: number; value2: number }> = {};
      rows.forEach((row) => {
        const rawKey = String(row[fallbackDateCol] || "Unknown");
        const key = rawKey.trim();
        const v1 = Number(row[valueCol]) || 0;
        const v2 = Number(row[valueCol2]) || 0;
        
        const existingKey = Object.keys(timeGrouped).find(k => k.toLowerCase() === key.toLowerCase()) || key;
        
        if (!timeGrouped[existingKey]) {
          timeGrouped[existingKey] = { value1: 0, value2: 0 };
        }
        timeGrouped[existingKey].value1 += v1;
        timeGrouped[existingKey].value2 += v2;
      });

      const usedFallbackPeriods = new Set<string>();
      
      timeSeriesData = Object.entries(timeGrouped)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(0, 30)
        .map(([period, values], index) => {
          // Create absolutely unique ID and period to prevent duplicate keys
          const uniqueId = `time-${uniqueCounter}-${index}`;
          
          // Create a truly unique display period by always including index
          let displayPeriod = period.length > 15 ? period.slice(0, 12) + "..." : period;
          
          // Make period absolutely unique by appending index to avoid Recharts duplicate key warnings
          displayPeriod = `${displayPeriod}_${index}`;
          
          return {
            id: uniqueId,
            period: displayPeriod,
            fullPeriod: period,
            value1: Math.round(values.value1),
            value2: Math.round(values.value2),
          };
        });

    }

    // Pie chart data (top 5)
    const pieData = topItems.slice(0, 5).map((item, index) => {
      const uniqueId = `pie-${item.name.replace(/[^a-zA-Z0-9]/g, '_')}-${index}`;
      return {
        ...item,
        id: uniqueId,
        percentage: 0,
      };
    });

    // Calculate percentages for donut chart
    const pieTotal = pieData.reduce((sum, item) => sum + item.value, 0);
    pieData.forEach(item => {
      item.percentage = pieTotal > 0 ? Math.round((item.value / pieTotal) * 100) : 0;
    });

    // Calculate totals
    const totalValue = Object.values(groupedData).reduce((sum, val) => sum + val, 0);
    const totalValue2 = Object.values(groupedData2).reduce((sum, val) => sum + val, 0);
    const avgValue = totalValue / Object.keys(groupedData).length;
    const maxValue = Math.max(...Object.values(groupedData));
    const itemCount = Object.keys(groupedData).length;

    // Bar / KPI second metric: other income as % of revenue when year-split P&L layout.
    const rate = totalValue > 0 ? ((totalValue2 / totalValue) * 100).toFixed(1) : "0.0";

    // Sum of time-series value2: other income (long facts) or expenses (wide CSV volume line).
    const totalExpensesTimeSeries =
      (longFactsLayout || wideFinancialSheet) && timeSeriesData.length > 0
        ? Math.round(
            timeSeriesData.reduce((sum: number, d: { value2?: number }) => sum + (d.value2 || 0), 0),
          )
        : null;

    return {
      topItems,
      pieData,
      timeSeriesData,
      totalValue: Math.round(totalValue),
      totalValue2: Math.round(totalValue2),
      avgValue: Math.round(avgValue),
      maxValue: Math.round(maxValue),
      itemCount,
      rate,
      groupByCol,
      valueCol,
      valueCol2,
      chartSeries1Name,
      chartSeries2Name,
      volumeLineSeries1Name,
      volumeLineSeries2Name,
      isIngestFactsLayout: longFactsLayout || revenueSplitLayout,
      /** True for PDF/image long rows; second series = other income. */
      isLongFactsYearSplit: longFactsLayout && groupIsYear,
      /** Wide P&L CSV + year column: bars = other income; Volume over time line 2 = expenses. */
      isWideCsvYearSplit: wideFinancialSheet && groupIsYear,
      totalExpensesTimeSeries,
      currency,
      dateColumn: dateColumn || "Period",
      uniqueCounter, // Add this for chart keys
    };
  }, [data, isDataLoaded]);

  if (!isDataLoaded) {
    return (
      <div ref={rootRef} className="min-h-screen bg-white dark:bg-gray-900">
        <Navbar ref={navRef} />

        <div ref={shellRef} className="max-w-[1600px] mx-auto px-6 py-8">
          <div
            ref={headRef}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-12 text-center shadow-sm"
          >
            <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-700 mx-auto mb-4 flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-gray-400 dark:text-gray-500" />
            </div>
            <h3 className="text-gray-900 dark:text-gray-100 mb-2 font-semibold">No Data Available</h3>
            <p className="text-gray-600 dark:text-gray-400">
              Upload financial data to see analytics and visualizations.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div ref={rootRef} className="min-h-screen bg-white dark:bg-gray-900">
        <Navbar ref={navRef} />

        <div ref={shellRef} className="max-w-[1600px] mx-auto px-6 py-8">
          <div
            ref={headRef}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-12 text-center shadow-sm"
          >
            <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-700 mx-auto mb-4 flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-gray-400 dark:text-gray-500" />
            </div>
            <h3 className="text-gray-900 dark:text-gray-100 mb-2 font-semibold">Unable to Generate Analytics</h3>
            <p className="text-gray-600 dark:text-gray-400">
              The uploaded data doesn't have the required structure for analytics.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "trends", label: "Trend Analysis" },
    { id: "distribution", label: "Distribution Analysis" },
    { id: "insights", label: "Key Insights" },
  ];

  return (
    <div ref={rootRef} className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar ref={navRef} />

      <div ref={shellRef} className="max-w-[1600px] mx-auto px-6 py-8">
        {/* Header */}
        <div ref={headRef} className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-gray-900 dark:text-gray-100 text-2xl mb-1 font-semibold">Financial Data Analysis</h1>
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              Comprehensive insights from {data?.fileName}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button className="p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm">
              <RotateCcw className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div ref={tabsRef} className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-2.5 rounded-lg font-medium text-sm whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? "bg-[#6366f1] text-white shadow-md"
                  : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="space-y-6">
          {/* Overview Tab */}
          {activeTab === "overview" && (
            <>
              {/* KPI Cards */}
              <div ref={kpiGridRef} className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div
                  ref={kpi0Ref}
                  className="bg-gradient-to-br from-blue-50 to-white dark:from-blue-900/20 dark:to-gray-800 border border-blue-100 dark:border-blue-900/50 rounded-xl p-6 shadow-sm"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-xl bg-blue-500 flex items-center justify-center shadow-sm">
                      <DollarSign className="w-6 h-6 text-white" />
                    </div>
                    <p className="text-gray-600 dark:text-gray-400 text-sm font-medium">{analytics.chartSeries1Name}</p>
                  </div>
                  <p className="text-gray-900 dark:text-gray-100 text-3xl font-bold mb-1">
                    {analytics.totalValue.toLocaleString()}
                  </p>
                  <p className="text-gray-500 dark:text-gray-500 text-xs">Total amount</p>
                </div>

                <div
                  ref={kpi1Ref}
                  className="bg-gradient-to-br from-green-50 to-white dark:from-green-900/20 dark:to-gray-800 border border-green-100 dark:border-green-900/50 rounded-xl p-6 shadow-sm"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-xl bg-[#22c55e] flex items-center justify-center shadow-sm">
                      <TrendingUp className="w-6 h-6 text-white" />
                    </div>
                    <p className="text-gray-600 dark:text-gray-400 text-sm font-medium">{analytics.chartSeries2Name}</p>
                  </div>
                  <p className="text-gray-900 dark:text-gray-100 text-3xl font-bold mb-1">
                    {analytics.totalValue2.toLocaleString()}
                  </p>
                  <p className="text-gray-500 dark:text-gray-500 text-xs">
                    {analytics.isLongFactsYearSplit || analytics.isWideCsvYearSplit
                      ? "Total other income"
                      : analytics.isIngestFactsLayout
                        ? "Secondary total"
                        : "Secondary metric"}
                  </p>
                </div>

                <div
                  ref={kpi2Ref}
                  className="bg-gradient-to-br from-purple-50 to-white dark:from-purple-900/20 dark:to-gray-800 border border-purple-100 dark:border-purple-900/50 rounded-xl p-6 shadow-sm"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-xl bg-purple-500 flex items-center justify-center shadow-sm">
                      <Users className="w-6 h-6 text-white" />
                    </div>
                    <p className="text-gray-600 dark:text-gray-400 text-sm font-medium">{analytics.groupByCol}</p>
                  </div>
                  <p className="text-gray-900 dark:text-gray-100 text-3xl font-bold mb-1">
                    {analytics.itemCount}
                  </p>
                  <p className="text-gray-500 dark:text-gray-500 text-xs">Total categories</p>
                </div>

                <div
                  ref={kpi3Ref}
                  className="bg-gradient-to-br from-cyan-50 to-white dark:from-cyan-900/20 dark:to-gray-800 border border-cyan-100 dark:border-cyan-900/50 rounded-xl p-6 shadow-sm"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-xl bg-cyan-500 flex items-center justify-center shadow-sm">
                      <Activity className="w-6 h-6 text-white" />
                    </div>
                    <p className="text-gray-600 dark:text-gray-400 text-sm font-medium">Rate</p>
                  </div>
                  <p className="text-gray-900 dark:text-gray-100 text-3xl font-bold mb-1">
                    {analytics.rate}%
                  </p>
                  <p className="text-gray-500 dark:text-gray-500 text-xs">
                    {analytics.isLongFactsYearSplit || analytics.isWideCsvYearSplit
                      ? "Other income ÷ revenue"
                      : "Performance ratio"}
                  </p>
                </div>
              </div>

              {/* Main Chart Area - Volume Over Time */}
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                    <h3 className="text-gray-900 dark:text-gray-100 font-semibold text-lg">
                      Volume Over Time ({analytics.dateColumn})
                    </h3>
                    {analytics.timeSeriesData && analytics.timeSeriesData.length > 0 && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                        {analytics.timeSeriesData.length} data points
                      </span>
                    )}
                  </div>
                </div>
                {analytics.timeSeriesData && analytics.timeSeriesData.length > 0 ? (
                  <div className="w-full" style={{ height: '500px' }}>
                    {(() => {
                      // STEP 1 — Compute max value from BOTH metrics
                      const maxValue = Math.max(
                        ...analytics.timeSeriesData.map((d: any) => Math.max(d.value1 || 0, d.value2 || 0))
                      );
                      
                      // Calculate explicit ticks to ensure all values appear
                      const tickInterval = Math.ceil(maxValue / 5);
                      const ticks = [0, tickInterval, tickInterval * 2, tickInterval * 3, tickInterval * 4, maxValue];
                      
                      return (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart 
                            data={analytics.timeSeriesData} 
                            margin={{ top: 20, right: 30, left: 20, bottom: 80 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke={colors.gridColor} />
                            <XAxis 
                              dataKey="period"
                              stroke={colors.axisColor} 
                              tick={{ fill: colors.axisTextColor, fontSize: 11 }}
                              angle={-45}
                              textAnchor="end"
                              height={100}
                              interval={0}
                            />
                            {/* STEP 2 — Force TRUE scale with explicit ticks */}
                            <YAxis 
                              stroke={colors.axisColor} 
                              tick={{ fill: colors.axisTextColor, fontSize: 12 }}
                              width={80}
                              domain={[0, maxValue]}
                              ticks={ticks}
                              tickFormatter={(value) => value.toLocaleString()}
                            />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: colors.tooltipBg,
                                border: `1px solid ${colors.tooltipBorder}`,
                                borderRadius: "8px",
                                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                              }}
                              labelFormatter={(period) => {
                                const item = analytics.timeSeriesData.find((d: any) => d.period === period);
                                return item ? item.fullPeriod : period;
                              }}
                              formatter={(value: any, name: any) => [value.toLocaleString(), name]}
                            />
                            <Legend 
                              wrapperStyle={{ paddingTop: "20px" }}
                              iconType="line"
                            />
                            {/* Facts/CSV split: Revenue vs other income (long facts) or vs expenses (wide CSV). */}
                            <Line 
                              type="monotone" 
                              dataKey="value1" 
                              stroke={colors.tertiary} 
                              strokeWidth={3}
                              dot={{ fill: colors.tertiary, r: 5, strokeWidth: 2, stroke: colors.dotStroke }}
                              activeDot={{ r: 7 }}
                              name={analytics.volumeLineSeries1Name}
                            />
                            <Line 
                              type="monotone" 
                              dataKey="value2" 
                              stroke={colors.secondary} 
                              strokeWidth={3}
                              dot={{ fill: colors.secondary, r: 5, strokeWidth: 2, stroke: colors.dotStroke }}
                              activeDot={{ r: 7 }}
                              name={analytics.volumeLineSeries2Name}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-[500px] text-gray-500 dark:text-gray-400">
                    <div className="text-center">
                      <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                      <p className="font-medium">No time series data available</p>
                      <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                        Upload data with date/year columns to see trends
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom Row - Donut + Horizontal Bars */}
              <div className="grid lg:grid-cols-3 gap-6">
                {/* Donut Chart */}
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-6">
                    <PieChartIcon className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                    <h3 className="text-gray-900 dark:text-gray-100 font-semibold">
                      Distribution by {analytics.groupByCol}
                    </h3>
                  </div>
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={analytics.pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                        paddingAngle={3}
                        label={({ name, percentage }) => `${name}: ${percentage}%`}
                        labelLine={{ stroke: "#9ca3af", strokeWidth: 1 }}
                      >
                        {analytics.pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={colors.pieColors[index % colors.pieColors.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: colors.tooltipBg,
                          border: `1px solid ${colors.tooltipBorder}`,
                          borderRadius: "8px",
                          boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="mt-4 space-y-2">
                    {analytics.pieData.map((item, index) => (
                      <div key={index} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: colors.pieColors[index % colors.pieColors.length] }}
                          ></div>
                          <span className="text-gray-600 dark:text-gray-400 truncate max-w-[150px]">{item.name}</span>
                        </div>
                        <span className="text-gray-900 dark:text-gray-100 font-medium">{item.percentage}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Horizontal Bar Charts */}
                <div className="lg:col-span-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-6">
                    <BarChart3 className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                    <h3 className="text-gray-900 dark:text-gray-100 font-semibold">
                      Top {analytics.groupByCol} by Values
                    </h3>
                  </div>
                  <div className="space-y-4">
                    {analytics.topItems.slice(0, 8).map((item, index) => {
                      const maxVal = Math.max(
                        1,
                        ...analytics.topItems.map((i) => i.value + i.value2),
                      );
                      const rowTotal = item.value + item.value2;
                      const rowScalePct = rowTotal > 0 ? (rowTotal / maxVal) * 100 : 0;
                      const revFlex = Math.max(item.value, 0);
                      const oiFlex = Math.max(item.value2, 0);

                      return (
                        <div key={index}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-gray-700 dark:text-gray-300 text-sm font-medium">{item.name}</span>
                            <div className="flex items-center gap-4">
                              <span className="text-cyan-600 dark:text-cyan-400 text-xs font-semibold">{item.value.toLocaleString()}</span>
                              <span className="text-green-600 dark:text-green-400 text-xs font-semibold">{item.value2.toLocaleString()}</span>
                            </div>
                          </div>
                          {/* Track width vs largest row; inner split = revenue vs other income (Top Year unchanged for CSV). */}
                          <div className="h-7 w-full rounded-md bg-gray-100 dark:bg-gray-700/50 overflow-hidden">
                            <div
                              className="flex h-full rounded-md overflow-hidden shadow-sm"
                              style={{
                                width: `${rowScalePct}%`,
                                minWidth: rowTotal > 0 ? "8px" : undefined,
                              }}
                            >
                              {revFlex > 0 && (
                                <div
                                  className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400"
                                  style={{ flex: revFlex }}
                                />
                              )}
                              {oiFlex > 0 && (
                                <div
                                  className="h-full bg-gradient-to-r from-green-500 to-green-400"
                                  style={{ flex: oiFlex, minWidth: "6px" }}
                                />
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Trend Analysis Tab */}
          {activeTab === "trends" && (
            <>
              {/* Growth Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-gray-600 dark:text-gray-400 text-sm font-medium">Year-over-Year Growth</p>
                    <TrendingUp className="w-5 h-5 text-green-500" />
                  </div>
                  <p className="text-gray-900 dark:text-gray-100 text-3xl font-bold mb-1">
                    {(() => {
                      if (analytics.timeSeriesData.length >= 2) {
                        const latest = analytics.timeSeriesData[analytics.timeSeriesData.length - 1];
                        const previous = analytics.timeSeriesData[analytics.timeSeriesData.length - 2];
                        const growth = ((latest.value1 - previous.value1) / previous.value1 * 100).toFixed(1);
                        return `${growth}%`;
                      }
                      return "N/A";
                    })()}
                  </p>
                  <p className="text-gray-500 dark:text-gray-500 text-xs">Based on {analytics.chartSeries1Name}</p>
                </div>

                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-gray-600 dark:text-gray-400 text-sm font-medium">Average Growth Rate</p>
                    <Activity className="w-5 h-5 text-blue-500" />
                  </div>
                  <p className="text-gray-900 dark:text-gray-100 text-3xl font-bold mb-1">
                    {(() => {
                      if (analytics.timeSeriesData.length >= 2) {
                        let totalGrowth = 0;
                        for (let i = 1; i < analytics.timeSeriesData.length; i++) {
                          const current = analytics.timeSeriesData[i].value1;
                          const prev = analytics.timeSeriesData[i - 1].value1;
                          if (prev > 0) {
                            totalGrowth += ((current - prev) / prev) * 100;
                          }
                        }
                        const avgGrowth = (totalGrowth / (analytics.timeSeriesData.length - 1)).toFixed(1);
                        return `${avgGrowth}%`;
                      }
                      return "N/A";
                    })()}
                  </p>
                  <p className="text-gray-500 dark:text-gray-500 text-xs">Across all periods</p>
                </div>

                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-gray-600 dark:text-gray-400 text-sm font-medium">Best Period</p>
                    <Calendar className="w-5 h-5 text-purple-500" />
                  </div>
                  <p className="text-gray-900 dark:text-gray-100 text-2xl font-bold mb-1">
                    {(() => {
                      const best = analytics.timeSeriesData.reduce((max, item) => 
                        item.value1 > max.value1 ? item : max
                      );
                      return best.fullPeriod.substring(0, 15);
                    })()}
                  </p>
                  <p className="text-gray-500 dark:text-gray-500 text-xs">{analytics.timeSeriesData.reduce((max, item) => item.value1 > max.value1 ? item : max).value1.toLocaleString()}</p>
                </div>
              </div>

              {/* Trend Line Chart */}
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-6">
                  <TrendingUp className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                  <h3 className="text-gray-900 dark:text-gray-100 font-semibold text-lg">Trend Analysis - {analytics.chartSeries1Name}</h3>
                </div>
                <div className="w-full" style={{ height: '400px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart 
                      data={analytics.timeSeriesData} 
                      margin={{ top: 20, right: 30, left: 20, bottom: 80 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={colors.gridColor} />
                      <XAxis 
                        dataKey="period"
                        stroke={colors.axisColor} 
                        tick={{ fill: colors.axisTextColor, fontSize: 11 }}
                        angle={-45}
                        textAnchor="end"
                        height={100}
                        interval={0}
                      />
                      <YAxis 
                        stroke={colors.axisColor} 
                        tick={{ fill: colors.axisTextColor, fontSize: 12 }}
                        tickFormatter={(value) => value.toLocaleString()}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: colors.tooltipBg,
                          border: `1px solid ${colors.tooltipBorder}`,
                          borderRadius: "8px",
                          boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                        }}
                        labelFormatter={(period) => {
                          const item = analytics.timeSeriesData.find((d: any) => d.period === period);
                          return item ? item.fullPeriod : period;
                        }}
                        formatter={(value: any) => [value.toLocaleString(), analytics.chartSeries1Name]}
                      />
                      <Legend wrapperStyle={{ paddingTop: "20px" }} />
                      <Line 
                        type="monotone" 
                        dataKey="value1" 
                        stroke={colors.primary} 
                        strokeWidth={3}
                        dot={{ fill: colors.primary, r: 6 }}
                        name={analytics.chartSeries1Name}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Period-over-Period Comparison */}
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-6">
                  <BarChart3 className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                  <h3 className="text-gray-900 dark:text-gray-100 font-semibold">Period-over-Period Change</h3>
                </div>
                <div className="space-y-3">
                  {analytics.timeSeriesData.slice(-6).map((item, index, arr) => {
                    if (index === 0) return null;
                    const prev = arr[index - 1];
                    const change = item.value1 - prev.value1;
                    const percentChange = prev.value1 > 0 ? ((change / prev.value1) * 100).toFixed(1) : "0";
                    const isPositive = change >= 0;

                    return (
                      <div key={index} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                        <div>
                          <p className="text-gray-700 dark:text-gray-300 font-medium text-sm">{item.fullPeriod}</p>
                          <p className="text-gray-500 dark:text-gray-500 text-xs">vs {prev.fullPeriod}</p>
                        </div>
                        <div className="text-right">
                          <p className={`font-bold ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {isPositive ? '+' : ''}{change.toLocaleString()}
                          </p>
                          <p className={`text-xs ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {isPositive ? '+' : ''}{percentChange}%
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* Distribution Analysis Tab */}
          {activeTab === "distribution" && (
            <>
              {/* Summary Statistics */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-gray-600 dark:text-gray-400 text-sm font-medium">Mean</p>
                    <Activity className="w-5 h-5 text-blue-500" />
                  </div>
                  <p className="text-gray-900 dark:text-gray-100 text-3xl font-bold mb-1">
                    {analytics.avgValue.toLocaleString()}
                  </p>
                  <p className="text-gray-500 dark:text-gray-500 text-xs">Average value</p>
                </div>

                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-gray-600 dark:text-gray-400 text-sm font-medium">Maximum</p>
                    <TrendingUp className="w-5 h-5 text-green-500" />
                  </div>
                  <p className="text-gray-900 dark:text-gray-100 text-3xl font-bold mb-1">
                    {analytics.maxValue.toLocaleString()}
                  </p>
                  <p className="text-gray-500 dark:text-gray-500 text-xs">Highest value</p>
                </div>

                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-gray-600 dark:text-gray-400 text-sm font-medium">Total Count</p>
                    <Users className="w-5 h-5 text-purple-500" />
                  </div>
                  <p className="text-gray-900 dark:text-gray-100 text-3xl font-bold mb-1">
                    {analytics.itemCount}
                  </p>
                  <p className="text-gray-500 dark:text-gray-500 text-xs">Data points</p>
                </div>

                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-gray-600 dark:text-gray-400 text-sm font-medium">Median Range</p>
                    <PieChartIcon className="w-5 h-5 text-cyan-500" />
                  </div>
                  <p className="text-gray-900 dark:text-gray-100 text-3xl font-bold mb-1">
                    {(() => {
                      const byName = analytics.topItems.reduce<Record<string, number>>((acc, item) => {
                        acc[item.name] = item.value;
                        return acc;
                      }, {});
                      const sorted = Object.values(byName).sort((a, b) => a - b);
                      const mid = Math.floor(sorted.length / 2);
                      return sorted.length % 2 === 0
                        ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2).toLocaleString()
                        : sorted[mid]!.toLocaleString();
                    })()}
                  </p>
                  <p className="text-gray-500 dark:text-gray-500 text-xs">Middle value</p>
                </div>
              </div>

              {/* Distribution Charts */}
              <div className="grid lg:grid-cols-2 gap-6">
                {/* Histogram */}
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-6">
                    <BarChart3 className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                    <h3 className="text-gray-900 dark:text-gray-100 font-semibold">Value Distribution</h3>
                  </div>
                  <div className="w-full" style={{ height: '350px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analytics.topItems.slice(0, 10)} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={colors.gridColor} />
                        <XAxis
                          dataKey="name"
                          stroke={colors.axisColor}
                          tick={{ fill: colors.axisTextColor, fontSize: 11 }}
                          angle={-45}
                          textAnchor="end"
                          height={80}
                        />
                        <YAxis
                          stroke={colors.axisColor}
                          tick={{ fill: colors.axisTextColor, fontSize: 12 }}
                          tickFormatter={(value) => value.toLocaleString()}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: colors.tooltipBg,
                            border: `1px solid ${colors.tooltipBorder}`,
                            borderRadius: "8px",
                            boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                          }}
                          formatter={(value: any) => [value.toLocaleString(), analytics.valueCol]}
                        />
                        <Bar dataKey="value" fill="#6366f1" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Box Plot (using composed chart) */}
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-6">
                    <Activity className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                    <h3 className="text-gray-900 dark:text-gray-100 font-semibold">Quartile Analysis</h3>
                  </div>
                  <div className="space-y-4">
                    {(() => {
                      const values = analytics.topItems.map(item => item.value).sort((a, b) => a - b);
                      const q1Index = Math.floor(values.length * 0.25);
                      const q2Index = Math.floor(values.length * 0.5);
                      const q3Index = Math.floor(values.length * 0.75);
                      const min = values[0];
                      const max = values[values.length - 1];
                      const q1 = values[q1Index];
                      const q2 = values[q2Index];
                      const q3 = values[q3Index];
                      const iqr = q3 - q1;

                      return (
                        <>
                          <div className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-900/50">
                            <span className="text-gray-700 dark:text-gray-300 font-medium">Minimum</span>
                            <span className="text-gray-900 dark:text-gray-100 font-bold">{min.toLocaleString()}</span>
                          </div>
                          <div className="flex items-center justify-between p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-100 dark:border-indigo-900/50">
                            <span className="text-gray-700 dark:text-gray-300 font-medium">Q1 (25%)</span>
                            <span className="text-gray-900 dark:text-gray-100 font-bold">{q1.toLocaleString()}</span>
                          </div>
                          <div className="flex items-center justify-between p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-100 dark:border-purple-900/50">
                            <span className="text-gray-700 dark:text-gray-300 font-medium">Median (Q2)</span>
                            <span className="text-gray-900 dark:text-gray-100 font-bold">{q2.toLocaleString()}</span>
                          </div>
                          <div className="flex items-center justify-between p-4 bg-violet-50 dark:bg-violet-900/20 rounded-lg border border-violet-100 dark:border-violet-900/50">
                            <span className="text-gray-700 dark:text-gray-300 font-medium">Q3 (75%)</span>
                            <span className="text-gray-900 dark:text-gray-100 font-bold">{q3.toLocaleString()}</span>
                          </div>
                          <div className="flex items-center justify-between p-4 bg-fuchsia-50 dark:bg-fuchsia-900/20 rounded-lg border border-fuchsia-100 dark:border-fuchsia-900/50">
                            <span className="text-gray-700 dark:text-gray-300 font-medium">Maximum</span>
                            <span className="text-gray-900 dark:text-gray-100 font-bold">{max.toLocaleString()}</span>
                          </div>
                          <div className="flex items-center justify-between p-4 bg-pink-50 dark:bg-pink-900/20 rounded-lg border border-pink-100 dark:border-pink-900/50">
                            <span className="text-gray-700 dark:text-gray-300 font-medium">IQR (Spread)</span>
                            <span className="text-gray-900 dark:text-gray-100 font-bold">{iqr.toLocaleString()}</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Top & Bottom Performers */}
              <div className="grid lg:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-6">
                    <TrendingUp className="w-5 h-5 text-green-500" />
                    <h3 className="text-gray-900 dark:text-gray-100 font-semibold">Top Performers</h3>
                  </div>
                  <div className="space-y-3">
                    {analytics.topItems.slice(0, 5).map((item, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-100 dark:border-green-900/50">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white font-bold text-sm">
                            {index + 1}
                          </div>
                          <span className="text-gray-700 dark:text-gray-300 font-medium">{item.name}</span>
                        </div>
                        <span className="text-gray-900 dark:text-gray-100 font-bold">{item.value.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-6">
                    <AlertCircle className="w-5 h-5 text-orange-500" />
                    <h3 className="text-gray-900 dark:text-gray-100 font-semibold">Bottom Performers</h3>
                  </div>
                  <div className="space-y-3">
                    {analytics.topItems.slice(-5).reverse().map((item, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-100 dark:border-orange-900/50">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-white font-bold text-sm">
                            {analytics.topItems.length - index}
                          </div>
                          <span className="text-gray-700 dark:text-gray-300 font-medium">{item.name}</span>
                        </div>
                        <span className="text-gray-900 dark:text-gray-100 font-bold">{item.value.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Key Insights Tab */}
          {activeTab === "insights" && (
            <div className="space-y-6">
              {/* Generate intelligent insights from the data */}
              {analytics && analytics.timeSeriesData.length > 0 ? (
                <>
                  {/* Overall Performance Insight */}
                  <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border-2 border-green-200 dark:border-green-800 rounded-xl p-6">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center flex-shrink-0">
                        <TrendingUp className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-green-900 dark:text-green-100 mb-2">
                          📊 Overall Performance
                        </h3>
                        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                          {(() => {
                            const firstPeriod = analytics.timeSeriesData[0];
                            const lastPeriod = analytics.timeSeriesData[analytics.timeSeriesData.length - 1];
                            const firstValue = firstPeriod.value1;
                            const lastValue = lastPeriod.value1;
                            const growth = firstValue > 0 ? ((lastValue - firstValue) / firstValue * 100) : 0;
                            const totalRevenue = analytics.timeSeriesData.reduce((sum: number, item: any) => sum + item.value1, 0);
                            const totalOtherIncome = analytics.totalValue2;
                            const oiShare = totalRevenue > 0 ? ((totalOtherIncome / totalRevenue) * 100).toFixed(1) : "0.0";

                            if (analytics.isLongFactsYearSplit) {
                              const totalOiTs = analytics.totalExpensesTimeSeries ?? 0;
                              return `Revenue shows ${growth >= 0 ? "positive" : "negative"} change of ${growth.toFixed(1)}% from ${firstPeriod.name} to ${lastPeriod.name}. Total revenue was ${analytics.currency}${totalRevenue.toLocaleString()}, other income (by year, bars) ${analytics.currency}${totalOtherIncome.toLocaleString()} (~${oiShare}% of revenue), and other income in the Volume over time chart (green line) totals ${analytics.currency}${totalOiTs.toLocaleString()}. ${growth > 20 ? "Strong revenue momentum." : growth > 0 ? "Revenue is trending up." : "Review drivers behind the latest period."}`;
                            }
                            if (analytics.isWideCsvYearSplit) {
                              const totalExTs = analytics.totalExpensesTimeSeries ?? 0;
                              const oiShareBars = totalRevenue > 0 ? ((totalOtherIncome / totalRevenue) * 100).toFixed(1) : "0.0";
                              return `Revenue shows ${growth >= 0 ? "positive" : "negative"} change of ${growth.toFixed(1)}% from ${firstPeriod.name} to ${lastPeriod.name}. Total revenue was ${analytics.currency}${totalRevenue.toLocaleString()}, other income (by year, bars) ${analytics.currency}${totalOtherIncome.toLocaleString()} (~${oiShareBars}% of revenue), and expenses in the Volume over time chart (green line) total ${analytics.currency}${totalExTs.toLocaleString()}. ${growth > 20 ? "Strong revenue momentum." : growth > 0 ? "Revenue is trending up." : "Review drivers behind the latest period."}`;
                            }

                            const totalExpense = analytics.timeSeriesData.reduce((sum: number, item: any) => sum + item.value2, 0);
                            const profitMargin = totalRevenue > 0 ? ((totalRevenue - totalExpense) / totalRevenue * 100) : 0;
                            return `Your business shows ${growth >= 0 ? 'positive' : 'negative'} growth of ${growth.toFixed(1)}% from ${firstPeriod.name} to ${lastPeriod.name}. Total revenue reached ${analytics.currency}${totalRevenue.toLocaleString()} with a profit margin of ${profitMargin.toFixed(1)}%. ${growth > 20 ? 'Exceptional growth trajectory!' : growth > 10 ? 'Strong performance!' : growth > 0 ? 'Steady growth maintained.' : 'Performance needs attention.'}`;
                          })()}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Best & Worst Periods */}
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6">
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                          <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                            🏆 Best Performing Period
                          </h4>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {(() => {
                              const bestPeriod = [...analytics.timeSeriesData].sort((a: any, b: any) => b.value1 - a.value1)[0];
                              if (analytics.isLongFactsYearSplit) {
                                const topOi = [...analytics.topItems].sort((a, b) => b.value2 - a.value2)[0];
                                return `${bestPeriod.fullPeriod} had the highest revenue (${analytics.currency}${bestPeriod.value1.toLocaleString()}) and other income of ${analytics.currency}${bestPeriod.value2.toLocaleString()} in that period (Volume over time).${topOi && topOi.value2 > 0 ? ` Other income was largest in the year bars at ${topOi.name} (${analytics.currency}${topOi.value2.toLocaleString()}).` : ""}`;
                              }
                              if (analytics.isWideCsvYearSplit) {
                                const topOi = [...analytics.topItems].sort((a, b) => b.value2 - a.value2)[0];
                                return `${bestPeriod.fullPeriod} had the highest revenue (${analytics.currency}${bestPeriod.value1.toLocaleString()}) and expenses of ${analytics.currency}${bestPeriod.value2.toLocaleString()} in that period (Volume over time).${topOi && topOi.value2 > 0 ? ` Other income was largest in the year bars at ${topOi.name} (${analytics.currency}${topOi.value2.toLocaleString()}).` : ""}`;
                              }
                              const profit = bestPeriod.value1 - bestPeriod.value2;
                              const margin = bestPeriod.value1 > 0 ? ((profit / bestPeriod.value1) * 100) : 0;
                              return `${bestPeriod.name} achieved the highest revenue of ${analytics.currency}${bestPeriod.value1.toLocaleString()} with ${analytics.currency}${profit.toLocaleString()} profit (${margin.toFixed(1)}% margin).`;
                            })()}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6">
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                            ⚠️ Weakest Period
                          </h4>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {(() => {
                              const worstPeriod = [...analytics.timeSeriesData].sort((a: any, b: any) => a.value1 - b.value1)[0];
                              if (analytics.isLongFactsYearSplit) {
                                const lowOi = [...analytics.topItems].sort((a, b) => a.value2 - b.value2)[0];
                                return `${worstPeriod.fullPeriod} had the lowest revenue (${analytics.currency}${worstPeriod.value1.toLocaleString()}) and other income of ${analytics.currency}${worstPeriod.value2.toLocaleString()} in that period (Volume over time).${lowOi ? ` Smallest other-income bar: ${lowOi.name} (${analytics.currency}${lowOi.value2.toLocaleString()}).` : ""}`;
                              }
                              if (analytics.isWideCsvYearSplit) {
                                const lowOi = [...analytics.topItems].sort((a, b) => a.value2 - b.value2)[0];
                                return `${worstPeriod.fullPeriod} had the lowest revenue (${analytics.currency}${worstPeriod.value1.toLocaleString()}) and expenses of ${analytics.currency}${worstPeriod.value2.toLocaleString()} in that period (Volume over time).${lowOi ? ` Smallest other-income bar: ${lowOi.name} (${analytics.currency}${lowOi.value2.toLocaleString()}).` : ""}`;
                              }
                              const profit = worstPeriod.value1 - worstPeriod.value2;
                              const margin = worstPeriod.value1 > 0 ? ((profit / worstPeriod.value1) * 100) : 0;
                              return `${worstPeriod.name} had the lowest revenue of ${analytics.currency}${worstPeriod.value1.toLocaleString()} with ${analytics.currency}${profit.toLocaleString()} profit (${margin.toFixed(1)}% margin).`;
                            })()}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Trend Analysis */}
                  <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                        <Activity className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                          📈 Trend Analysis
                        </h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {(() => {
                            const values = analytics.timeSeriesData.map((d: any) => d.value1);
                            let increases = 0;
                            let decreases = 0;
                            
                            for (let i = 1; i < values.length; i++) {
                              if (values[i] > values[i - 1]) increases++;
                              else if (values[i] < values[i - 1]) decreases++;
                            }
                            
                            const trend = increases > decreases ? 'upward' : decreases > increases ? 'downward' : 'stable';
                            const consistency = increases / (values.length - 1);
                            
                            return `Revenue shows a ${trend} trend with ${increases} periods of growth and ${decreases} periods of decline. ${consistency > 0.7 ? 'Strong consistent growth pattern.' : consistency > 0.5 ? 'Generally positive direction with some fluctuations.' : 'Mixed performance with significant volatility.'}`;
                          })()}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Cost Efficiency */}
                  <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0">
                        <DollarSign className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                          {analytics.isLongFactsYearSplit || analytics.isWideCsvYearSplit
                            ? "💰 Revenue vs other income (by year)"
                            : "💰 Cost Efficiency"}
                        </h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {(() => {
                            const avgRevenue = analytics.timeSeriesData.reduce((sum: number, d: any) => sum + d.value1, 0) / analytics.timeSeriesData.length;
                            const avgSecond = analytics.timeSeriesData.reduce((sum: number, d: any) => sum + d.value2, 0) / analytics.timeSeriesData.length;

                            if (analytics.isLongFactsYearSplit) {
                              const ti = analytics.topItems;
                              const n = ti.length || 1;
                              const avgRevBar = ti.reduce((s, i) => s + i.value, 0) / n;
                              const avgOiBar = ti.reduce((s, i) => s + i.value2, 0) / n;
                              const avgShare = avgRevBar > 0 ? ((avgOiBar / avgRevBar) * 100).toFixed(1) : "0.0";
                              const highestOiYear = [...ti].sort((a, b) => b.value2 - a.value2)[0];
                              const peakShare =
                                highestOiYear && highestOiYear.value > 0
                                  ? ((highestOiYear.value2 / highestOiYear.value) * 100).toFixed(1)
                                  : "0.0";
                              const avgOiTs = analytics.totalExpensesTimeSeries != null
                                ? analytics.totalExpensesTimeSeries / analytics.timeSeriesData.length
                                : 0;
                              return `By year, average revenue is ${analytics.currency}${Math.round(avgRevBar).toLocaleString()} and average other income is ${analytics.currency}${Math.round(avgOiBar).toLocaleString()} (${avgShare}% of revenue). ${highestOiYear && highestOiYear.value2 > 0 ? `${highestOiYear.name} had the highest other income (${analytics.currency}${highestOiYear.value2.toLocaleString()}, ${peakShare}% of that year’s revenue). ` : ""}Average other income on the Volume over time chart (green line) is about ${analytics.currency}${Math.round(avgOiTs).toLocaleString()} per period.`;
                            }
                            if (analytics.isWideCsvYearSplit) {
                              const ti = analytics.topItems;
                              const n = ti.length || 1;
                              const avgRevBar = ti.reduce((s, i) => s + i.value, 0) / n;
                              const avgOiBar = ti.reduce((s, i) => s + i.value2, 0) / n;
                              const avgShare = avgRevBar > 0 ? ((avgOiBar / avgRevBar) * 100).toFixed(1) : "0.0";
                              const highestOiYear = [...ti].sort((a, b) => b.value2 - a.value2)[0];
                              const peakShare =
                                highestOiYear && highestOiYear.value > 0
                                  ? ((highestOiYear.value2 / highestOiYear.value) * 100).toFixed(1)
                                  : "0.0";
                              const avgExTs = analytics.totalExpensesTimeSeries != null
                                ? analytics.totalExpensesTimeSeries / analytics.timeSeriesData.length
                                : 0;
                              return `By year, average revenue is ${analytics.currency}${Math.round(avgRevBar).toLocaleString()} and average other income is ${analytics.currency}${Math.round(avgOiBar).toLocaleString()} (${avgShare}% of revenue). ${highestOiYear && highestOiYear.value2 > 0 ? `${highestOiYear.name} had the highest other income (${analytics.currency}${highestOiYear.value2.toLocaleString()}, ${peakShare}% of that year’s revenue). ` : ""}Average expenses on the Volume over time chart (green line) are about ${analytics.currency}${Math.round(avgExTs).toLocaleString()} per period.`;
                            }

                            const avgExpense = avgSecond;
                            const avgMargin = avgRevenue > 0 ? ((avgRevenue - avgExpense) / avgRevenue * 100) : 0;

                            const mostEfficientPeriod = [...analytics.timeSeriesData].sort((a: any, b: any) => {
                              const marginA = a.value1 > 0 ? ((a.value1 - a.value2) / a.value1) : 0;
                              const marginB = b.value1 > 0 ? ((b.value1 - b.value2) / b.value1) : 0;
                              return marginB - marginA;
                            })[0];

                            const bestMargin = mostEfficientPeriod.value1 > 0 ? ((mostEfficientPeriod.value1 - mostEfficientPeriod.value2) / mostEfficientPeriod.value1 * 100) : 0;

                            return `Average profit margin is ${avgMargin.toFixed(1)}% with average revenue of ${analytics.currency}${avgRevenue.toLocaleString()} and expenses of ${analytics.currency}${avgExpense.toLocaleString()}. ${mostEfficientPeriod.name} achieved the best margin of ${bestMargin.toFixed(1)}%.`;
                          })()}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Anomaly Detection */}
                  <div className="bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-yellow-950/30 dark:to-orange-950/30 border-2 border-yellow-200 dark:border-yellow-800 rounded-xl p-6">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center flex-shrink-0">
                        <AlertCircle className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-yellow-900 dark:text-yellow-100 mb-2">
                          🔍 Anomaly Detection
                        </h3>
                        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                          {(() => {
                            const values = analytics.timeSeriesData.map((d: any) => d.value1);
                            const avg = values.reduce((a: number, b: number) => a + b, 0) / values.length;
                            const stdDev = Math.sqrt(values.reduce((sum: number, val: number) => sum + Math.pow(val - avg, 2), 0) / values.length);
                            
                            const anomalies = analytics.timeSeriesData.filter((d: any) => {
                              const zScore = Math.abs((d.value1 - avg) / stdDev);
                              return zScore > 1.5;
                            });
                            
                            if (anomalies.length === 0) {
                              return `No significant anomalies detected. Your revenue pattern is consistent and predictable, which indicates stable business operations.`;
                            }
                            
                            const highAnomalies = anomalies.filter((d: any) => d.value1 > avg);
                            const lowAnomalies = anomalies.filter((d: any) => d.value1 < avg);
                            
                            const label = (d: any) => d.fullPeriod ?? d.name ?? d.period;
                            return `Detected ${anomalies.length} anomal${anomalies.length > 1 ? 'ies' : 'y'}: ${highAnomalies.length > 0 ? `${highAnomalies.map((a: any) => label(a)).join(', ')} showed exceptional performance` : ''}${highAnomalies.length > 0 && lowAnomalies.length > 0 ? ' while ' : ''}${lowAnomalies.length > 0 ? `${lowAnomalies.map((a: any) => label(a)).join(', ')} showed below-average performance` : ''}. ${anomalies.length > 2 ? 'Consider investigating factors that caused these variations.' : 'These outliers may indicate seasonal patterns or special events.'}`;
                          })()}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Actionable Recommendations */}
                  <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
                        <BarChart3 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                          💡 Actionable Recommendations
                        </h4>
                        <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                          {(() => {
                            const recommendations: string[] = [];
                            const firstPeriod = analytics.timeSeriesData[0];
                            const lastPeriod = analytics.timeSeriesData[analytics.timeSeriesData.length - 1];
                            const growth = firstPeriod.value1 > 0 ? ((lastPeriod.value1 - firstPeriod.value1) / firstPeriod.value1 * 100) : 0;
                            const totalRevenue = analytics.timeSeriesData.reduce((sum: number, item: any) => sum + item.value1, 0);
                            const totalSecond = analytics.timeSeriesData.reduce((sum: number, item: any) => sum + item.value2, 0);

                            if (analytics.isLongFactsYearSplit) {
                              const totalOI = analytics.totalValue2;
                              const oiShare = totalRevenue > 0 ? (totalOI / totalRevenue) * 100 : 0;
                              const totalOiLine = analytics.totalExpensesTimeSeries ?? 0;
                              if (growth < 5) {
                                recommendations.push(`Revenue growth is ${growth.toFixed(1)}% across the window — review drivers in weaker years.`);
                              }
                              if (oiShare > 15) {
                                recommendations.push(`Other income is a large share of revenue (~${oiShare.toFixed(1)}%) — confirm classification and recurring vs one-off items.`);
                              } else if (totalOI === 0 && totalOiLine === 0) {
                                recommendations.push(`No other-income facts in the dataset — re-upload the PDF after ingest, and ensure the statement includes a line such as “Other income” (now extracted as metric other_income).`);
                              } else if (totalOI > 0 && totalOiLine === 0) {
                                recommendations.push(`Other income appears in the year view but sums to zero on the time axis — check that each row’s period/year matches the chart’s date column.`);
                              }
                            } else if (analytics.isWideCsvYearSplit) {
                              const totalOI = analytics.totalValue2;
                              const oiShare = totalRevenue > 0 ? (totalOI / totalRevenue) * 100 : 0;
                              const totalExpLine = analytics.totalExpensesTimeSeries ?? 0;
                              if (growth < 5) {
                                recommendations.push(`Revenue growth is ${growth.toFixed(1)}% across the window — review drivers in weaker years.`);
                              }
                              if (oiShare > 15) {
                                recommendations.push(`Other income is a large share of revenue in the year bars (~${oiShare.toFixed(1)}%) — confirm classification and recurring vs one-off items.`);
                              } else if (totalOI === 0) {
                                recommendations.push(`No other-income columns detected for Top Year — add or rename headers (e.g. “Other income”) so they match non-core revenue rules.`);
                              }
                              if (totalExpLine === 0) {
                                recommendations.push(`No expense columns matched for the Volume over time green line — rename or add a column such as “Total Expenses”.`);
                              }
                            } else {
                              const totalExpense = totalSecond;
                              const profitMargin = totalRevenue > 0 ? ((totalRevenue - totalExpense) / totalRevenue * 100) : 0;

                              if (growth < 5) {
                                recommendations.push(`Focus on growth strategies - current growth rate of ${growth.toFixed(1)}% needs improvement`);
                              }

                              if (profitMargin < 20) {
                                recommendations.push(`Optimize cost structure - profit margin of ${profitMargin.toFixed(1)}% is below industry standards`);
                              } else if (profitMargin > 40) {
                                recommendations.push(`Excellent profitability - consider reinvesting in growth initiatives`);
                              }
                            }

                            const worstPeriod = [...analytics.timeSeriesData].sort((a: any, b: any) => a.value1 - b.value1)[0];
                            recommendations.push(`Investigate factors that affected performance in ${worstPeriod.fullPeriod ?? worstPeriod.period} to prevent similar downturns`);

                            const bestPeriod = [...analytics.timeSeriesData].sort((a: any, b: any) => b.value1 - a.value1)[0];
                            recommendations.push(`Replicate success factors from ${bestPeriod.fullPeriod ?? bestPeriod.period} in future periods`);

                            return recommendations.map((rec, idx) => (
                              <li key={idx} className="flex items-start gap-2">
                                <span className="text-indigo-600 dark:text-indigo-400 mt-0.5">•</span>
                                <span>{rec}</span>
                              </li>
                            ));
                          })()}
                        </ul>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-8 shadow-sm text-center">
                  <Activity className="w-16 h-16 mx-auto mb-4 text-green-600 dark:text-green-400" />
                  <h3 className="text-gray-900 dark:text-gray-100 text-xl font-semibold mb-2">No Data Available</h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    Upload your financial data to see AI-powered insights including anomaly detection, pattern recognition, and actionable recommendations.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}