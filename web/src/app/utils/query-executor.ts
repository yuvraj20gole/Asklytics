import type { DataRow } from "../types/data";

export interface QueryResult {
  sql: string;
  table: DataRow[];
  chartData: Array<{ name: string; [key: string]: any }>; // Support multiple metrics
  message: string;
  chartType?: "line" | "bar" | "multi-line" | "multi-bar"; // Support multi-metric charts
  insight?: string; // AI-generated insight
  metrics?: string[]; // List of metrics being displayed
}

// Detect currency from data - FORCE INR for consistency
function detectCurrency(data: DataRow[]): string {
  // ALWAYS use INR for consistency
  return '₹';
}

// Financial keywords mapping
const FINANCIAL_KEYWORDS: Record<string, string[]> = {
  profit: ["profit", "net income", "earnings", "net profit", "pbt", "profit before tax"],
  revenue: ["revenue", "sales", "income", "turnover", "receipts", "operations"],
  expense: ["expense", "cost", "expenditure", "spending", "outlay", "cost of", "operating expense"],
  tax: ["tax", "taxation", "income tax"],
  loss: ["loss", "deficit", "negative"],
  year: ["year", "fy", "fiscal year"],
  month: ["month", "period"],
  quarter: ["quarter", "q1", "q2", "q3", "q4"],
  category: ["category", "type", "class", "department", "division"],
  product: ["product", "item", "sku"],
  customer: ["customer", "client", "account"],
};

// NEW: Strict column detection using keyword matching
function detectColumn(input: string, columns: string[], type: keyof typeof FINANCIAL_KEYWORDS): string | null {
  const keywords = FINANCIAL_KEYWORDS[type];
  const lowerInput = input.toLowerCase();
  
  // First, check if user explicitly mentioned a column name
  for (const col of columns) {
    if (lowerInput.includes(col.toLowerCase())) {
      // Check if this column matches the type we're looking for
      const colLower = col.toLowerCase();
      if (keywords.some(k => colLower.includes(k))) {
        return col;
      }
    }
  }
  
  // Then search for columns by keywords
  return findBestColumn(columns, keywords);
}

function findBestColumn(columns: string[], keywords: string[]): string | null {
  const lowerColumns = columns.map((col) => col.toLowerCase());
  
  for (const keyword of keywords) {
    const found = columns.find((col, idx) => 
      lowerColumns[idx].includes(keyword.toLowerCase())
    );
    if (found) return found;
  }
  
  return null;
}

function isNumericColumn(data: DataRow[], column: string): boolean {
  return data.some((row) => typeof row[column] === "number" && !isNaN(row[column] as number));
}

function isYearColumn(column: string): boolean {
  return /^year$/i.test(column.toLowerCase()) || 
         /year$/i.test(column.toLowerCase()) ||
         /^fy$/i.test(column.toLowerCase());
}

// NEW: Validate that a column actually contains year values
function containsYearValues(data: DataRow[], column: string): boolean {
  const values = data.map(row => row[column]).filter(v => v != null);
  if (values.length === 0) return false;
  
  // Check if values are 4-digit numbers (years like 2020, 2021, etc.) OR FY format (FY 2019, FY 2020)
  const yearPattern = /^(19|20)\d{2}$/;
  const fyPattern = /^FY\s*(19|20)\d{2}$/i;
  const yearCount = values.filter(v => {
    const str = String(v).trim();
    return yearPattern.test(str) || fyPattern.test(str);
  }).length;
  
  // At least 50% of values should be year-like
  return yearCount / values.length >= 0.5;
}

// NEW: Smart year column finder that validates content
function findYearColumn(data: DataRow[], columns: string[]): string | null {
  // First try columns with "year" in the name
  const yearNamedColumns = columns.filter(col => isYearColumn(col));
  for (const col of yearNamedColumns) {
    if (containsYearValues(data, col)) {
      return col;
    }
  }
  
  // Then try any column that contains year values
  for (const col of columns) {
    if (containsYearValues(data, col)) {
      return col;
    }
  }
  
  return null;
}

