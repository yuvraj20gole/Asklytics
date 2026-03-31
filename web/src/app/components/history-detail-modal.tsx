import { X, Database, Calendar, Code } from "lucide-react";
import { format } from "date-fns";
import type { HistoryItem } from "../contexts/history-context";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface HistoryDetailModalProps {
  item: HistoryItem;
  onClose: () => void;
}

export function HistoryDetailModal({ item, onClose }: HistoryDetailModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-xl max-w-5xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-border">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Database className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-xl">{item.question}</h2>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="w-4 h-4" />
              <span>{format(new Date(item.timestamp), "MMMM d, yyyy 'at' h:mm a")}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {/* AI Response */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">AI Response</h3>
            <p className="text-foreground">{item.result.message}</p>
          </div>

          {/* SQL Query */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Code className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-medium">Generated SQL Query</h3>
            </div>
            <div className="bg-muted/50 rounded-lg p-4 overflow-x-auto">
              <pre className="text-sm text-foreground">
                <code>{item.sql}</code>
              </pre>
            </div>
          </div>

          {/* Results Table */}
          {item.result.table && item.result.table.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-medium mb-3">Query Results</h3>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      {Object.keys(item.result.table[0]).map((key) => (
                        <th
                          key={key}
                          className="text-left px-4 py-3 text-sm font-medium text-muted-foreground uppercase tracking-wider"
                        >
                          {key}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {item.result.table.map((row, idx) => (
                      <tr key={idx} className="border-b border-border last:border-0 hover:bg-muted/30">
                        {Object.values(row).map((value, vIdx) => (
                          <td key={vIdx} className="px-4 py-3 text-sm">
                            {String(value)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Chart */}
          {item.result.chartData && item.result.chartData.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-3">Visualization</h3>
              <div className="bg-card border border-border rounded-lg p-4">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={item.result.chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="name"
                      stroke="#64748b"
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis stroke="#64748b" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#ffffff",
                        border: "1px solid #e2e8f0",
                        borderRadius: "8px",
                      }}
                      formatter={(value: number) => `$${value.toLocaleString()}`}
                    />
                    <Bar
                      dataKey="sales"
                      fill="#6366f1"
                      radius={[8, 8, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
