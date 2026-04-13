import { Outlet } from "react-router";
import { SmoothScrollProvider } from "../hooks/use-smooth-scroll";

export function RootLayout() {
  return (
    <SmoothScrollProvider>
      <Outlet />
    </SmoothScrollProvider>
  );
}