export function executeQuery(
  userInput: string,
  data: DataRow[],
  columns: string[]
): QueryResult {
  const lowerInput = userInput.toLowerCase();

  // Categorize columns
  const numericColumns = columns.filter((col) => isNumericColumn(data, col));
  const textColumns = columns.filter((col) => !numericColumns.includes(col));

  console.log("🔍 Query Analysis:", {
    input: userInput,
    numericColumns,
    textColumns,
    allColumns: columns
  });

  // Detect query intent
  const wantsTotal = lowerInput.includes("total") || lowerInput.includes("sum");
  const wantsAverage = lowerInput.includes("average") || lowerInput.includes("avg") || lowerInput.includes("mean");
  const wantsCount = lowerInput.includes("count") || lowerInput.includes("number of") || lowerInput.includes("how many");
  const wantsTop = lowerInput.includes("top") || lowerInput.includes("highest") || lowerInput.includes("best") || lowerInput.includes("maximum") || lowerInput.includes("most") || lowerInput.includes("good") || lowerInput.includes("great") || lowerInput.includes("strong");
  const wantsBottom = lowerInput.includes("bottom") || lowerInput.includes("lowest") || lowerInput.includes("worst") || lowerInput.includes("minimum") || lowerInput.includes("least") || lowerInput.includes("bad") || lowerInput.includes("poor") || lowerInput.includes("weak");
  const wantsGrouping = lowerInput.includes("by ") || lowerInput.includes("each") || lowerInput.includes("per") || 
                        lowerInput.includes("breakdown") || lowerInput.includes("group");
  
  // Detect WHICH questions (asking for a specific item, not a list)
  // Expanded detection for singular answer queries
  const asksWhich = lowerInput.includes("which") || 
                    (lowerInput.includes("what") && (wantsTop || wantsBottom));
  const asksForThe = lowerInput.match(/\b(the|a|an)\s+(highest|lowest|best|worst|top|bottom|maximum|minimum)/);
  const asksTellMe = (lowerInput.includes("tell me") || lowerInput.includes("show me") || lowerInput.includes("give me")) && 
                     (wantsTop || wantsBottom);
  const hasExplicitNumber = /top\s+\d+|bottom\s+\d+|first\s+\d+|last\s+\d+/i.test(lowerInput);
  
  // Want single answer if:
  // 1. Uses "which/what" with superlative, OR
  // 2. Uses "the/a/an" + superlative (e.g., "the highest"), OR  
  // 3. Uses "tell/show/give me" + superlative, OR
  // 4. BUT NOT if they specify a number (e.g., "top 5")
  const wantsSingleAnswer = ((asksWhich || asksForThe || asksTellMe) && (wantsTop || wantsBottom)) && !hasExplicitNumber;
  
  // Financial intent detection
  const mentionsProfit = lowerInput.includes("profit") || lowerInput.includes("earnings") || lowerInput.includes("net income");
  const mentionsRevenue = lowerInput.includes("revenue") || lowerInput.includes("sales") || lowerInput.includes("income");
  const mentionsExpense = lowerInput.includes("expense") || lowerInput.includes("cost") || lowerInput.includes("expenditure");
  const mentionsLoss = lowerInput.includes("loss") || lowerInput.includes("lost") || lowerInput.includes("deficit") || lowerInput.includes("negative");

  // NEW: Enhanced intent detection
  const wantsComparison = lowerInput.includes("compare") || lowerInput.includes("vs") || 
                          lowerInput.includes("versus") || lowerInput.includes("and");
  const wantsGrowth = lowerInput.includes("growth") || lowerInput.includes("growth rate") || 
                      lowerInput.includes("increase") || lowerInput.includes("decrease") ||
                      lowerInput.includes("yoy") || lowerInput.includes("y-o-y") ||
                      lowerInput.includes("year over year") || lowerInput.includes("year-over-year") ||
                      lowerInput.includes("trend %") || lowerInput.includes("growth %");
  const wantsSummary = lowerInput.includes("summary") || lowerInput.includes("complete") || 
                       lowerInput.includes("overall") || lowerInput.includes("full picture") ||
                       lowerInput.includes("everything") || lowerInput.includes("all metrics");
  const wantsInsight = lowerInput.includes("why") || lowerInput.includes("analyze") || 
                       lowerInput.includes("analysis") || lowerInput.includes("explain") ||
                       lowerInput.includes("best") || lowerInput.includes("worst");
  const wantsMargin = lowerInput.includes("margin") || lowerInput.includes("percentage");

  // Detect trend query early (needed for column detection)
  const isTrendQuery = 
    lowerInput.includes("trend") || 
    lowerInput.includes("over time") || 
    lowerInput.includes("over years") || 
    lowerInput.includes("over months") || 
    lowerInput.includes("growth") || 
    lowerInput.includes("progression");

  console.log("🎯 Query Intent:", {
    wantsTotal, wantsAverage, wantsCount, wantsTop, wantsBottom, wantsGrouping,
    mentionsProfit, mentionsRevenue, mentionsExpense, mentionsLoss,
    asksWhich, wantsSingleAnswer, isTrendQuery,  // ADD isTrendQuery
    wantsComparison, wantsGrowth, wantsSummary, wantsInsight, wantsMargin // NEW
  });

  console.log("🔍 Comparison Check:", {
    wantsComparison,
    mentionsRevenue,
    mentionsExpense,
    willTriggerComparison: wantsComparison && (mentionsRevenue || mentionsExpense)
  });

  // Find relevant columns
  let valueColumn: string | null = null;
  let groupColumn: string | null = null;

  // Priority 1: Find columns mentioned in the query
  for (const col of columns) {
    const colLower = col.toLowerCase();
    if (lowerInput.includes(colLower)) {
      if (isNumericColumn(data, col) && !isYearColumn(col) && !valueColumn) {
        valueColumn = col;
        console.log("✅ Found value column from query:", col);
      } else if (!isNumericColumn(data, col) && !groupColumn) {
        groupColumn = col;
        console.log("✅ Found group column from query:", col);
      }
    }
  }

  // Priority 2: Smart financial column detection
  if (!valueColumn) {
    if (mentionsLoss) {
      valueColumn = findBestColumn(columns, FINANCIAL_KEYWORDS.loss) || 
                    findBestColumn(columns, FINANCIAL_KEYWORDS.expense);
    } else if (mentionsProfit) {
      valueColumn = findBestColumn(columns, FINANCIAL_KEYWORDS.profit);
    } else if (mentionsRevenue) {
      valueColumn = findBestColumn(columns, FINANCIAL_KEYWORDS.revenue);
    } else if (mentionsExpense) {
      valueColumn = findBestColumn(columns, FINANCIAL_KEYWORDS.expense);
    }
    
    // Fallback to first numeric non-year column
    if (!valueColumn) {
      valueColumn = numericColumns.find(col => !isYearColumn(col)) || numericColumns[0];
    }
    console.log("💡 Smart detected value column:", valueColumn);
  }

  // Priority 3: Find grouping column - MORE AGGRESSIVE
  if (!groupColumn) {
    // SPECIAL: For trend queries, prioritize finding a VALID year column
    if (isTrendQuery) {
      const validYearCol = findYearColumn(data, columns);
      if (validYearCol) {
        groupColumn = validYearCol;
        console.log("📅 Found validated year column for trend:", groupColumn);
      }
    }
    
    // If query wants grouping OR mentions specific grouping keywords
    if (!groupColumn && (wantsGrouping || wantsTop || wantsBottom || 
        lowerInput.includes("show") || lowerInput.includes("what") || lowerInput.includes("which"))) {
      // Look for year/month/category mentions
      const potentialYear = findBestColumn(columns, FINANCIAL_KEYWORDS.year);
      
      // Validate year column actually contains years
      if (potentialYear && containsYearValues(data, potentialYear)) {
        groupColumn = potentialYear;
      } else {
        // Try other grouping options
        groupColumn = 
          findBestColumn(columns, FINANCIAL_KEYWORDS.month) ||
          findBestColumn(columns, FINANCIAL_KEYWORDS.category) ||
          findBestColumn(columns, FINANCIAL_KEYWORDS.product) ||
          findBestColumn(columns, FINANCIAL_KEYWORDS.customer) ||
          textColumns[0]; // Default to first text column
      }
      
      console.log("💡 Auto-detected group column:", groupColumn);
    }
  }

  // FORCE GROUPING: If we have both columns but no grouping, assume user wants grouping
  if (valueColumn && !groupColumn && textColumns.length > 0) {
    groupColumn = textColumns[0];
    console.log("🔧 Forcing group column (default behavior):", groupColumn);
  }

  // Handle special case: simple total without grouping
  if (wantsTotal && !wantsGrouping && valueColumn) {
    const total = data.reduce((sum, row) => sum + (Number(row[valueColumn!]) || 0), 0);
    
    const results = [{ metric: "Total", value: total }];
    
    const sql = `SELECT SUM(${valueColumn}) as total FROM uploaded_data;`;
    const currency = detectCurrency(data);
    const message = `The total ${valueColumn} is ${currency}${total.toLocaleString()}`;
    
    const insight = `Total ${valueColumn} across all records is ${currency}${total.toLocaleString()}. This represents the complete sum of ${data.length} data entries.`;
    
    return {
      sql,
      table: [{ "Metric": "Total", [valueColumn]: `${currency}${total.toLocaleString()}` }],
      chartData: [{ name: "Total", sales: total }],
      message,
      insight,
      chartType: "bar",
    };
  }

  // NEW: Handle comprehensive financial summary - HIGHEST PRIORITY
  if (wantsSummary) {
    console.log("🎯 SUMMARY QUERY DETECTED - EXECUTING COMPREHENSIVE SUMMARY");
    
    const revenueCol = findBestColumn(columns, FINANCIAL_KEYWORDS.revenue);
    const expenseCol = findBestColumn(columns, FINANCIAL_KEYWORDS.expense);
    const profitCol = findBestColumn(columns, FINANCIAL_KEYWORDS.profit);
    const yearCol = findYearColumn(data, columns);
    
    console.log("📊 Summary columns found:", { revenueCol, expenseCol, profitCol, yearCol });
    
    if (revenueCol && expenseCol && yearCol) {
      // Calculate comprehensive metrics
      const totalRevenue = data.reduce((sum, row) => sum + (Number(row[revenueCol]) || 0), 0);
      const totalExpense = data.reduce((sum, row) => sum + (Number(row[expenseCol]) || 0), 0);
      const totalProfit = totalRevenue - totalExpense;
      const overallMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
      
      // Group by year to calculate growth and find best year
      const grouped = calculateProfit(data, yearCol, revenueCol, expenseCol);
      const yearlyData = Object.entries(grouped)
        .map(([year, values]) => ({
          year,
          revenue: values.revenue,
          expense: values.expense,
          profit: values.revenue - values.expense,
          margin: calculateProfitMargin(values.revenue - values.expense, values.revenue),
        }))
        .sort((a, b) => String(a.year).localeCompare(String(b.year))); // CHRONOLOGICAL SORT
      
      console.log("📅 Yearly data (sorted):", yearlyData);
      
      // Calculate average growth
      const revenueByYear = yearlyData.map(y => y.revenue);
      let totalGrowth = 0;
      let growthCount = 0;
      
      for (let i = 1; i < revenueByYear.length; i++) {
        if (revenueByYear[i - 1] > 0) {
          const growth = ((revenueByYear[i] - revenueByYear[i - 1]) / revenueByYear[i - 1]) * 100;
          totalGrowth += growth;
          growthCount++;
        }
      }
      
      const avgGrowth = growthCount > 0 ? totalGrowth / growthCount : 0;
      
      console.log("📈 Average growth:", avgGrowth, "from", growthCount, "periods");
      
      // Find best year using composite scoring
      let bestYear = yearlyData[0];
      let bestScore = -Infinity;
      
      yearlyData.forEach(yearData => {
        // Composite score: profit (50%) + margin (30%) + growth (20%)
        const profitScore = yearData.profit;
        const marginScore = yearData.margin * totalRevenue / 100; // Normalize margin
        
        // Calculate this year's growth
        const yearIndex = yearlyData.indexOf(yearData);
        let growthScore = 0;
        if (yearIndex > 0 && yearlyData[yearIndex - 1].revenue > 0) {
          const growth = ((yearData.revenue - yearlyData[yearIndex - 1].revenue) / yearlyData[yearIndex - 1].revenue) * 100;
          growthScore = growth * totalRevenue / 100; // Normalize growth
        }
        
        const compositeScore = (profitScore * 0.5) + (marginScore * 0.3) + (growthScore * 0.2);
        
        console.log(`🏆 ${yearData.year} score: ${compositeScore} (profit: ${profitScore}, margin: ${marginScore}, growth: ${growthScore})`);
        
        if (compositeScore > bestScore) {
          bestScore = compositeScore;
          bestYear = yearData;
        }
      });
      
      const currency = detectCurrency(data);
      
      // Build summary table
      const summaryTable = [
        { "Metric": "Total Revenue", "Value": `${currency}${totalRevenue.toLocaleString()}` },
        { "Metric": "Total Expenses", "Value": `${currency}${totalExpense.toLocaleString()}` },
        { "Metric": "Total Profit", "Value": `${currency}${totalProfit.toLocaleString()}` },
        { "Metric": "Overall Margin", "Value": `${overallMargin.toFixed(1)}%` },
        { "Metric": "Average Growth", "Value": `${avgGrowth > 0 ? '+' : ''}${avgGrowth.toFixed(1)}%` },
        { "Metric": "Best Year", "Value": `${bestYear.year} (${currency}${bestYear.profit.toLocaleString()} profit, ${bestYear.margin.toFixed(1)}% margin)` },
      ];
      
      // Chart data showing yearly breakdown
      const chartData = yearlyData.map(y => ({
        name: String(y.year),
        Revenue: y.revenue,
        Expense: y.expense,
        Profit: y.profit,
      }));
      
      // SQL representation
      const sql = `-- Financial Summary\nSELECT \n  SUM(${revenueCol}) as total_revenue,\n  SUM(${expenseCol}) as total_expense,\n  SUM(${revenueCol}) - SUM(${expenseCol}) as total_profit,\n  ROUND(((SUM(${revenueCol}) - SUM(${expenseCol})) / SUM(${revenueCol})) * 100, 1) as overall_margin\nFROM uploaded_data;\n\n-- Yearly Breakdown\nSELECT \n  ${yearCol},\n  SUM(${revenueCol}) as revenue,\n  SUM(${expenseCol}) as expense,\n  SUM(${revenueCol}) - SUM(${expenseCol}) as profit\nFROM uploaded_data\nGROUP BY ${yearCol}\nORDER BY ${yearCol};`;
      
      // Comprehensive insight with correct trend
      const firstYear = yearlyData[0];
      const lastYear = yearlyData[yearlyData.length - 1];
      const trendDirection = lastYear.revenue > firstYear.revenue ? "growth" : "decline";
      const trendDescription = lastYear.revenue > firstYear.revenue ? "increasing" : "declining";
      
      const insight = `Complete Financial Summary: Total revenue of ${currency}${totalRevenue.toLocaleString()} with ${currency}${totalExpense.toLocaleString()} in expenses, resulting in ${currency}${totalProfit.toLocaleString()} profit (${overallMargin.toFixed(1)}% margin). Revenue shows ${trendDescription} trend from ${firstYear.year} to ${lastYear.year} with average year-over-year growth of ${avgGrowth > 0 ? '+' : ''}${avgGrowth.toFixed(1)}%. ${bestYear.year} was the best performing year with ${currency}${bestYear.profit.toLocaleString()} profit and ${bestYear.margin.toFixed(1)}% margin, driven by strong profitability${avgGrowth > 0 ? ' and consistent growth' : ''}.`;
      
      console.log("✅ SUMMARY COMPLETE - Returning comprehensive financial summary");
      
      return {
        sql,
        table: summaryTable,
        chartData,
        message: "Here is your comprehensive financial summary:",
        chartType: "multi-bar",
        insight,
        metrics: ["Revenue", "Expense", "Profit"],
      };
    }
    
    // Fallback if we can't find all required columns for summary
    console.log("⚠️ Summary requested but required columns not found");
  }

  // Handle calculation queries (profit = revenue - expense)
  if (mentionsProfit && mentionsRevenue && mentionsExpense) {
    const revenueCol = findBestColumn(columns, FINANCIAL_KEYWORDS.revenue);
    const expenseCol = findBestColumn(columns, FINANCIAL_KEYWORDS.expense);
    
    if (revenueCol && expenseCol && groupColumn) {
      // Group by and calculate profit
      const grouped = calculateProfit(data, groupColumn, revenueCol, expenseCol);
      const results = Object.entries(grouped)
        .map(([key, values]) => ({
          [groupColumn!]: key,
          profit: values.revenue - values.expense,
          revenue: values.revenue,
          expense: values.expense,
        }))
        .sort((a, b) => b.profit - a.profit)
        .slice(0, 10);

      const sql = `SELECT \n  ${groupColumn},\n  SUM(${revenueCol}) - SUM(${expenseCol}) as profit,\n  SUM(${revenueCol}) as revenue,\n  SUM(${expenseCol}) as expense\nFROM uploaded_data\nGROUP BY ${groupColumn}\nORDER BY profit DESC\nLIMIT 10;`;

      const currency = detectCurrency(results);

      const formattedTable = results.map((row) => ({
        [groupColumn!]: row[groupColumn],
        "Profit": `${currency}${row.profit.toLocaleString()}`,
        "Revenue": `${currency}${row.revenue.toLocaleString()}`,
        "Expense": `${currency}${row.expense.toLocaleString()}`,
      }));

      const chartData = results.map((row) => ({
        name: String(row[groupColumn]),
        sales: row.profit,
      }));

      const insight = generateInsight(
        results,
        groupColumn,
        ["revenue", "expense"],
        lowerInput,
        currency
      );

      return {
        sql,
        table: formattedTable,
        chartData,
        message: `Here is the profit (revenue - expense) breakdown by ${groupColumn}:`,
        insight,
        chartType: "bar",
      };
    }
  }

  // NEW: Handle growth rate queries - PRIORITY BEFORE COMPARISON
  if (wantsGrowth && !wantsSummary && groupColumn && valueColumn) {
    console.log("🎯 GROWTH QUERY DETECTED - Calculating year-over-year growth");
    
    const resultsWithGrowth = calculateGrowthRate(data, groupColumn, valueColumn);
    
    console.log("📈 Growth results (first 3):", resultsWithGrowth.slice(0, 3));
    
    const sql = `SELECT \n  ${groupColumn},\n  SUM(${valueColumn}) as ${valueColumn},\n  ROUND(((SUM(${valueColumn}) - LAG(SUM(${valueColumn})) OVER (ORDER BY ${groupColumn})) / LAG(SUM(${valueColumn})) OVER (ORDER BY ${groupColumn})) * 100, 1) as growth_rate\nFROM uploaded_data\nGROUP BY ${groupColumn}\nORDER BY ${groupColumn} ASC;`;
    
    const currency = detectCurrency(resultsWithGrowth);
    
    const formattedTable = resultsWithGrowth.map((row) => ({
      [groupColumn]: row[groupColumn],
      [valueColumn]: `${currency}${(row[valueColumn] as number).toLocaleString()}`,
      "Growth Rate": row.growth === 0 ? "—" : `${row.growth > 0 ? '+' : ''}${row.growth}%`,
    }));

    const chartData = resultsWithGrowth.map((row) => ({
      name: String(row[groupColumn]),
      [valueColumn]: row[valueColumn],
      "Growth %": row.growth,
    }));

    const insight = generateInsight(
      resultsWithGrowth,
      groupColumn,
      valueColumn,
      lowerInput,
      currency
    );

    console.log("✅ GROWTH QUERY COMPLETE");

    return {
      sql,
      table: formattedTable,
      chartData,
      message: `Here is the year-over-year growth rate for ${valueColumn}:`,
      chartType: "multi-line",
      insight,
      metrics: [valueColumn, "Growth Rate"],
    };
  }

  // NEW: Handle multi-metric comparison queries (compare revenue and expenses)
  // Only trigger if NOT a growth query
  if (!wantsGrowth && wantsComparison && (mentionsRevenue || mentionsExpense)) {
    console.log("🎯 COMPARISON QUERY DETECTED");
    
    // Use strict column detection
    const revenueCol = detectColumn(lowerInput, columns, "revenue");
    const expenseCol = detectColumn(lowerInput, columns, "expense");
    
    // Ensure group column is set (prioritize Year)
    if (!groupColumn) {
      const yearCol = findYearColumn(data, columns);
      if (yearCol) {
        groupColumn = yearCol;
        console.log("📅 Auto-selected Year column for comparison:", groupColumn);
      } else {
        groupColumn = textColumns[0];
      }
    }
    
    console.log("🔍 Multi-Metric Detection:", {
      revenueCol,
      expenseCol,
      groupColumn,
      query: lowerInput
    });
    
    if (revenueCol && expenseCol && groupColumn) {
      // Group by and calculate both metrics
      const grouped = calculateProfit(data, groupColumn, revenueCol, expenseCol);
      
      // Sort by time if time-based
      const isTimeBased = isYearColumn(groupColumn) || /month|quarter|period|date/i.test(groupColumn);
      
      const results = Object.entries(grouped)
        .map(([key, values]) => ({
          [groupColumn!]: key,
          revenue: values.revenue,
          expense: values.expense,
          profit: values.revenue - values.expense,
          margin: calculateProfitMargin(values.revenue - values.expense, values.revenue),
        }))
        .sort((a, b) => {
          if (isTimeBased) {
            return String(a[groupColumn]).localeCompare(String(b[groupColumn]));
          }
          return b.revenue - a.revenue;
        })
        .slice(0, 10);

      console.log("✅ Query Results (First 3):", results.slice(0, 3));

      const sql = `SELECT \n  ${groupColumn},\n  SUM(${revenueCol}) as revenue,\n  SUM(${expenseCol}) as expense,\n  SUM(${revenueCol}) - SUM(${expenseCol}) as profit,\n  ROUND(((SUM(${revenueCol}) - SUM(${expenseCol})) / SUM(${revenueCol})) * 100, 2) as profit_margin\nFROM uploaded_data\nGROUP BY ${groupColumn}\nORDER BY ${isTimeBased ? groupColumn : 'revenue'} ${isTimeBased ? 'ASC' : 'DESC'}\nLIMIT 10;`;

      const currency = detectCurrency(results);
      
      const formattedTable = results.map((row) => ({
        [groupColumn!]: row[groupColumn],
        "Revenue": `${currency}${row.revenue.toLocaleString()}`,
        "Expense": `${currency}${row.expense.toLocaleString()}`,
        "Profit": `${currency}${row.profit.toLocaleString()}`,
        "Margin": `${row.margin.toFixed(1)}%`,
      }));

      // Multi-metric chart data - use actual metric names
      const chartData = results.map((row) => ({
        name: String(row[groupColumn]),
        Revenue: row.revenue,
        Expense: row.expense,
        Profit: row.profit,
      }));

      console.log("📊 Chart Data (First 3):", chartData.slice(0, 3));

      const insight = generateInsight(
        results,
        groupColumn,
        ["revenue", "expense"],  // Use generic names for insight generation
        lowerInput,
        currency
      );

      console.log("💡 Generated Insight:", insight);

      return {
        sql,
        table: formattedTable,
        chartData,
        message: `Here is the comparison of ${revenueCol} and ${expenseCol} by ${groupColumn}:`,
        chartType: isTimeBased ? "multi-line" : "multi-bar",
        insight,
        metrics: [revenueCol, expenseCol, "Profit"],
      };
    }
  }

  // Handle grouped queries
  if (groupColumn && valueColumn) {
    let results: DataRow[] = [];
    let sql = "";
    let message = "";

    // Detect if groupColumn is time-based (year, month, quarter)
    const isTimeBased = 
      isYearColumn(groupColumn) ||
      /month/i.test(groupColumn) ||
      /quarter/i.test(groupColumn) ||
      /period/i.test(groupColumn) ||
      /date/i.test(groupColumn);
    
    const useLineChart = isTimeBased || isTrendQuery;

    if (wantsTotal) {
      // Group by and sum
      const grouped = groupBy(data, groupColumn, valueColumn, "sum");
      results = Object.entries(grouped)
        .map(([key, value]) => ({
          [groupColumn]: key,
          [`total_${valueColumn}`]: value,
        }))
        .sort((a, b) => (b[`total_${valueColumn}`] as number) - (a[`total_${valueColumn}`] as number))
        .slice(0, 10);

      sql = `SELECT 
  ${groupColumn},
  SUM(${valueColumn}) as total_${valueColumn}
FROM uploaded_data
GROUP BY ${groupColumn}
ORDER BY total_${valueColumn} DESC
LIMIT 10;`;

      message = `Here are the total ${valueColumn} grouped by ${groupColumn}:`;
    } else if (wantsAverage) {
      // Group by and average
      const grouped = groupBy(data, groupColumn, valueColumn, "avg");
      results = Object.entries(grouped)
        .map(([key, value]) => ({
          [groupColumn]: key,
          [`avg_${valueColumn}`]: Math.round(value),
        }))
        .sort((a, b) => (b[`avg_${valueColumn}`] as number) - (a[`avg_${valueColumn}`] as number))
        .slice(0, 10);

      sql = `SELECT 
  ${groupColumn},
  AVG(${valueColumn}) as avg_${valueColumn}
FROM uploaded_data
GROUP BY ${groupColumn}
ORDER BY avg_${valueColumn} DESC
LIMIT 10;`;

      message = `Here are the average ${valueColumn} by ${groupColumn}:`;
    } else if (wantsCount) {
      // Count by group
      const grouped = countBy(data, groupColumn);
      results = Object.entries(grouped)
        .map(([key, value]) => ({
          [groupColumn]: key,
          count: value,
        }))
        .sort((a, b) => (b.count as number) - (a.count as number))
        .slice(0, 10);

      sql = `SELECT 
  ${groupColumn},
  COUNT(*) as count
FROM uploaded_data
GROUP BY ${groupColumn}
ORDER BY count DESC
LIMIT 10;`;

      message = `Here is the count by ${groupColumn}:`;
    } else {
      // Default: sum and group
      const grouped = groupBy(data, groupColumn, valueColumn, "sum");
      results = Object.entries(grouped)
        .map(([key, value]) => ({
          [groupColumn]: key,
          [valueColumn]: value,
        }))
        .sort((a, b) => {
          // OVERRIDE: If asking "which/what" with "highest/lowest", always sort by value
          if (wantsSingleAnswer) {
            if (wantsBottom) return (a[valueColumn] as number) - (b[valueColumn] as number);
            // Default to highest
            return (b[valueColumn] as number) - (a[valueColumn] as number);
          }
          
          // For time-based data WITHOUT superlative, sort by key (year/month)
          if (isTimeBased && !wantsTop && !wantsBottom) {
            const keyA = String(a[groupColumn]);
            const keyB = String(b[groupColumn]);
            return keyA.localeCompare(keyB);
          }
          
          // Sort by value
          if (wantsTop) return (b[valueColumn] as number) - (a[valueColumn] as number);
          if (wantsBottom) return (a[valueColumn] as number) - (b[valueColumn] as number);
          return (b[valueColumn] as number) - (a[valueColumn] as number);
        })
        .slice(0, wantsSingleAnswer ? 1 : 10); // Only 1 result if asking "which"

      // Build appropriate SQL and message
      const orderDirection = (wantsSingleAnswer && !wantsBottom) || wantsTop ? "DESC" : 
                             (wantsSingleAnswer && wantsBottom) || wantsBottom ? "ASC" : 
                             (isTimeBased ? "ASC" : "DESC");
      const limit = wantsSingleAnswer ? 1 : 10;

      sql = `SELECT \n  ${groupColumn},\n  SUM(${valueColumn}) as ${valueColumn}\nFROM uploaded_data\nGROUP BY ${groupColumn}\nORDER BY ${valueColumn} ${orderDirection}\nLIMIT ${limit};`;

      // Generate appropriate message
      if (wantsSingleAnswer && results.length > 0) {
        const topResult = results[0];
        const yearValue = topResult[groupColumn];
        const profitValue = topResult[valueColumn];
        const currency = detectCurrency(results);
        message = `You earned the ${wantsBottom ? "lowest" : "highest"} ${valueColumn} in ${yearValue} with ${currency}${(profitValue as number).toLocaleString()}`;
      } else {
        message = `Here are your results by ${valueColumn}:`;
      }
    }

    // Format table and chart
    const formattedTable = formatTable(results);
    const chartData = formatChart(results);

    console.log("📊 Chart formatting:", {
      resultsLength: results.length,
      sampleResult: results[0],
      chartDataLength: chartData.length,
      sampleChartData: chartData[0],
      useLineChart
    });

    // NEW: Generate insight
    const currency = detectCurrency(results);
    const insight = generateInsight(
      results,
      groupColumn,
      valueColumn,
      lowerInput,
      currency
    );

    console.log("💡 Generated Insight for regular query:", insight);

    return { 
      sql, 
      table: formattedTable, 
      chartData, 
      message,
      chartType: useLineChart ? "line" : "bar", // NEW: specify chart type
      insight,
      metrics: [valueColumn],
    };
  }

  // Fallback: just show top 10 rows
  const results = data.slice(0, 10);
  const sql = `SELECT * FROM uploaded_data LIMIT 10;`;
  const message = "Here is a sample of your data:";

  // Try to generate a simple chart from the sample data
  let chartData: Array<{ name: string; sales: number }> = [];
  if (results.length > 0 && valueColumn) {
    chartData = results.map((row, idx) => ({
      name: String(row[columns[0]] || `Row ${idx + 1}`).slice(0, 20),
      sales: Number(row[valueColumn]) || 0,
    }));
  }

  // Generate insight for fallback data
  const currency = detectCurrency(results);
  const fallbackInsight = generateFallbackInsight(results, columns, valueColumn, currency);

  return {
    sql,
    table: results,
    chartData,
    message,
    chartType: "bar",
    insight: fallbackInsight,
  };
}

