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
    <div ref={rootRef} className="relative min-h-screen px-4 py-6">
      <GlassPageBackdrop tone="warm" />
      {/* Top Header */}
      <div ref={topBarRef} className="max-w-6xl mx-auto flex items-center justify-between mb-12">
        <Link to="/" className="text-3xl sm:text-4xl md:text-[2.5rem] font-bold text-[#1e7a5c] leading-none" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
          Asklytics
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-gray-600 text-sm">No account?</span>
          <Link 
            to="/register" 
            className="px-4 py-2 bg-[#1e7a5c] text-white rounded-lg text-sm hover:bg-[#196a4f] transition-colors"
          >
            Register free
          </Link>
        </div>
      </div>

      {/* Login Card */}
      <div ref={columnRef} className="max-w-md mx-auto">
        <div
          ref={cardRef}
          className="bg-white/85 backdrop-blur-md rounded-3xl p-10 shadow-lg border border-white/60"
        >
          {/* Logo */}
          <div className="text-center mb-6">
            <div className="text-3xl sm:text-4xl font-bold text-[#1e7a5c] leading-none" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              Asklytics
            </div>
          </div>

          {/* Heading */}
          <h1 className="text-center text-3xl font-bold mb-2" style={{ fontFamily: 'var(--font-display)' }}>
            Welcome back
          </h1>
          <p className="text-center text-gray-600 mb-8">
            Log in to your Asklytics dashboard
          </p>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </div>
          )}

          {/* Demo Account Section */}
          <div className="bg-[#e8e4dc] rounded-xl p-5 mb-6">
            <div className="text-xs font-semibold text-gray-700 mb-3 tracking-wide">DEMO ACCOUNT</div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-sm text-gray-600">Email:</span>
                <span className="ml-2 text-sm font-medium">admin@example.com</span>
              </div>
              <div>
                <span className="text-sm text-gray-600">Password:</span>
                <span className="ml-2 text-sm font-medium">admin123</span>
              </div>
            </div>
            <button
              type="button"
              onClick={fillDemoCredentials}
              className="w-full px-4 py-2 bg-[#d4f4e7] text-[#1e7a5c] rounded-lg text-sm font-medium hover:bg-[#c0edd9] transition-colors"
            >
              Fill demo credentials
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email or Username
              </label>
              <input
                type="text"
                name="email"
                autoComplete="username"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-3 bg-[#e8e4dc] border-0 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e7a5c] text-gray-900 placeholder:text-gray-500"
                placeholder="you@company.com or username"
              />
            </div>

            {/* Password Input */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <Link to="#" className="text-sm text-[#1e7a5c] hover:underline">
                  Forgot password?
                </Link>
              </div>
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-4 py-3 bg-[#e8e4dc] border-0 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e7a5c] text-gray-900 placeholder:text-gray-500"
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
          <p className="text-center text-sm text-gray-600 mt-6">
            No account?{" "}
            <Link to="/register" className="text-[#1e7a5c] font-medium hover:underline">
              Register for free
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
