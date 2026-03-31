import { RouterProvider } from "react-router";
import { router } from "./routes";
import { DataProvider } from "./contexts/data-context";
import { HistoryProvider } from "./contexts/history-context";
import { ThemeProvider } from "./contexts/theme-context";
import { useEffect } from "react";

export default function App() {
  useEffect(() => {
    // Suppress Recharts duplicate key warnings (known library issue)
    const originalError = console.error;
    console.error = (...args) => {
      if (
        typeof args[0] === 'string' &&
        args[0].includes('Encountered two children with the same key')
      ) {
        return; // Suppress this specific warning
      }
      originalError.call(console, ...args);
    };

    return () => {
      console.error = originalError;
    };
  }, []);

  return (
    <ThemeProvider>
      <DataProvider>
        <HistoryProvider>
          <RouterProvider router={router} />
        </HistoryProvider>
      </DataProvider>
    </ThemeProvider>
  );
}