function groupBy(
  data: DataRow[],
  groupCol: string,
  valueCol: string,
  operation: "sum" | "avg"
): Record<string, number> {
  const groups: Record<string, { sum: number; count: number }> = {};

  for (const row of data) {
    const key = String(row[groupCol]);
    const value = Number(row[valueCol]) || 0;

    if (!groups[key]) {
      groups[key] = { sum: 0, count: 0 };
    }

    groups[key].sum += value;
    groups[key].count += 1;
  }

  const result: Record<string, number> = {};
  for (const [key, { sum, count }] of Object.entries(groups)) {
    result[key] = operation === "sum" ? sum : sum / count;
  }

  return result;
}

function calculateProfit(
  data: DataRow[],
  groupCol: string,
  revenueCol: string,
  expenseCol: string
): Record<string, { revenue: number; expense: number }> {
  const groups: Record<string, { revenue: number; expense: number }> = {};

  for (const row of data) {
    const key = String(row[groupCol]);
    const revenue = Number(row[revenueCol]) || 0;
    const expense = Number(row[expenseCol]) || 0;

    if (!groups[key]) {
      groups[key] = { revenue: 0, expense: 0 };
    }

    groups[key].revenue += revenue;
    groups[key].expense += expense;
  }

  return groups;
}

function countBy(data: DataRow[], groupCol: string): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const row of data) {
    const key = String(row[groupCol]);
    counts[key] = (counts[key] || 0) + 1;
  }

  return counts;
}

