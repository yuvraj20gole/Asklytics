import { Navbar } from "../components/navbar";
import { Clock, CheckCircle2, Database, AlertCircle } from "lucide-react";
import { useHistory } from "../contexts/history-context";
import { HistoryDetailModal } from "../components/history-detail-modal";
import { format } from "date-fns";
import { useState } from "react";

export function History() {
  const { history } = useHistory();
  const [selectedItem, setSelectedItem] = useState<typeof history[0] | null>(null);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="mb-2">Query History</h1>
          <p className="text-muted-foreground">
            View and reopen your past queries
          </p>
        </div>

        {history.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-muted mx-auto mb-4 flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="mb-2">No Query History Yet</h3>
            <p className="text-muted-foreground">
              Your query history will appear here after you start asking questions in the chat.
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {history.map((item) => (
              <div
                key={item.id}
                className="bg-card border border-border rounded-xl p-6 hover:shadow-md transition-shadow cursor-pointer group"
                onClick={() => setSelectedItem(item)}
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Database className="w-6 h-6 text-primary" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <h3 className="group-hover:text-primary transition-colors">
                        {item.question}
                      </h3>
                      <CheckCircle2 className="w-5 h-5 text-secondary flex-shrink-0" />
                    </div>

                    <p className="text-muted-foreground text-sm mb-3">
                      {item.result.message}
                    </p>

                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="w-4 h-4" />
                      <span>{format(new Date(item.timestamp), "MMMM d, yyyy 'at' h:mm a")}</span>
                    </div>

                    {/* SQL Preview */}
                    <div className="mt-4 bg-muted/30 rounded-lg p-3">
                      <pre className="text-xs text-muted-foreground overflow-x-auto">
                        <code>{item.sql}</code>
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedItem && (
        <HistoryDetailModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </div>
  );
}