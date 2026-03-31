import { useState } from "react";
import { Link, useNavigate } from "react-router";

import { register as apiRegister } from "@/lib/api";

export function Register() {
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
    <div className="min-h-screen bg-[#ede8e0] px-4 py-6">
      {/* Top Header */}
      <div className="max-w-6xl mx-auto flex items-center justify-between mb-12">
        <Link to="/" className="text-2xl font-bold text-[#1e7a5c]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
          Asklytics
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-gray-600 text-sm">Already have an account?</span>
          <Link 
            to="/login" 
            className="px-5 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors"
          >
            Log in
          </Link>
        </div>
      </div>

      {/* Register Card */}
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-3xl p-10 shadow-lg">
          {/* Logo */}
          <div className="text-center mb-6">
            <div className="text-2xl font-bold text-[#1e7a5c]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              Asklytics
            </div>
          </div>

          {/* Heading */}
          <h1 className="text-center text-3xl font-bold mb-2" style={{ fontFamily: 'var(--font-display)' }}>
            Create your account
          </h1>
          <p className="text-center text-gray-600 mb-8">
            Start analyzing your financial data in minutes.
          </p>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Company Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Company Email
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-3 bg-[#e8e4dc] border-0 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e7a5c] text-gray-900 placeholder:text-gray-500"
                placeholder="you@company.com"
              />
              {errors.email && <p className="text-red-600 text-sm mt-1">{errors.email}</p>}
            </div>

            {/* Username */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Username
              </label>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                className="w-full px-4 py-3 bg-[#e8e4dc] border-0 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e7a5c] text-gray-900 placeholder:text-gray-500"
                placeholder="e.g. alexchen"
              />
              {errors.username && <p className="text-red-600 text-sm mt-1">{errors.username}</p>}
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-4 py-3 bg-[#e8e4dc] border-0 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e7a5c] text-gray-900 placeholder:text-gray-500"
                placeholder="Minimum 8 characters"
              />
              {errors.password && <p className="text-red-600 text-sm mt-1">{errors.password}</p>}
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Confirm Password
              </label>
              <input
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                className="w-full px-4 py-3 bg-[#e8e4dc] border-0 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e7a5c] text-gray-900 placeholder:text-gray-500"
                placeholder="Re-enter password"
              />
              {errors.confirmPassword && <p className="text-red-600 text-sm mt-1">{errors.confirmPassword}</p>}
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
            <p className="text-xs text-gray-500 mb-3">
              By registering you agree to our{" "}
              <Link to="#" className="text-[#1e7a5c] hover:underline">
                Terms
              </Link>{" "}
              and{" "}
              <Link to="#" className="text-[#1e7a5c] hover:underline">
                Privacy Policy
              </Link>
            </p>
            <p className="text-sm text-gray-600">
              Already have an account?{" "}
              <Link to="/login" className="text-[#1e7a5c] font-medium hover:underline">
                Log in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
