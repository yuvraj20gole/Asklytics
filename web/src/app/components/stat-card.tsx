import type { LucideIcon } from "lucide-react";
import { cn } from "./ui/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  trendUp?: boolean;
  /** Use inside `AnimatedCard` to avoid double borders / backgrounds. */
  embedded?: boolean;
}

export function StatCard({
  title,
  value,
  icon: Icon,
  trend,
  trendUp,
  embedded,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl p-6 transition-shadow",
        embedded
          ? "bg-transparent border-0 shadow-none"
          : "bg-card border border-border shadow-sm hover:shadow-md",
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-muted-foreground text-sm mb-1">{title}</p>
          <h3 className="text-3xl font-semibold mb-2">{value}</h3>
          {trend && (
            <p className={`text-sm ${trendUp ? "text-secondary" : "text-destructive"}`}>
              {trend}
            </p>
          )}
        </div>
        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="w-6 h-6 text-primary" />
        </div>
      </div>
    </div>
  );
}
