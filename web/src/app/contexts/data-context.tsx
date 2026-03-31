import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";

import type { UploadedData } from "../types/data";

export type { DataRow, SheetData, UploadedData } from "../types/data";

interface DataContextType {
  data: UploadedData | null;
  setData: (data: UploadedData | null) => void;
  isDataLoaded: boolean;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<UploadedData | null>(null);

  return (
    <DataContext.Provider
      value={{
        data,
        setData,
        isDataLoaded: data !== null,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error("useData must be used within a DataProvider");
  }
  return context;
}
