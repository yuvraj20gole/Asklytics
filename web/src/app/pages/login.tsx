import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router";

import { login as apiLogin } from "@/lib/api";
import { setToken } from "@/lib/auth";
import { GlassPageBackdrop } from "../components/glass-page-backdrop";
import { useMotionPageEffects } from "../hooks/use-motion-page-effects";

export function Login() {
  const rootRef = useRef<HTMLDivElement>(null);
  const topBarRef = useRef<HTMLDivElement>(null);
  const columnRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useMotionPageEffects({
    root: rootRef,
    header: topBarRef,
    ctaBlocks: [cardRef],
    parallaxInners: [{ section: rootRef, inner: columnRef }],
  });

  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: "",
    password: ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.email || !formData.password) {
      return;
    }

    setLoading(true);
    try {
      const res = await apiLogin(formData.email.trim(), formData.password);
      setToken(res.access_token);
      localStorage.setItem("asklytics_company", formData.email.trim());
      navigate("/welcome");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const fillDemoCredentials = () => {
    // Matches backend seed user (see backend/app/db/seed.py)
    setFormData({
      email: "admin@example.com",
      password: "admin123",
    });
  };

  return (
    <div
      ref={rootRef}
      className="relative min-h-screen px-4 py-6 text-slate-900 dark:text-slate-100"
    >
      <GlassPageBackdrop tone="warm" />
      {/* Top Header */}
      <div
        ref={topBarRef}
        className="mx-auto mb-12 flex max-w-6xl items-center justify-between"
      >
        <Link
          to="/"
          className="text-3xl font-bold leading-none text-[#1e7a5c] sm:text-4xl md:text-[2.5rem]"
          style={{ fontFamily: "Space Grotesk, sans-serif" }}
        >
          Asklytics
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600 dark:text-slate-400">No account?</span>
          <Link
            to="/register"
            className="rounded-lg bg-[#1e7a5c] px-4 py-2 text-sm text-white transition-colors hover:bg-[#196a4f]"
          >
            Register free
          </Link>
        </div>
      </div>

      {/* Login Card */}
      <div ref={columnRef} className="mx-auto max-w-md">
        <div
          ref={cardRef}
          className="rounded-3xl border border-white/60 bg-white/85 p-10 shadow-lg backdrop-blur-md dark:border-white/10 dark:bg-slate-900/80"
        >
          {/* Logo */}
          <div className="text-center mb-6">
            <div className="text-3xl sm:text-4xl font-bold text-[#1e7a5c] leading-none" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              Asklytics
            </div>
          </div>

          {/* Heading */}
          <h1
            className="mb-2 text-center text-3xl font-bold text-slate-900 dark:text-slate-50"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Welcome back
          </h1>
          <p className="mb-8 text-center text-gray-600 dark:text-slate-400">
            Log in to your Asklytics dashboard
          </p>

          {error && (
            <div
              className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
              role="alert"
            >
              {error}
            </div>
          )}

          {/* Demo Account Section */}
          <div className="mb-6 rounded-xl border border-stone-200/80 bg-[#e8e4dc] p-5 dark:border-slate-600 dark:bg-slate-800/90">
            <div className="mb-3 text-xs font-semibold tracking-wide text-gray-700 dark:text-slate-400">
              DEMO ACCOUNT
            </div>
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="text-sm text-gray-600 dark:text-slate-400">Email:</span>
                <span className="ml-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                  admin@example.com
                </span>
              </div>
              <div>
                <span className="text-sm text-gray-600 dark:text-slate-400">Password:</span>
                <span className="ml-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                  admin123
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={fillDemoCredentials}
              className="w-full rounded-lg bg-[#d4f4e7] px-4 py-2 text-sm font-medium text-[#1e7a5c] transition-colors hover:bg-[#c0edd9] dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-900/50"
            >
              Fill demo credentials
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email Input */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-300">
                Email or Username
              </label>
              <input
                type="text"
                name="email"
                autoComplete="username"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full rounded-lg border-0 bg-[#e8e4dc] px-4 py-3 text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[#1e7a5c] dark:border dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                placeholder="you@company.com or username"
              />
            </div>

            {/* Password Input */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">
                  Password
                </label>
                <Link
                  to="#"
                  className="text-sm text-[#1e7a5c] hover:underline dark:text-emerald-400"
                >
                  Forgot password?
                </Link>
              </div>
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full rounded-lg border-0 bg-[#e8e4dc] px-4 py-3 text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[#1e7a5c] dark:border dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                placeholder="Enter your password"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[#1e7a5c] text-white rounded-lg hover:bg-[#196a4f] transition-colors font-medium text-base disabled:opacity-60"
            >
              {loading ? "Signing in…" : "Log in to Asklytics →"}
            </button>
          </form>

          {/* Bottom Link */}
          <p className="mt-6 text-center text-sm text-gray-600 dark:text-slate-400">
            No account?{" "}
            <Link
              to="/register"
              className="font-medium text-[#1e7a5c] hover:underline dark:text-emerald-400"
            >
              Register for free
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
