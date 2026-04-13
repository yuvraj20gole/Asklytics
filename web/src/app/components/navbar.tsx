import { forwardRef } from "react";
import { Link, useLocation } from "react-router";
import {
  LayoutDashboard,
  MessageSquare,
  History,
  BarChart3,
  Settings,
  User,
} from "lucide-react";
import { cn } from "./ui/utils";

export const Navbar = forwardRef<HTMLElement, { className?: string }>(
  function Navbar({ className }, ref) {
  const location = useLocation();
  
  const isActive = (path: string) => location.pathname === path;
  
  const navItems = [
    { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { path: "/chat", label: "Chat", icon: MessageSquare },
    { path: "/history", label: "History", icon: History },
    { path: "/analytics", label: "Analytics", icon: BarChart3 },
    { path: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <nav
      ref={ref}
      className={cn(
        "sticky top-0 z-50 overflow-hidden border-b border-white/20 bg-white/40 shadow-[0_8px_32px_rgba(0,0,0,0.08)] backdrop-blur-lg supports-[backdrop-filter]:bg-white/35 dark:border-white/10 dark:bg-white/10 dark:supports-[backdrop-filter]:bg-white/10 before:pointer-events-none before:absolute before:inset-0 before:bg-gradient-to-b before:from-white/40 before:to-transparent before:opacity-45 dark:before:from-white/10",
        className,
      )}
    >
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between min-h-16 py-2 sm:py-2.5">
          <div className="flex items-center gap-8">
            <Link to="/dashboard" className="flex items-center gap-2 group">
              <div className="text-2xl sm:text-3xl md:text-4xl font-bold leading-none bg-gradient-to-r from-primary to-green-500 bg-clip-text text-transparent">
                Asklytics
              </div>
            </Link>
            
            <div className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                      isActive(item.path)
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
          
          <div className="flex items-center">
            <button className="w-9 h-9 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors">
              <User className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
},
);

Navbar.displayName = "Navbar";