import { Navbar } from "../components/navbar";
import { StatCard } from "../components/stat-card";
import { Database, TrendingUp, FileText, Clock, CheckCircle2, ArrowRight, DollarSign, Eye, X } from "lucide-react";
import { useData } from "../contexts/data-context";
import { useHistory } from "../contexts/history-context";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";

export function Dashboard() {
  const { data, isDataLoaded } = useData();
  const { history } = useHistory();
  const navigate = useNavigate();
  const [showFileViewer, setShowFileViewer] = useState(false);
  const [selectedSheet, setSelectedSheet] = useState(0); // Track which sheet is selected

  // Debug logging
  console.log("Dashboard - isDataLoaded:", isDataLoaded);
  console.log("Dashboard - data:", data);
  console.log("Dashboard - sheets count:", data?.sheets?.length);
  console.log("Dashboard - sheets:", data?.sheets?.map(s => s.name));

  // Calculate real statistics from uploaded data
  const stats = useMemo(() => {
    // Total queries executed
    const totalQueries = history.length;

    // Get first sheet data for calculations
    const firstSheet = isDataLoaded && data && data.sheets.length > 0 ? data.sheets[0] : null;

    // Total records in uploaded data (from first sheet)
    const totalRecords = firstSheet ? firstSheet.rows.length : 0;

    // Total columns in uploaded data (from first sheet)
    const totalColumns = firstSheet ? firstSheet.columns.length : 0;

    // Calculate success rate (all queries are successful in this implementation)
    const successRate = totalQueries > 0 ? "100%" : "N/A";

    // Get queries from last month
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const lastMonthQueries = history.filter(
      (item) => new Date(item.timestamp) < lastMonth
    ).length;
    
    const queryGrowth = lastMonthQueries > 0 
      ? Math.round(((totalQueries - lastMonthQueries) / lastMonthQueries) * 100)
      : 0;

    // Calculate total sales from dataset
    let totalSales = 0;
    let currency = "₹"; // Default to INR
    let salesColumn = "";

    if (firstSheet) {
      // Try to detect sales/amount column (case insensitive)
      const salesColumnNames = ["sales", "amount", "revenue", "total", "price", "value"];
      salesColumn = firstSheet.columns.find(col => 
        salesColumnNames.some(name => col.toLowerCase().includes(name))
      ) || "";

      // Try to detect currency column or currency in data
      const currencyColumn = firstSheet.columns.find(col => 
        col.toLowerCase().includes("currency")
      );

      // Detect currency from data or column names
      if (currencyColumn) {
        const firstCurrency = firstSheet.rows[0]?.[currencyColumn];
        if (typeof firstCurrency === "string") {
          const currencyMap: Record<string, string> = {
            "USD": "$", "INR": "₹", "EUR": "€", "GBP": "£", 
            "JPY": "¥", "AUD": "A$", "CAD": "C$"
          };
          currency = currencyMap[firstCurrency.toUpperCase()] || firstCurrency;
        }
      } else {
        // Check if any column name contains currency indicator
        const hasUSD = firstSheet.columns.some(col => col.toLowerCase().includes("usd") || col.toLowerCase().includes("dollar"));
        const hasINR = firstSheet.columns.some(col => col.toLowerCase().includes("inr") || col.toLowerCase().includes("rupee"));
        const hasEUR = firstSheet.columns.some(col => col.toLowerCase().includes("eur") || col.toLowerCase().includes("euro"));
        
        if (hasUSD) currency = "$";
        else if (hasINR) currency = "₹";
        else if (hasEUR) currency = "€";
      }

      // Sum up sales if column found
      if (salesColumn) {
        totalSales = firstSheet.rows.reduce((sum, row) => {
          const value = row[salesColumn];
          const numValue = typeof value === "number" ? value : parseFloat(String(value).replace(/[^0-9.-]/g, ""));
          return sum + (isNaN(numValue) ? 0 : numValue);
        }, 0);
      }
    }

    return {
      totalQueries,
      totalRecords,
      totalColumns,
      successRate,
      queryGrowth,
      totalSales,
      currency,
      hasSalesData: salesColumn !== "",
    };
  }, [history, data, isDataLoaded]);

  // Get recent queries from history (real data)
  const recentQueries = useMemo(() => {
    return history
      .slice(-5) // Get last 5 queries
      .reverse() // Show newest first
      .map((item) => {
        const date = new Date(item.timestamp);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        let timeAgo;
        if (diffMins < 1) {
          timeAgo = "Just now";
        } else if (diffMins < 60) {
          timeAgo = `${diffMins} min${diffMins > 1 ? "s" : ""} ago`;
        } else if (diffHours < 24) {
          timeAgo = `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
        } else {
          timeAgo = `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
        }

        return {
          id: item.id,
          question: item.question,
          sql: item.sql,
          timeAgo,
          status: "success",
        };
      });
  }, [history]);

  const handleQueryClick = (queryId: string) => {
    navigate("/history");
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="mb-2">Dashboard</h1>
          <p className="text-muted-foreground">
            {isDataLoaded 
              ? `Overview of ${data?.fileName || "your data"}` 
              : "Upload data to see your analytics overview"}
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            title="Total Queries"
            value={stats.totalQueries.toString()}
            icon={Database}
            trend={stats.queryGrowth > 0 ? `+${stats.queryGrowth}% from last month` : "No previous data"}
            trendUp={stats.queryGrowth >= 0}
          />
          <StatCard
            title="Data Records"
            value={stats.totalRecords.toLocaleString()}
            icon={FileText}
            trend={isDataLoaded ? `${stats.totalColumns} columns` : "No data uploaded"}
            trendUp={true}
          />
          <StatCard
            title="Recent Activity"
            value={history.length > 0 ? "Active" : "Inactive"}
            icon={TrendingUp}
            trend={history.length > 0 ? `${history.length} total queries` : "Start querying"}
            trendUp={true}
          />
          <StatCard
            title={stats.hasSalesData ? "Total Sales" : "Success Rate"}
            value={stats.hasSalesData ? `${stats.currency}${stats.totalSales.toLocaleString("en-IN")}` : stats.successRate}
            icon={stats.hasSalesData ? DollarSign : CheckCircle2}
            trend={stats.hasSalesData ? "From uploaded data" : "All queries successful"}
            trendUp={true}
          />
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Recent Queries */}
          <div className="lg:col-span-2">
            <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3>Recent Queries</h3>
                {history.length > 0 && (
                  <button
                    onClick={() => navigate("/history")}
                    className="text-sm text-primary hover:text-primary/80 flex items-center gap-1"
                  >
                    View all
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
              
              {recentQueries.length > 0 ? (
                <div className="space-y-3">
                  {recentQueries.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => handleQueryClick(item.id)}
                      className="flex items-start gap-4 p-4 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                    >
                      <CheckCircle2 className="w-5 h-5 text-secondary mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="mb-2 line-clamp-1">{item.question}</p>
                        <div className="mb-2 p-2 bg-muted/50 rounded border border-border">
                          <code className="text-xs text-muted-foreground font-mono line-clamp-1">
                            {item.sql}
                          </code>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="w-4 h-4" />
                          <span>{item.timeAgo}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Database className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground mb-2">No queries yet</p>
                  <p className="text-sm text-muted-foreground">
                    Start asking questions in the Chat interface
                  </p>
                  <button
                    onClick={() => navigate("/chat")}
                    className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                  >
                    Go to Chat
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* File Viewer */}
          <div className="lg:col-span-1">
            <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3>File Viewer</h3>
                {isDataLoaded && (
                  <button
                    onClick={() => setShowFileViewer(!showFileViewer)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm"
                  >
                    <Eye className="w-4 h-4" />
                    {showFileViewer ? "Close" : "View File"}
                  </button>
                )}
              </div>
              
              {!isDataLoaded ? (
                <div className="text-center py-8">
                  <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground mb-3">
                    No file uploaded yet
                  </p>
                  <button
                    onClick={() => navigate("/welcome")}
                    className="text-sm text-primary hover:text-primary/80"
                  >
                    Upload File →
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-3 bg-muted/30 rounded-lg">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm text-muted-foreground">File Name</span>
                    </div>
                    <p className="text-sm font-medium truncate">{data?.fileName}</p>
                  </div>

                  <div className="p-3 bg-muted/30 rounded-lg">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm text-muted-foreground">Sheets</span>
                    </div>
                    <p className="text-sm font-medium">{data?.sheets?.length || 0} sheet(s)</p>
                    {data?.sheets && data.sheets.length > 1 && (
                      <div className="mt-2 space-y-1">
                        {data.sheets.map((sheet, idx) => (
                          <div key={idx} className="text-xs text-muted-foreground flex items-center gap-1">
                            <span className="w-1.5 h-1.5 bg-primary rounded-full"></span>
                            {sheet.name} ({sheet.rows.length} rows)
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="p-3 bg-muted/30 rounded-lg">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm text-muted-foreground">Total Rows</span>
                    </div>
                    <p className="text-sm font-medium">{stats.totalRecords.toLocaleString()}</p>
                  </div>

                  <div className="p-3 bg-muted/30 rounded-lg">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm text-muted-foreground">Total Columns</span>
                    </div>
                    <p className="text-sm font-medium">{stats.totalColumns}</p>
                  </div>

                  {stats.hasSalesData && (
                    <div className="p-3 bg-muted/30 rounded-lg">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm text-muted-foreground">Total Sales</span>
                      </div>
                      <p className="text-sm font-medium">{stats.currency} {stats.totalSales.toLocaleString()}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Full-Screen File Viewer Modal */}
        {showFileViewer && isDataLoaded && data && data.sheets && data.sheets.length > 0 && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-background rounded-2xl shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col">
              {/* Header */}
              <div className="px-6 py-4 border-b border-border">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="font-semibold text-lg">{data.fileName}</h2>
                    <p className="text-sm text-muted-foreground">
                      {data.sheets[selectedSheet]?.rows.length.toLocaleString() || 0} rows × {data.sheets[selectedSheet]?.columns.length || 0} columns
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setShowFileViewer(false);
                      setSelectedSheet(0);
                    }}
                    className="p-2 hover:bg-muted rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Sheet Tabs - Always show if multiple sheets */}
                {data.sheets.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {data.sheets.map((sheet, index) => (
                      <button
                        key={index}
                        onClick={() => setSelectedSheet(index)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                          selectedSheet === index
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:bg-muted/80"
                        }`}
                      >
                        {sheet.name}
                        <span className="ml-2 text-xs opacity-70">
                          ({sheet.rows.length} rows)
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Single sheet indicator */}
                {data.sheets.length === 1 && (
                  <div className="text-sm text-muted-foreground">
                    Sheet: {data.sheets[0].name}
                  </div>
                )}
              </div>

              {/* Table Container */}
              <div className="flex-1 overflow-auto p-6">
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 sticky top-0 z-10">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium border-b border-border bg-muted/50">
                          #
                        </th>
                        {data.sheets[selectedSheet]?.columns.map((col, i) => (
                          <th key={i} className="px-4 py-3 text-left font-medium border-b border-border bg-muted/50 whitespace-nowrap">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.sheets[selectedSheet]?.rows.map((row, i) => (
                        <tr key={i} className="border-b border-border hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs sticky left-0 bg-background">
                            {i + 1}
                          </td>
                          {data.sheets[selectedSheet]?.columns.map((col, j) => (
                            <td key={j} className="px-4 py-2.5 whitespace-nowrap">
                              {String(row[col])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-border bg-muted/20">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Showing all {data.sheets[selectedSheet]?.rows.length.toLocaleString() || 0} rows from "{data.sheets[selectedSheet]?.name}"
                    {data.sheets.length > 1 && ` (Sheet ${selectedSheet + 1} of ${data.sheets.length})`}
                  </p>
                  <button
                    onClick={() => {
                      setShowFileViewer(false);
                      setSelectedSheet(0);
                    }}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}