function formatTable(results: DataRow[]): DataRow[] {
  const currency = detectCurrency(results);
  return results.map((row) => {
    const formatted: DataRow = {};
    for (const [key, value] of Object.entries(row)) {
      if (typeof value === "number") {
        // Format numbers with currency for financial columns
        const lowerKey = key.toLowerCase();
        if (
          lowerKey.includes("price") ||
          lowerKey.includes("cost") ||
          lowerKey.includes("revenue") ||
          lowerKey.includes("total") ||
          lowerKey.includes("sales") ||
          lowerKey.includes("profit") ||
          lowerKey.includes("expense") ||
          lowerKey.includes("income") ||
          lowerKey.includes("avg_") ||
          lowerKey.includes("sum_")
        ) {
          formatted[key] = `${currency}${value.toLocaleString()}`;
        } else {
          formatted[key] = value.toLocaleString();
        }
      } else {
        formatted[key] = value;
      }
    }
    return formatted;
  });
}

function formatChart(results: DataRow[]): Array<{ name: string; [key: string]: any }> {
  if (results.length === 0) return [];

  return results.map((row) => {
    const entries = Object.entries(row);

    // First entry is typically the grouping column (name)
    const nameCol = entries[0][0];
    const nameValue = String(row[nameCol]);

    // Find all numeric columns for the chart
    const chartRow: { name: string; [key: string]: any } = { name: nameValue };

    entries.forEach(([key, value]) => {
      if (key !== nameCol && typeof value === "number") {
        chartRow[key] = value;
      }
    });

    // Fallback: if no numeric values found, use "sales" key with 0
    if (Object.keys(chartRow).length === 1) {
      const valueCol = entries.find(([k, v]) => typeof v === "number")?.[0] || entries[1]?.[0];
      chartRow["sales"] = valueCol ? Number(row[valueCol]) || 0 : 0;
    }

    return chartRow;
  });
}

