import { useState, useEffect } from "react";
import { Navbar } from "../components/navbar";
import { Send, User, Sparkles, Copy, Check, Upload, Download } from "lucide-react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useData } from "../contexts/data-context";
import { useHistory } from "../contexts/history-context";
import { executeQuery } from "../utils/query-executor";
import { parseFile } from "../utils/file-parser";
import { ask as apiAsk } from "@/lib/api";
import { getToken } from "@/lib/auth";

interface Message {
  id: number;
  type: "user" | "ai";
  content: string;
  sql?: string;
  table?: Array<Record<string, any>>;
  chartData?: Array<Record<string, any>>;
  chartType?: "line" | "bar" | "multi-line" | "multi-bar"; // NEW: specify chart type
  insight?: string; // NEW: AI-generated insight
  metrics?: string[]; // NEW: metrics being displayed
}

export function Chat() {
  const { data, setData, isDataLoaded } = useData();
  const { addToHistory } = useHistory();
  const canChat = Boolean(getToken()) || isDataLoaded;
  
  // Load messages from localStorage with version checking
  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = localStorage.getItem("asklytics_chat_messages");
    const version = localStorage.getItem("asklytics_chat_version");
    
    // Current version includes insights feature
    const CURRENT_VERSION = "2.0";
    
    // If version mismatch, clear old messages
    if (version !== CURRENT_VERSION) {
      console.log("🔄 Clearing old chat messages - version upgrade");
      localStorage.setItem("asklytics_chat_version", CURRENT_VERSION);
      localStorage.removeItem("asklytics_chat_messages");
    } else if (saved) {
      try {
        const parsed = JSON.parse(saved);
        console.log("📥 Loaded messages from localStorage:", parsed.length);
        return parsed;
      } catch {
        // If parsing fails, return default message
        console.log("❌ Failed to parse saved messages");
      }
    }
    
    return [
      {
        id: 1,
        type: "ai",
        content: isDataLoaded
          ? `Hello! I'm your Asklytics AI assistant. I can see you have uploaded ${data?.fileName}. Ask me anything about your data, and I'll convert it to SQL and show you the results.`
          : "Hello! I'm your Asklytics AI assistant. Please upload a financial statement file (CSV, Excel, etc.) to get started with data analysis.",
      },
    ];
  });
  
  const [input, setInput] = useState("");
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Save messages to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem("asklytics_chat_messages", JSON.stringify(messages));
  }, [messages]);

  const generateResponse = (userInput: string): Omit<Message, "id"> => {
    const lowerInput = userInput.toLowerCase();

    // Loss/Expense related questions
    if (lowerInput.includes("loss") || lowerInput.includes("losses") || lowerInput.includes("expense")) {
      return {
        type: "ai",
        content: "Here are the loss/expense results for the last financial year:",
        sql: `SELECT \n  category, \n  SUM(amount) as total_loss,\n  COUNT(transaction_id) as transaction_count\nFROM expenses\nWHERE fiscal_year = '2025'\n  AND type = 'loss'\nGROUP BY category\nORDER BY total_loss DESC\nLIMIT 5;`,
        table: [
          { category: "Operating Costs", total_loss: "$128,450", transaction_count: 342 },
          { category: "Marketing", total_loss: "$98,720", transaction_count: 215 },
          { category: "Returns & Refunds", total_loss: "$67,230", transaction_count: 456 },
          { category: "Inventory Writeoff", total_loss: "$45,890", transaction_count: 89 },
          { category: "Damaged Goods", total_loss: "$32,150", transaction_count: 127 },
        ],
        chartData: [
          { name: "Operating Costs", sales: 128450 },
          { name: "Marketing", sales: 98720 },
          { name: "Returns", sales: 67230 },
          { name: "Writeoff", sales: 45890 },
          { name: "Damaged", sales: 32150 },
        ],
        chartType: "bar",
        insight: "Operating Costs is the largest expense category at $128,450 (35.2% of total expenses), followed by Marketing at $98,720. Total expenses across all categories amount to $372,440. Damaged Goods shows the fewest transactions (127), suggesting good inventory management.",
        metrics: ["total_loss"],
      };
    }

    // Profit related questions
    if (lowerInput.includes("profit") || lowerInput.includes("margin")) {
      return {
        type: "ai",
        content: "Here are the profit margins by product category:",
        sql: `SELECT \n  category,\n  SUM(revenue - cost) as net_profit,\n  ROUND(((SUM(revenue - cost) / SUM(revenue)) * 100), 2) as profit_margin\nFROM transactions\nWHERE date >= '2025-01-01' AND date <= '2025-12-31'\nGROUP BY category\nORDER BY net_profit DESC;`,
        table: [
          { category: "Electronics", net_profit: "$234,560", profit_margin: "28.5%" },
          { category: "Clothing", net_profit: "$189,340", profit_margin: "32.1%" },
          { category: "Home Goods", net_profit: "$156,780", profit_margin: "25.8%" },
          { category: "Sports", net_profit: "$98,450", profit_margin: "22.4%" },
          { category: "Books", net_profit: "$67,230", profit_margin: "18.9%" },
        ],
        chartData: [
          { name: "Electronics", sales: 234560 },
          { name: "Clothing", sales: 189340 },
          { name: "Home Goods", sales: 156780 },
          { name: "Sports", sales: 98450 },
          { name: "Books", sales: 67230 },
        ],
        chartType: "bar",
        insight: "Electronics leads with $234,560 net profit despite having a lower margin (28.5%) compared to Clothing's 32.1%. Total profit across all categories is $746,360. Clothing shows the highest profit margin at 32.1%, while Books has the lowest at 18.9%, indicating potential areas for pricing optimization.",
        metrics: ["net_profit"],
      };
    }

    // Customer/User related questions
    if (lowerInput.includes("customer") || lowerInput.includes("user") || lowerInput.includes("client")) {
      return {
        type: "ai",
        content: "Here are the top customers by total purchases:",
        sql: `SELECT \n  customer_name,\n  COUNT(order_id) as total_orders,\n  SUM(order_amount) as total_spent\nFROM orders\nWHERE date >= '2026-01-01'\nGROUP BY customer_name\nORDER BY total_spent DESC\nLIMIT 5;`,
        table: [
          { customer_name: "Acme Corp", total_orders: 156, total_spent: "$567,890" },
          { customer_name: "TechStart Inc", total_orders: 142, total_spent: "$489,230" },
          { customer_name: "Global Solutions", total_orders: 128, total_spent: "$445,670" },
          { customer_name: "Innovation Labs", total_orders: 98, total_spent: "$378,450" },
          { customer_name: "Future Dynamics", total_orders: 87, total_spent: "$298,120" },
        ],
        chartData: [
          { name: "Acme Corp", sales: 567890 },
          { name: "TechStart", sales: 489230 },
          { name: "Global Sol.", sales: 445670 },
          { name: "Innovation", sales: 378450 },
          { name: "Future Dyn.", sales: 298120 },
        ],
        chartType: "bar",
        insight: "Acme Corp is the highest-value customer with $567,890 in purchases across 156 orders. The top 5 customers contributed $2,179,360 in total revenue. Acme Corp's average order value is $3,640, suggesting strong engagement. There's an 48% revenue gap between the top customer and the 5th customer.",
        metrics: ["total_spent"],
      };
    }

    // Revenue/Growth related questions
    if (lowerInput.includes("revenue") || lowerInput.includes("growth") || lowerInput.includes("trend")) {
      return {
        type: "ai",
        content: "Here is the monthly revenue trend:",
        sql: `SELECT \n  DATE_FORMAT(date, '%Y-%m') as month,\n  SUM(revenue) as monthly_revenue,\n  COUNT(DISTINCT customer_id) as unique_customers\nFROM transactions\nWHERE date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)\nGROUP BY month\nORDER BY month ASC;`,
        table: [
          { month: "2025-07", monthly_revenue: "$342,560", unique_customers: 1245 },
          { month: "2025-08", monthly_revenue: "$378,920", unique_customers: 1389 },
          { month: "2025-09", monthly_revenue: "$421,340", unique_customers: 1502 },
          { month: "2025-10", monthly_revenue: "$456,780", unique_customers: 1634 },
          { month: "2025-11", monthly_revenue: "$489,450", unique_customers: 1758 },
          { month: "2025-12", monthly_revenue: "$523,890", unique_customers: 1892 },
        ],
        chartData: [
          { name: "Jul", sales: 342560 },
          { name: "Aug", sales: 378920 },
          { name: "Sep", sales: 421340 },
          { name: "Oct", sales: 456780 },
          { name: "Nov", sales: 489450 },
          { name: "Dec", sales: 523890 },
        ],
        chartType: "line",
        insight: "Revenue shows consistent upward growth from July to December 2025, with total revenue of $2,613,940 over 6 months. December is the best performing month with $523,890 (+52.9% vs July). Average monthly growth rate is 8.9%, indicating strong business momentum. Customer base grew by 52% from 1,245 to 1,892, suggesting effective customer acquisition.",
        metrics: ["monthly_revenue"],
      };
    }

    // Default: Sales related questions
    return {
      type: "ai",
      content: "Here are your sales results:",
      sql: `SELECT \n  product_name, \n  SUM(sales_amount) as total_sales,\n  COUNT(order_id) as order_count\nFROM sales\nWHERE date >= '2026-01-01'\nGROUP BY product_name\nORDER BY total_sales DESC\nLIMIT 5;`,
      table: [
        { product_name: "Product A", total_sales: "$45,230", order_count: 234 },
        { product_name: "Product B", total_sales: "$38,920", order_count: 189 },
        { product_name: "Product C", total_sales: "$32,150", order_count: 156 },
        { product_name: "Product D", total_sales: "$28,470", order_count: 143 },
        { product_name: "Product E", total_sales: "$24,890", order_count: 128 },
      ],
      chartData: [
        { name: "Product A", sales: 45230 },
        { name: "Product B", sales: 38920 },
        { name: "Product C", sales: 32150 },
        { name: "Product D", sales: 28470 },
        { name: "Product E", sales: 24890 },
      ],
      chartType: "bar",
      insight: "Product A is the top performer with $45,230 in sales (26.7% of total), achieving this through 234 orders. Total sales across top 5 products is $169,660. Product A's average order value is $193, while Product E's is $194, indicating similar pricing despite different sales volumes. Consider focusing on Product A's successful strategies.",
      metrics: ["total_sales"],
    };
  };

  const handleSend = async () => {
    const q = input.trim();
    if (!q || !canChat) return;

    const userMessage: Message = {
      id: messages.length + 1,
      type: "user",
      content: q,
    };

    // 1) Original Asklytics behavior: local file + query-executor / mock (must win when a sheet is loaded,
    //    even if the user is logged in — otherwise DB /ask replaces the demo output.)
    if (isDataLoaded && data && data.sheets.length > 0) {
      let responseData: Omit<Message, "id">;

      const firstSheet = data.sheets[0];
      console.log("🔍 Executing query with data:", {
        input: q,
        rows: firstSheet.rows.length,
        columns: firstSheet.columns,
        sampleData: firstSheet.rows.slice(0, 2),
      });

      const queryResult = executeQuery(q, firstSheet.rows, firstSheet.columns);

      console.log("✅ Query result:", {
        sql: queryResult.sql,
        tableRows: queryResult.table?.length,
        chartDataLength: queryResult.chartData?.length,
        chartType: queryResult.chartType,
        hasInsight: !!queryResult.insight,
        sampleChartData: queryResult.chartData?.slice(0, 2),
      });

      responseData = {
        type: "ai",
        content: queryResult.message,
        sql: queryResult.sql,
        table: queryResult.table,
        chartData: queryResult.chartData,
        chartType: queryResult.chartType,
        insight: queryResult.insight,
        metrics: queryResult.metrics,
      };

      const aiMessage: Message = {
        id: messages.length + 2,
        ...responseData,
      };

      console.log("🔥 AI Message with Insight:", {
        hasInsight: !!aiMessage.insight,
        insight: aiMessage.insight,
        fullMessage: aiMessage,
      });

      setMessages([...messages, userMessage, aiMessage]);
      setInput("");

      if (responseData.sql && responseData.table) {
        addToHistory({
          question: q,
          sql: responseData.sql,
          result: {
            table: responseData.table,
            chartData: responseData.chartData || [],
            message: responseData.content,
          },
        });
      }
      return;
    }

    // 2) Logged in, no local sheet: FastAPI /ask against your database
    const token = getToken();
    if (token) {
      setInput("");
      try {
        const res = await apiAsk(q, token);
        const table = (res.rows ?? []) as Array<Record<string, any>>;
        const responseData: Omit<Message, "id"> = {
          type: "ai",
          content: res.explanation || "Here are your results.",
          sql: res.sql,
          table,
          chartType: table.length ? "bar" : undefined,
          insight: res.explanation,
        };
        setMessages((prev) => {
          const base = prev.length;
          const aiMessage: Message = { id: base + 2, ...responseData };
          return [...prev, { id: base + 1, type: "user", content: q }, aiMessage];
        });
        if (res.sql && table.length) {
          addToHistory({
            question: q,
            sql: res.sql,
            result: {
              table,
              chartData: [],
              message: res.explanation,
            },
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Request failed";
        setMessages((prev) => {
          const base = prev.length;
          return [
            ...prev,
            { id: base + 1, type: "user", content: q },
            { id: base + 2, type: "ai", content: `Error: ${msg}` },
          ];
        });
      }
      return;
    }

    // 3) Loaded flag set but no sheets (edge): original mock branch
    if (isDataLoaded) {
      console.log("⚠️ Using mock data (no sheet rows)");
      const responseData = generateResponse(q);
      const aiMessage: Message = {
        id: messages.length + 2,
        ...responseData,
      };
      setMessages([...messages, userMessage, aiMessage]);
      setInput("");
      if (responseData.sql && responseData.table) {
        addToHistory({
          question: q,
          sql: responseData.sql,
          result: {
            table: responseData.table,
            chartData: responseData.chartData || [],
            message: responseData.content,
          },
        });
      }
    }
  };

  const handleCopy = (sql: string, id: number) => {
    navigator.clipboard.writeText(sql);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);

    const result = await parseFile(file);

    if (result.success) {
      setData({
        fileName: file.name,
        sheets: result.sheets,
        uploadDate: new Date(),
      });

      // Calculate total rows and columns from all sheets
      const totalRows = result.sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0);
      const totalColumns = result.sheets[0]?.columns.length || 0;

      // Update welcome message
      setMessages([
        {
          id: 1,
          type: "ai",
          content: `Great! I've loaded ${file.name} with ${result.sheets.length} sheet(s), ${totalRows} total rows and ${totalColumns} columns. Ask me anything about your data!`,
        },
      ]);

      setIsUploading(false);
    } else {
      // Show error message in chat
      setMessages((prev) => [
        ...prev,
        {
          id: prev.length + 1,
          type: "ai",
          content: `⚠️ ${result.error}`,
        },
      ]);
      setIsUploading(false);
    }
  };

  const downloadMessage = (message: Message, format: "single" | "all" = "single") => {
    let csvContent = "";

    if (format === "all") {
      // Download entire chat
      const aiMessages = messages.filter(m => m.type === "ai" && m.table);
      
      aiMessages.forEach((msg, index) => {
        csvContent += `\n=== Query ${index + 1} ===\n`;
        csvContent += `Question: ${messages.find(m => m.id === msg.id - 1)?.content || "N/A"}\n`;
        csvContent += `SQL: ${msg.sql || "N/A"}\n\n`;
        
        if (msg.table && msg.table.length > 0) {
          const headers = Object.keys(msg.table[0]);
          csvContent += headers.join(",") + "\n";
          msg.table.forEach(row => {
            csvContent += headers.map(h => JSON.stringify(row[h] || "")).join(",") + "\n";
          });
        }
        csvContent += "\n";
      });
    } else {
      // Download single message
      csvContent = `Question: ${messages.find(m => m.id === message.id - 1)?.content || "N/A"}\n`;
      csvContent += `SQL Query: ${message.sql || "N/A"}\n\n`;
      
      if (message.table && message.table.length > 0) {
        const headers = Object.keys(message.table[0]);
        csvContent += headers.join(",") + "\n";
        message.table.forEach(row => {
          csvContent += headers.map(h => JSON.stringify(row[h] || "")).join(",") + "\n";
        });
      }

      if (message.chartData && message.chartData.length > 0) {
        csvContent += "\nChart Data:\n";
        const chartHeaders = Object.keys(message.chartData[0]);
        csvContent += chartHeaders.join(",") + "\n";
        message.chartData.forEach(row => {
          csvContent += chartHeaders.map(h => JSON.stringify(row[h] || "")).join(",") + "\n";
        });
      }
    }

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", format === "all" ? "asklytics_chat_export.csv" : `asklytics_query_${message.id}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      <div className="flex-1 max-w-5xl mx-auto w-full px-4 py-8">
        <div className="mb-6">
          <h1 className="mb-2">Chat Interface</h1>
          <p className="text-muted-foreground">
            Ask business questions in natural language
          </p>
        </div>

        {/* Messages */}
        <div className="space-y-6 mb-24">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-4 ${message.type === "user" ? "justify-end" : ""}`}
            >
              {message.type === "ai" && (
                <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-5 h-5 text-primary-foreground" />
                </div>
              )}

              <div className={`${message.type === "user" ? "max-w-2xl flex" : "flex-1"}`}>
                {message.type === "user" ? (
                  <div className="bg-primary text-primary-foreground rounded-2xl px-6 py-4 ml-auto">
                    <p>{message.content}</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="bg-card border border-border rounded-xl px-6 py-4">
                      <p>{message.content}</p>
                    </div>

                    {/* SQL Query */}
                    {message.sql && (
                      <div className="bg-card border border-border rounded-xl overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b border-border">
                          <span className="text-sm font-medium">Generated SQL Query</span>
                          <button
                            onClick={() => handleCopy(message.sql!, message.id)}
                            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {copiedId === message.id ? (
                              <>
                                <Check className="w-4 h-4" />
                                <span>Copied!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-4 h-4" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        </div>
                        <pre className="p-4 overflow-x-auto">
                          <code className="text-sm text-secondary">{message.sql}</code>
                        </pre>
                      </div>
                    )}

                    {/* Table Results */}
                    {message.table && (
                      <div className="bg-card border border-border rounded-xl overflow-hidden">
                        <div className="px-4 py-3 bg-muted/30 border-b border-border">
                          <span className="text-sm font-medium">Query Results</span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead className="bg-muted/20">
                              <tr>
                                {Object.keys(message.table[0]).map((key) => (
                                  <th key={key} className="px-4 py-3 text-left text-sm">
                                    {key.replace(/_/g, " ").toUpperCase()}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {message.table.map((row, idx) => (
                                <tr key={idx} className="border-t border-border hover:bg-muted/20">
                                  {Object.values(row).map((value, vIdx) => (
                                    <td key={vIdx} className="px-4 py-3 text-sm">
                                      {value}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Chart Visualization */}
                    {message.chartData && message.chartData.length > 0 && (
                      <div className="bg-card border border-border rounded-xl p-6">
                        <div className="mb-4">
                          <span className="text-sm font-medium">Visualization</span>
                        </div>
                        <ResponsiveContainer width="100%" height={300}>
                          {(message.chartType === "multi-line" || message.chartType === "multi-bar") ? (
                            // Multi-metric chart
                            message.chartType === "multi-line" ? (
                              <LineChart data={message.chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                <XAxis dataKey="name" stroke="#64748b" />
                                <YAxis stroke="#64748b" />
                                <Tooltip
                                  contentStyle={{
                                    backgroundColor: "#ffffff",
                                    border: "1px solid #e2e8f0",
                                    borderRadius: "8px",
                                  }}
                                />
                                {/* Render lines for each metric */}
                                {(() => {
                                  const colors = ["#1e7a5c", "#ef4444", "#22c55e", "#f59e0b"];
                                  // Get all numeric keys except 'name'
                                  const firstRow = message.chartData?.[0];
                                  if (!firstRow) return null;

                                  const dataKeys = Object.keys(firstRow).filter(key =>
                                    key !== "name" && typeof firstRow[key] === 'number'
                                  );

                                  console.log("📊 Multi-line dataKeys:", dataKeys);

                                  return dataKeys.map((dataKey, idx) => (
                                    <Line
                                      key={dataKey}
                                      dataKey={dataKey}
                                      stroke={colors[idx % colors.length]}
                                      strokeWidth={3}
                                      dot={{ fill: colors[idx % colors.length], r: 5 }}
                                      activeDot={{ r: 7 }}
                                    />
                                  ));
                                })()}
                              </LineChart>
                            ) : (
                              <BarChart data={message.chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                <XAxis dataKey="name" stroke="#64748b" />
                                <YAxis stroke="#64748b" />
                                <Tooltip
                                  contentStyle={{
                                    backgroundColor: "#ffffff",
                                    border: "1px solid #e2e8f0",
                                    borderRadius: "8px",
                                  }}
                                />
                                {/* Render bars for each metric */}
                                {(() => {
                                  const colors = ["#1e7a5c", "#ef4444", "#22c55e", "#f59e0b"];
                                  // Get all numeric keys except 'name'
                                  const firstRow = message.chartData?.[0];
                                  if (!firstRow) return null;

                                  const dataKeys = Object.keys(firstRow).filter(key =>
                                    key !== "name" && typeof firstRow[key] === 'number'
                                  );

                                  console.log("📊 Multi-bar dataKeys:", dataKeys);

                                  return dataKeys.map((dataKey, idx) => (
                                    <Bar
                                      key={dataKey}
                                      dataKey={dataKey}
                                      fill={colors[idx % colors.length]}
                                      radius={[8, 8, 0, 0]}
                                    />
                                  ));
                                })()}
                              </BarChart>
                            )
                          ) : message.chartType === "line" ? (
                            <LineChart data={message.chartData}>
                              <CartesianGrid key="chat-grid" strokeDasharray="3 3" stroke="#e2e8f0" />
                              <XAxis key="chat-xaxis" dataKey="name" stroke="#64748b" />
                              <YAxis key="chat-yaxis" stroke="#64748b" />
                              <Tooltip
                                key="chat-tooltip"
                                contentStyle={{
                                  backgroundColor: "#ffffff",
                                  border: "1px solid #e2e8f0",
                                  borderRadius: "8px",
                                }}
                              />
                              {(() => {
                                // Dynamically find the value key (should be numeric, not "name")
                                const firstRow = message.chartData?.[0];
                                if (!firstRow) return null;

                                const valueKey = Object.keys(firstRow).find(key =>
                                  key !== "name" && typeof firstRow[key] === 'number'
                                ) || "sales";

                                console.log("📊 Line chart valueKey:", valueKey);

                                return (
                                  <Line
                                    key="value-line-chart"
                                    dataKey={valueKey}
                                    stroke="#1e7a5c"
                                    strokeWidth={3}
                                    dot={{ fill: "#1e7a5c", r: 5 }}
                                    activeDot={{ r: 7 }}
                                  />
                                );
                              })()}
                            </LineChart>
                          ) : (
                            <BarChart data={message.chartData}>
                              <CartesianGrid key="chat-grid" strokeDasharray="3 3" stroke="#e2e8f0" />
                              <XAxis key="chat-xaxis" dataKey="name" stroke="#64748b" />
                              <YAxis key="chat-yaxis" stroke="#64748b" />
                              <Tooltip
                                key="chat-tooltip"
                                contentStyle={{
                                  backgroundColor: "#ffffff",
                                  border: "1px solid #e2e8f0",
                                  borderRadius: "8px",
                                }}
                              />
                              {(() => {
                                // Dynamically find the value key (should be numeric, not "name")
                                const firstRow = message.chartData?.[0];
                                if (!firstRow) return null;

                                const valueKey = Object.keys(firstRow).find(key =>
                                  key !== "name" && typeof firstRow[key] === 'number'
                                ) || "sales";

                                console.log("📊 Bar chart valueKey:", valueKey);

                                return (
                                  <Bar
                                    key="value-bar-chart"
                                    dataKey={valueKey}
                                    fill="#1e7a5c"
                                    radius={[8, 8, 0, 0]}
                                  />
                                );
                              })()}
                            </BarChart>
                          )}
                        </ResponsiveContainer>
                      </div>
                    )}

                    {/* AI Insight - Always show for every output */}
                    {message.table && message.table.length > 0 && (
                      <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border-2 border-green-200 dark:border-green-800 rounded-xl px-6 py-5 shadow-sm">
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center flex-shrink-0">
                            <Sparkles className="w-4 h-4 text-white" />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-semibold text-green-900 dark:text-green-100 mb-2">
                              💡 Key Insights
                            </h3>
                            <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                              {message.insight || "Analysis complete. Review the data above for detailed results."}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Download Options */}
                    {message.table && message.table.length > 0 && (
                      <div className="border-t border-border pt-4 mt-2">
                        <div className="space-y-3">
                          {/* Download this output */}
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-2">Download this output:</p>
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                onClick={() => downloadMessage(message, "single")}
                                className="flex items-center gap-2 px-3 py-2 text-sm bg-muted hover:bg-muted/80 text-foreground rounded-lg transition-colors"
                              >
                                <Download className="w-4 h-4" />
                                <span>CSV</span>
                              </button>
                              <button
                                onClick={() => {
                                  const jsonContent = JSON.stringify(message.table, null, 2);
                                  const blob = new Blob([jsonContent], { type: "application/json" });
                                  const link = document.createElement("a");
                                  link.href = URL.createObjectURL(blob);
                                  link.download = `asklytics_query_${message.id}.json`;
                                  link.click();
                                }}
                                className="flex items-center gap-2 px-3 py-2 text-sm bg-muted hover:bg-muted/80 text-foreground rounded-lg transition-colors"
                              >
                                <Download className="w-4 h-4" />
                                <span>JSON</span>
                              </button>
                              <button
                                onClick={() => {
                                  const txtContent = `Question: ${messages.find(m => m.id === message.id - 1)?.content || "N/A"}\n\nSQL Query:\n${message.sql || "N/A"}\n\nResults:\n${JSON.stringify(message.table, null, 2)}\n\nInsight:\n${message.insight || "No insight available"}`;
                                  const blob = new Blob([txtContent], { type: "text/plain" });
                                  const link = document.createElement("a");
                                  link.href = URL.createObjectURL(blob);
                                  link.download = `asklytics_query_${message.id}.txt`;
                                  link.click();
                                }}
                                className="flex items-center gap-2 px-3 py-2 text-sm bg-muted hover:bg-muted/80 text-foreground rounded-lg transition-colors"
                              >
                                <Download className="w-4 h-4" />
                                <span>TXT</span>
                              </button>
                            </div>
                          </div>
                          
                          {/* Download entire chat */}
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-2">Download entire chat:</p>
                            <button
                              onClick={() => downloadMessage(message, "all")}
                              className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                            >
                              <Download className="w-4 h-4" />
                              <span>Export Full Conversation (CSV)</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {message.type === "user" && (
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                  <User className="w-5 h-5" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Input Box */}
      <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-border">
        <div className="max-w-5xl mx-auto px-4 py-4">
          {!isDataLoaded && (
            <div className="mb-3 p-3 bg-primary/10 border border-primary/20 rounded-lg text-sm text-center">
              <p className="text-primary">
                ⚠️ Please upload a financial statement file to start analyzing your data
              </p>
            </div>
          )}
          <div className="flex gap-3">
            {/* Always show upload button */}
            <input
              type="file"
              accept=".csv,.xlsx,.xls,.json,.txt,.pdf"
              onChange={handleFileUpload}
              className="hidden"
              id="chat-file-upload"
            />
            <label
              htmlFor="chat-file-upload"
              className="px-4 py-3 bg-secondary text-white rounded-lg hover:bg-secondary/90 transition-colors cursor-pointer flex items-center gap-2 flex-shrink-0"
              title={isDataLoaded ? "Upload another file" : "Upload file"}
            >
              <Upload className="w-5 h-5" />
              <span className="hidden sm:inline">{isUploading ? "Uploading..." : "Upload"}</span>
            </label>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder={
                getToken()
                  ? "Ask a question about your financial data (server)…"
                  : isDataLoaded
                    ? "Ask a question about your data…"
                    : "Upload a file first, or log in to query the server…"
              }
              disabled={!canChat}
              className="flex-1 px-4 py-3 bg-input-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              onClick={() => void handleSend()}
              disabled={!canChat}
              className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}