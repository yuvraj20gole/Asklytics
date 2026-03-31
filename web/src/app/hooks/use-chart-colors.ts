import { useTheme } from "../contexts/theme-context";

export function useChartColors() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return {
    // Grid and axes
    gridColor: isDark ? "#334155" : "#e5e7eb",
    axisColor: isDark ? "#64748b" : "#9ca3af",
    axisTextColor: isDark ? "#94a3b8" : "#6b7280",
    
    // Tooltip
    tooltipBg: isDark ? "#1e293b" : "#ffffff",
    tooltipBorder: isDark ? "#334155" : "#e5e7eb",
    tooltipText: isDark ? "#f1f5f9" : "#0f172a",
    
    // Chart colors (using theme colors)
    primary: "#6366f1",      // Indigo
    secondary: "#22c55e",    // Green
    tertiary: "#3b82f6",     // Blue
    quaternary: "#f59e0b",   // Amber
    quinary: "#8b5cf6",      // Purple
    
    // Pie chart colors
    pieColors: [
      "#6366f1", // Indigo
      "#22c55e", // Green
      "#f59e0b", // Amber
      "#8b5cf6", // Purple
      "#ec4899", // Pink
      "#3b82f6", // Blue
      "#14b8a6", // Teal
      "#f43f5e", // Rose
      "#84cc16", // Lime
      "#06b6d4", // Cyan
    ],
    
    // Text colors
    textPrimary: isDark ? "#f1f5f9" : "#0f172a",
    textSecondary: isDark ? "#94a3b8" : "#64748b",
    textMuted: isDark ? "#64748b" : "#9ca3af",
    
    // Background colors
    cardBg: isDark ? "#1e293b" : "#ffffff",
    dotStroke: isDark ? "#1e293b" : "#ffffff",
  };
}