// NEW: Financial Calculations Engine
interface FinancialMetrics {
  profit: number;
  profitMargin: number;
  growth: number;
  revenue: number;
  expense: number;
}

function calculateGrowthRate(data: DataRow[], groupCol: string, valueCol: string): Array<{
  [key: string]: any;
  growth: number;
}> {
  const sorted = [...data].sort((a, b) => 
    String(a[groupCol]).localeCompare(String(b[groupCol]))
  );
  
  const grouped = groupBy(sorted, groupCol, valueCol, "sum");
  const entries = Object.entries(grouped);
  
  return entries.map(([key, value], index) => {
    let growth = 0;
    if (index > 0) {
      const previous = entries[index - 1][1];
      growth = previous !== 0 ? ((value - previous) / previous) * 100 : 0;
    }
    return {
      [groupCol]: key,
      [valueCol]: value,
      growth: Math.round(growth * 10) / 10, // Round to 1 decimal
    };
  });
}

function calculateProfitMargin(profit: number, revenue: number): number {
  return revenue !== 0 ? (profit / revenue) * 100 : 0;
}

// NEW: Smart Insight Generator
function generateInsight(
  data: Array<Record<string, any>>,
  groupCol: string,
  valueCol: string | string[],
  queryType: string,
  currency: string
): string {
  console.log("🔍 generateInsight called with:", {
    dataLength: data.length,
    groupCol,
    valueCol,
    queryType,
    currency,
    sampleData: data.slice(0, 2)
  });
  
  if (data.length === 0) {
    console.log("❌ No data - returning empty string");
    return "";
  }

  const insights: string[] = [];
  const valueColumns = Array.isArray(valueCol) ? valueCol : [valueCol];
  
  console.log("🎯 Value columns:", valueColumns);

  // For multi-metric queries (compare revenue and expenses)
  if (valueColumns.length > 1) {
    const firstMetric = valueColumns[0];
    const secondMetric = valueColumns[1];
    
    // Calculate totals using proper numeric extraction
    const total1 = data.reduce((sum, row) => {
      const val = typeof row[firstMetric] === 'number' ? row[firstMetric] : 0;
      return sum + val;
    }, 0);
    
    const total2 = data.reduce((sum, row) => {
      const val = typeof row[secondMetric] === 'number' ? row[secondMetric] : 0;
      return sum + val;
    }, 0);
    
    // Only add totals if they're meaningful
    if (total1 > 0 || total2 > 0) {
      insights.push(`Total ${firstMetric}: ${currency}${total1.toLocaleString()}, Total ${secondMetric}: ${currency}${total2.toLocaleString()}.`);
    }
    
    // Calculate profit margin if comparing revenue and expenses
    if (firstMetric.toLowerCase().includes("revenue") && secondMetric.toLowerCase().includes("expense")) {
      if (total1 > 0) {
        const overallProfit = total1 - total2;
        const overallMargin = (overallProfit / total1) * 100;
        insights.push(`Overall profit margin is ${overallMargin.toFixed(1)}% with net profit of ${currency}${overallProfit.toLocaleString()}.`);
      }
      
      // Find best performing year based on profit
      let bestYear = data[0];
      let bestProfit = (typeof data[0][firstMetric] === 'number' ? data[0][firstMetric] : 0) - 
                       (typeof data[0][secondMetric] === 'number' ? data[0][secondMetric] : 0);
      
      data.forEach(row => {
        const revenue = typeof row[firstMetric] === 'number' ? row[firstMetric] : 0;
        const expense = typeof row[secondMetric] === 'number' ? row[secondMetric] : 0;
        const profit = revenue - expense;
        
        if (profit > bestProfit) {
          bestProfit = profit;
          bestYear = row;
        }
      });
      
      const bestYearRevenue = typeof bestYear[firstMetric] === 'number' ? bestYear[firstMetric] : 0;
      const bestYearExpense = typeof bestYear[secondMetric] === 'number' ? bestYear[secondMetric] : 0;
      const bestYearMargin = bestYearRevenue > 0 ? ((bestYearRevenue - bestYearExpense) / bestYearRevenue) * 100 : 0;
      
      insights.push(`${bestYear[groupCol]} was the best year with ${currency}${bestYearRevenue.toLocaleString()} revenue, ${currency}${bestYearExpense.toLocaleString()} expenses, and ${bestYearMargin.toFixed(1)}% profit margin.`);
    }
    
    // Detect trends for both metrics
    const values1 = data.map(row => typeof row[firstMetric] === 'number' ? row[firstMetric] : 0);
    const values2 = data.map(row => typeof row[secondMetric] === 'number' ? row[secondMetric] : 0);
    
    const trend1 = detectTrendWithDetails(values1);
    const trend2 = detectTrendWithDetails(values2);
    
    if (values1.length > 1 && values2.length > 1) {
      const firstYear = data[0][groupCol];
      const lastYear = data[data.length - 1][groupCol];
      
      // Calculate growth rates
      if (values1[0] > 0) {
        const growth1 = ((values1[values1.length - 1] - values1[0]) / values1[0]) * 100;
        insights.push(`${firstMetric} ${trend1.description} from ${firstYear} to ${lastYear} with ${growth1 > 0 ? '+' : ''}${growth1.toFixed(1)}% total growth.`);
      }
      
      if (values2[0] > 0) {
        const growth2 = ((values2[values2.length - 1] - values2[0]) / values2[0]) * 100;
        insights.push(`${secondMetric} ${trend2.description} with ${growth2 > 0 ? '+' : ''}${growth2.toFixed(1)}% growth, ${growth2 < (values1[0] > 0 ? ((values1[values1.length - 1] - values1[0]) / values1[0]) * 100 : 0) ? 'indicating strong cost control' : 'growing faster than revenue'}.`);
      }
    }
    
    return insights.join(" ");
  }

  // For single metric queries
  const singleValueCol = valueColumns[0];
  const values = data.map(row => typeof row[singleValueCol] === 'number' ? row[singleValueCol] : 0);
  
  if (values.every(v => v === 0)) {
    return "No meaningful data available for analysis.";
  }
  
  // Find best and worst with proper numeric handling
  const maxValue = Math.max(...values);
  const minValue = Math.min(...values.filter(v => v > 0));
  const maxIndex = values.indexOf(maxValue);
  const minIndex = values.indexOf(minValue);
  
  if (data.length > 1 && maxValue > 0) {
    const bestPeriod = data[maxIndex][groupCol];
    insights.push(`${bestPeriod} is the best performing period with ${currency}${maxValue.toLocaleString()}.`);
    
    if (queryType.includes("compare") || queryType.includes("analyze") || queryType.includes("worst")) {
      if (minValue > 0 && minValue !== maxValue) {
        const worstPeriod = data[minIndex][groupCol];
        insights.push(`${worstPeriod} is the weakest period with ${currency}${minValue.toLocaleString()}.`);
      }
    }
  }
  
  // Detect trend with growth details
  if (values.length > 1) {
    const trendInfo = detectTrendWithDetails(values);
    const firstPeriod = data[0][groupCol];
    const lastPeriod = data[data.length - 1][groupCol];
    
    if (values[0] > 0) {
      const totalGrowth = ((values[values.length - 1] - values[0]) / values[0]) * 100;
      insights.push(`${singleValueCol} ${trendInfo.description} from ${firstPeriod} to ${lastPeriod} with ${totalGrowth > 0 ? '+' : ''}${totalGrowth.toFixed(1)}% total growth.`);
    } else {
      insights.push(`${singleValueCol} ${trendInfo.description} across the period.`);
    }
  }
  
  // Calculate and report average growth if growth data exists
  if (data[0].growth !== undefined) {
    const growthValues = data
      .filter(row => typeof row.growth === 'number' && !isNaN(row.growth) && row.growth !== 0)
      .map(row => row.growth);
    
    if (growthValues.length > 0) {
      const avgGrowth = growthValues.reduce((sum, g) => sum + g, 0) / growthValues.length;
      const maxGrowthIndex = data.findIndex(row => row.growth === Math.max(...data.map(r => r.growth || 0)));
      
      if (maxGrowthIndex >= 0 && data[maxGrowthIndex].growth) {
        insights.push(`Peak growth of ${data[maxGrowthIndex].growth.toFixed(1)}% occurred in ${data[maxGrowthIndex][groupCol]}, with average YoY growth of ${avgGrowth.toFixed(1)}%.`);
      }
    }
  }
  
  // Detect anomalies
  const anomalies = detectAnomalies(data, groupCol, singleValueCol, values);
  if (anomalies.length > 0 && anomalies.length <= 2) {
    insights.push(`Anomalies detected in ${anomalies.join(", ")}.`);
  }
  
  const finalInsight = insights.join(" ");
  console.log("✅ Returning insight:", {
    insightsArray: insights,
    finalInsight,
    length: finalInsight.length
  });
  
  return finalInsight;
}

