import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router";

import { register as apiRegister } from "@/lib/api";
import { GlassPageBackdrop } from "../components/glass-page-backdrop";
import { useMotionPageEffects } from "../hooks/use-motion-page-effects";

export function Register() {
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
    username: "",
    password: "",
    confirmPassword: ""
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const newErrors: Record<string, string> = {};

    if (!formData.email) newErrors.email = "Email is required";
    if (!formData.username) newErrors.username = "Username is required";
    if (!formData.password) newErrors.password = "Password is required";
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }
    if (formData.password && formData.password.length < 8) {
      newErrors.password = "Password must be at least 8 characters";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);
    try {
      await apiRegister({
        company_email: formData.email.trim(),
        username: formData.username.trim(),
        password: formData.password,
      });
      navigate("/login", { state: { registered: true } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
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
          <span className="text-sm text-gray-600 dark:text-slate-400">
            Already have an account?
          </span>
          <Link
            to="/login"
            className="rounded-lg border border-gray-300 px-5 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Log in
          </Link>
        </div>
      </div>

      {/* Register Card */}
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
            Create your account
          </h1>
          <p className="mb-8 text-center text-gray-600 dark:text-slate-400">
            Start analyzing your financial data in minutes.
          </p>

          {error && (
            <div
              className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
              role="alert"
            >
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Company Email */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-300">
                Company Email
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full rounded-lg border-0 bg-[#e8e4dc] px-4 py-3 text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[#1e7a5c] dark:border dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                placeholder="you@company.com"
              />
              {errors.email && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.email}</p>
              )}
            </div>

            {/* Username */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-300">
                Username
              </label>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                className="w-full rounded-lg border-0 bg-[#e8e4dc] px-4 py-3 text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[#1e7a5c] dark:border dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                placeholder="e.g. alexchen"
              />
              {errors.username && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.username}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-300">
                Password
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full rounded-lg border-0 bg-[#e8e4dc] px-4 py-3 text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[#1e7a5c] dark:border dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                placeholder="Minimum 8 characters"
              />
              {errors.password && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.password}</p>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-300">
                Confirm Password
              </label>
              <input
                type="password"
                value={formData.confirmPassword}
                onChange={(e) =>
                  setFormData({ ...formData, confirmPassword: e.target.value })
                }
                className="w-full rounded-lg border-0 bg-[#e8e4dc] px-4 py-3 text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[#1e7a5c] dark:border dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                placeholder="Re-enter password"
              />
              {errors.confirmPassword && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                  {errors.confirmPassword}
                </p>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[#1e7a5c] text-white rounded-lg hover:bg-[#196a4f] transition-colors font-medium text-base disabled:opacity-60"
            >
              {loading ? "Creating account…" : "Create Account →"}
            </button>
          </form>

          {/* Terms and Login Link */}
          <div className="mt-6 text-center">
            <p className="mb-3 text-xs text-gray-500 dark:text-slate-500">
              By registering you agree to our{" "}
              <Link
                to="#"
                className="text-[#1e7a5c] hover:underline dark:text-emerald-400"
              >
                Terms
              </Link>{" "}
              and{" "}
              <Link
                to="#"
                className="text-[#1e7a5c] hover:underline dark:text-emerald-400"
              >
                Privacy Policy
              </Link>
            </p>
            <p className="text-sm text-gray-600 dark:text-slate-400">
              Already have an account?{" "}
              <Link
                to="/login"
                className="font-medium text-[#1e7a5c] hover:underline dark:text-emerald-400"
              >
                Log in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
