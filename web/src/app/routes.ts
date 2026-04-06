import { createBrowserRouter } from "react-router";
import { Landing } from "./pages/landing";
import { Register } from "./pages/register";
import { Login } from "./pages/login";
import { Welcome } from "./pages/welcome";
import { Dashboard } from "./pages/dashboard";
import { Chat } from "./pages/chat";
import { History } from "./pages/history";
import { Analytics } from "./pages/analytics";
import { Settings } from "./pages/settings";

const basename =
  import.meta.env.BASE_URL.replace(/\/$/, "") || undefined;

export const router = createBrowserRouter(
  [
  {
    path: "/",
    Component: Landing,
  },
  {
    path: "/register",
    Component: Register,
  },
  {
    path: "/login",
    Component: Login,
  },
  {
    path: "/welcome",
    Component: Welcome,
  },
  {
    path: "/dashboard",
    Component: Dashboard,
  },
  {
    path: "/chat",
    Component: Chat,
  },
  {
    path: "/history",
    Component: History,
  },
  {
    path: "/analytics",
    Component: Analytics,
  },
  {
    path: "/settings",
    Component: Settings,
  },
  ],
  basename ? { basename } : undefined,
);