// NEW: Enhanced Trend Detection with details
function detectTrendWithDetails(values: number[]): { trend: string; description: string } {
  if (values.length < 2) return { trend: "insufficient", description: "shows insufficient data" };
  
  let increases = 0;
  let decreases = 0;
  let stable = 0;
  
  for (let i = 1; i < values.length; i++) {
    const change = ((values[i] - values[i - 1]) / (values[i - 1] || 1)) * 100;
    if (Math.abs(change) < 2) stable++;
    else if (values[i] > values[i - 1]) increases++;
    else if (values[i] < values[i - 1]) decreases++;
  }
  
  const threshold = values.length * 0.6;
  
  if (increases >= threshold) return { trend: "upward", description: "shows consistent upward growth" };
  if (decreases >= threshold) return { trend: "downward", description: "shows a declining trend" };
  if (stable >= threshold) return { trend: "stable", description: "remains relatively stable" };
  
  // Mixed trend
  const overallChange = values[values.length - 1] - values[0];
  if (overallChange > 0) return { trend: "mixed-positive", description: "shows overall growth with some fluctuations" };
  if (overallChange < 0) return { trend: "mixed-negative", description: "shows overall decline with fluctuations" };
  return { trend: "stable", description: "remains stable" };
}

// NEW: Trend Detection (simplified for backward compatibility)
function detectTrend(values: number[]): string {
  return detectTrendWithDetails(values).trend === "upward" ? "an upward" :
         detectTrendWithDetails(values).trend === "downward" ? "a downward" :
         "a stable";
}

// NEW: Anomaly Detection
function detectAnomalies(
  data: Array<Record<string, any>>,
  groupCol: string,
  valueCol: string,
  values: number[]
): string[] {
  if (values.length < 3) return [];
  
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const stdDev = Math.sqrt(
    values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length
  );
  
  const anomalies: string[] = [];
  const threshold = 1.5; // Standard deviations
  
  values.forEach((value, index) => {
    const zScore = Math.abs((value - mean) / stdDev);
    if (zScore > threshold) {
      anomalies.push(`${data[index][groupCol]} (${zScore.toFixed(1)}σ)`);
    }
  });
  
  return anomalies;
}

// NEW: Fallback Insight Generator
function generateFallbackInsight(
  data: DataRow[],
  columns: string[],
  valueColumn: string | null,
  currency: string
): string {
  if (data.length === 0) {
    return "No data available for analysis.";
  }

  const insights: string[] = [];

  // Check if valueColumn is set and numeric
  if (valueColumn && isNumericColumn(data, valueColumn)) {
    const values = data.map(row => Number(row[valueColumn]) || 0);
    
    if (values.every(v => v === 0)) {
      return "No meaningful data available for analysis.";
    }
    
    // Find best and worst with proper numeric handling
    const maxValue = Math.max(...values);
    const minValue = Math.min(...values.filter(v => v > 0));
    const maxIndex = values.indexOf(maxValue);
    const minIndex = values.indexOf(minValue);
    
    if (data.length > 1 && maxValue > 0) {
      const bestPeriod = data[maxIndex][columns[0]];
      insights.push(`${bestPeriod} is the best performing period with ${currency}${maxValue.toLocaleString()}.`);
      
      if (minValue > 0 && minValue !== maxValue) {
        const worstPeriod = data[minIndex][columns[0]];
        insights.push(`${worstPeriod} is the weakest period with ${currency}${minValue.toLocaleString()}.`);
      }
    }
    
    // Detect trend with growth details
    if (values.length > 1) {
      const trendInfo = detectTrendWithDetails(values);
      const firstPeriod = data[0][columns[0]];
      const lastPeriod = data[data.length - 1][columns[0]];
      
      if (values[0] > 0) {
        const totalGrowth = ((values[values.length - 1] - values[0]) / values[0]) * 100;
        insights.push(`${valueColumn} ${trendInfo.description} from ${firstPeriod} to ${lastPeriod} with ${totalGrowth > 0 ? '+' : ''}${totalGrowth.toFixed(1)}% total growth.`);
      } else {
        insights.push(`${valueColumn} ${trendInfo.description} across the period.`);
      }
    }
  }

  const finalInsight = insights.join(" ");
  console.log("✅ Returning fallback insight:", {
    insightsArray: insights,
    finalInsight,
    length: finalInsight.length
  });
  
  return finalInsight;
}