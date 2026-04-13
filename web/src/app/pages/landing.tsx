import { useRef } from "react";
import { Link } from "react-router";
import { Upload, MessageSquare, Lock, BarChart3 } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { GlassPageBackdrop } from "../components/glass-page-backdrop";
import { useLandingScrollEffects } from "../hooks/use-landing-scroll-effects";

export function Landing() {
  const pie = [
    { name: "Products", value: 45, color: "#1a6b4a" },
    { name: "Services", value: 28, color: "#2563eb" },
    { name: "Other", value: 27, color: "#d97706" },
  ];

  const rootRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const heroSectionRef = useRef<HTMLElement>(null);
  const heroBadgeRef = useRef<HTMLDivElement>(null);
  const heroHeadingRef = useRef<HTMLHeadingElement>(null);
  const heroSubRef = useRef<HTMLParagraphElement>(null);
  const heroCtasRef = useRef<HTMLDivElement>(null);
  const featuresGridRef = useRef<HTMLDivElement>(null);
  const featureCard0Ref = useRef<HTMLDivElement>(null);
  const featureCard1Ref = useRef<HTMLDivElement>(null);
  const featureCard2Ref = useRef<HTMLDivElement>(null);
  const featureCard3Ref = useRef<HTMLDivElement>(null);
  const howSectionRef = useRef<HTMLElement>(null);
  const howInnerRef = useRef<HTMLDivElement>(null);
  const stepCard0Ref = useRef<HTMLDivElement>(null);
  const stepCard1Ref = useRef<HTMLDivElement>(null);
  const stepCard2Ref = useRef<HTMLDivElement>(null);
  const mockBlockRef = useRef<HTMLDivElement>(null);
  const aboutSectionRef = useRef<HTMLElement>(null);
  const statsGridRef = useRef<HTMLDivElement>(null);
  const statCard0Ref = useRef<HTMLDivElement>(null);
  const statCard1Ref = useRef<HTMLDivElement>(null);
  const statCard2Ref = useRef<HTMLDivElement>(null);
  const ctaBlockRef = useRef<HTMLDivElement>(null);
  const howIntroRef = useRef<HTMLDivElement>(null);
  const howMidRef = useRef<HTMLDivElement>(null);
  const mockChromeRef = useRef<HTMLDivElement>(null);
  const aboutHeadingRef = useRef<HTMLHeadingElement>(null);
  const footerRef = useRef<HTMLElement>(null);

  useLandingScrollEffects({
    root: rootRef,
    header: headerRef,
    heroSection: heroSectionRef,
    heroBadge: heroBadgeRef,
    heroHeading: heroHeadingRef,
    heroSub: heroSubRef,
    heroCtas: heroCtasRef,
    featuresGrid: featuresGridRef,
    featureCards: [featureCard0Ref, featureCard1Ref, featureCard2Ref, featureCard3Ref],
    howSection: howSectionRef,
    howInner: howInnerRef,
    stepCards: [stepCard0Ref, stepCard1Ref, stepCard2Ref],
    mockBlock: mockBlockRef,
    aboutSection: aboutSectionRef,
    statsGrid: statsGridRef,
    statCards: [statCard0Ref, statCard1Ref, statCard2Ref],
    ctaBlock: ctaBlockRef,
    howIntro: howIntroRef,
    howMid: howMidRef,
    mockChrome: mockChromeRef,
    aboutHeading: aboutHeadingRef,
    footer: footerRef,
  });

  return (
    <div ref={rootRef} className="relative min-h-screen text-slate-900">
      <GlassPageBackdrop tone="mint" />
      {/* Header */}
      <header
        ref={headerRef}
        className="relative overflow-hidden border-b border-white/20 bg-white/35 shadow-[0_8px_32px_rgba(0,0,0,0.08)] backdrop-blur-lg supports-[backdrop-filter]:bg-white/30 dark:border-white/10 dark:bg-white/10 dark:supports-[backdrop-filter]:bg-white/10 before:pointer-events-none before:absolute before:inset-0 before:bg-gradient-to-b before:from-white/50 before:to-transparent before:opacity-45 dark:before:from-white/10"
      >
        <div className="relative z-10 max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="text-3xl sm:text-4xl md:text-[2.5rem] font-bold text-[#1e7a5c] leading-none" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Asklytics
          </Link>
          
          <nav className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-gray-600 hover:text-gray-900 transition-colors">Features</a>
            <a href="#how-it-works" className="text-gray-600 hover:text-gray-900 transition-colors">How it works</a>
            <a href="#about" className="text-gray-600 hover:text-gray-900 transition-colors">About</a>
          </nav>
          
          <div className="flex items-center gap-4">
            <Link to="/login" className="text-gray-700 hover:text-gray-900 transition-colors">
              Log in
            </Link>
            <Link 
              to="/register" 
              className="px-5 py-2 bg-[#1e7a5c] text-white rounded-lg hover:bg-[#196a4f] transition-colors shadow-sm"
            >
              Get started →
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section ref={heroSectionRef} className="max-w-7xl mx-auto px-6 py-20 text-center">
        <div ref={heroBadgeRef} className="inline-flex items-center gap-2 px-4 py-2 bg-[#d4f4e7] rounded-full text-sm text-[#1e7a5c] mb-8">
          <span className="text-lg">🤖</span>
          <span className="font-medium">AI-Powered Financial Intelligence</span>
        </div>
        
        <h1 ref={heroHeadingRef} className="text-6xl md:text-7xl font-bold mb-6 leading-tight" style={{ fontFamily: 'var(--font-display)' }}>
          Ask your data.
          <br />
          Get <em className="italic text-[#22c55e]">answers</em>, not
          <br />
          spreadsheets.
        </h1>
        
        <p ref={heroSubRef} className="text-xl text-gray-600 max-w-2xl mx-auto mb-10 leading-relaxed">
          Upload any financial statement — CSV, Excel, or PDF — and ask questions in plain English. 
          Asklytics turns your data into instant SQL queries, tables, and visualisations.
        </p>
        
        <div ref={heroCtasRef} className="flex items-center justify-center gap-4 mb-20">
          <Link 
            to="/register" 
            className="px-8 py-3 bg-[#1e7a5c] text-white rounded-lg hover:bg-[#196a4f] transition-colors shadow-lg text-lg font-medium"
          >
            Start for free →
          </Link>
          <Link 
            to="/login" 
            className="px-8 py-3 text-gray-700 hover:text-gray-900 transition-colors text-lg"
          >
            Sign in
          </Link>
        </div>

        {/* Feature Cards */}
        <div ref={featuresGridRef} id="features" className="grid md:grid-cols-4 gap-6 max-w-6xl mx-auto">
          <div
            ref={featureCard0Ref}
            className="relative overflow-hidden rounded-2xl border border-white/20 bg-white/35 p-6 text-left shadow-[0_8px_32px_rgba(0,0,0,0.1)] backdrop-blur-lg dark:border-white/10 dark:bg-white/10 before:pointer-events-none before:absolute before:inset-0 before:rounded-2xl before:bg-gradient-to-br before:from-white/55 before:via-transparent before:to-transparent before:opacity-60 dark:before:from-white/15"
          >
            <div className="w-12 h-12 bg-[#e0f2fe] rounded-xl flex items-center justify-center mb-4">
              <Upload className="w-6 h-6 text-[#0284c7]" />
            </div>
            <h3 className="font-bold text-lg mb-2" style={{ fontFamily: 'var(--font-display)' }}>Upload any format</h3>
            <p className="text-gray-600 text-sm">
              CSV, Excel, or PDF financial statements — upload multiple files at once.
            </p>
          </div>

          <div
            ref={featureCard1Ref}
            className="relative overflow-hidden rounded-2xl border border-white/20 bg-white/35 p-6 text-left shadow-[0_8px_32px_rgba(0,0,0,0.1)] backdrop-blur-lg dark:border-white/10 dark:bg-white/10 before:pointer-events-none before:absolute before:inset-0 before:rounded-2xl before:bg-gradient-to-br before:from-white/55 before:via-transparent before:to-transparent before:opacity-60 dark:before:from-white/15"
          >
            <div className="w-12 h-12 bg-[#dcfce7] rounded-xl flex items-center justify-center mb-4">
              <MessageSquare className="w-6 h-6 text-[#22c55e]" />
            </div>
            <h3 className="font-bold text-lg mb-2" style={{ fontFamily: 'var(--font-display)' }}>Ask in plain English</h3>
            <p className="text-gray-600 text-sm">
              "Q1 profit?" "What was Q1 profit?" Just get a concise answer instantly.
            </p>
          </div>

          <div
            ref={featureCard2Ref}
            className="relative overflow-hidden rounded-2xl border border-white/20 bg-white/35 p-6 text-left shadow-[0_8px_32px_rgba(0,0,0,0.1)] backdrop-blur-lg dark:border-white/10 dark:bg-white/10 before:pointer-events-none before:absolute before:inset-0 before:rounded-2xl before:bg-gradient-to-br before:from-white/55 before:via-transparent before:to-transparent before:opacity-60 dark:before:from-white/15"
          >
            <div className="w-12 h-12 bg-[#fef3c7] rounded-xl flex items-center justify-center mb-4">
              <BarChart3 className="w-6 h-6 text-[#f59e0b]" />
            </div>
            <h3 className="font-bold text-lg mb-2" style={{ fontFamily: 'var(--font-display)' }}>Auto-visualisation</h3>
            <p className="text-gray-600 text-sm">
              Every query auto-selects the best chart — bar, line, area, or pie.
            </p>
          </div>

          <div
            ref={featureCard3Ref}
            className="relative overflow-hidden rounded-2xl border border-white/20 bg-white/35 p-6 text-left shadow-[0_8px_32px_rgba(0,0,0,0.1)] backdrop-blur-lg dark:border-white/10 dark:bg-white/10 before:pointer-events-none before:absolute before:inset-0 before:rounded-2xl before:bg-gradient-to-br before:from-white/55 before:via-transparent before:to-transparent before:opacity-60 dark:before:from-white/15"
          >
            <div className="w-12 h-12 bg-[#fee2e2] rounded-xl flex items-center justify-center mb-4">
              <Lock className="w-6 h-6 text-[#ef4444]" />
            </div>
            <h3 className="font-bold text-lg mb-2" style={{ fontFamily: 'var(--font-display)' }}>Secure by design</h3>
            <p className="text-gray-600 text-sm">
              Your data stays in your session. Nothing stored without consent.
            </p>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section
        ref={howSectionRef}
        id="how-it-works"
        className="relative overflow-hidden border-y border-white/15 bg-gradient-to-br from-slate-100/80 via-[#f0f4f3]/90 to-[#e2e8eb]/95 py-20 backdrop-blur-md dark:border-white/10 dark:from-neutral-900/40 dark:via-neutral-900/30 dark:to-neutral-950/45"
      >
        <div ref={howInnerRef} className="relative z-10 max-w-7xl mx-auto px-6">
          <div ref={howIntroRef} className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold mb-4" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              How Asklytics works
            </h2>
            <p className="text-xl text-gray-600">
              Three steps from raw data to business insight.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-20">
            <div
              ref={stepCard0Ref}
              className="relative overflow-hidden rounded-2xl border border-white/20 bg-white/30 p-8 shadow-[0_8px_32px_rgba(0,0,0,0.1)] backdrop-blur-lg dark:border-white/10 dark:bg-white/10 before:pointer-events-none before:absolute before:inset-0 before:rounded-2xl before:bg-gradient-to-br before:from-white/45 before:to-transparent before:opacity-55 dark:before:from-white/12"
            >
              <div className="text-sm text-gray-500 mb-3">01</div>
              <h3 className="text-2xl font-bold mb-3" style={{ fontFamily: 'var(--font-display)' }}>Upload your file</h3>
              <p className="text-gray-600">
                CSV, Excel, or PDF financial statement. Multiple files supported.
              </p>
            </div>

            <div
              ref={stepCard1Ref}
              className="relative overflow-hidden rounded-2xl border border-white/20 bg-white/30 p-8 shadow-[0_8px_32px_rgba(0,0,0,0.1)] backdrop-blur-lg dark:border-white/10 dark:bg-white/10 before:pointer-events-none before:absolute before:inset-0 before:rounded-2xl before:bg-gradient-to-br before:from-white/45 before:to-transparent before:opacity-55 dark:before:from-white/12"
            >
              <div className="text-sm text-gray-500 mb-3">02</div>
              <h3 className="text-2xl font-bold mb-3" style={{ fontFamily: 'var(--font-display)' }}>Ask a question</h3>
              <p className="text-gray-600">
                Type anything — revenues, trends, comparisons, profit margins.
              </p>
            </div>

            <div
              ref={stepCard2Ref}
              className="relative overflow-hidden rounded-2xl border border-white/20 bg-white/30 p-8 shadow-[0_8px_32px_rgba(0,0,0,0.1)] backdrop-blur-lg dark:border-white/10 dark:bg-white/10 before:pointer-events-none before:absolute before:inset-0 before:rounded-2xl before:bg-gradient-to-br before:from-white/45 before:to-transparent before:opacity-55 dark:before:from-white/12"
            >
              <div className="text-sm text-gray-500 mb-3">03</div>
              <h3 className="text-2xl font-bold mb-3" style={{ fontFamily: 'var(--font-display)' }}>Get instant insight</h3>
              <p className="text-gray-600">
                AI returns SQL, a data table, plain-English explanation, and a chart.
              </p>
            </div>
          </div>

          <div ref={howMidRef} className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
              Your finances, finally <span className="italic text-[#22c55e]">readable</span>
            </h2>
          </div>

          {/* Dashboard Mockup */}
          <div ref={mockBlockRef} className="max-w-5xl mx-auto">
            <div
              ref={mockChromeRef}
              className="relative overflow-hidden rounded-3xl border border-white/20 bg-white/30 p-8 shadow-[0_8px_32px_rgba(0,0,0,0.12)] backdrop-blur-xl dark:border-white/10 dark:bg-white/10 before:pointer-events-none before:absolute before:inset-0 before:rounded-3xl before:bg-gradient-to-br before:from-white/40 before:to-transparent before:opacity-50 dark:before:from-white/10"
            >
              {/* Browser Chrome */}
              <div className="flex items-center gap-2 mb-6">
                <div className="w-3 h-3 rounded-full bg-[#ff5f57]"></div>
                <div className="w-3 h-3 rounded-full bg-[#febc2e]"></div>
                <div className="w-3 h-3 rounded-full bg-[#28c840]"></div>
                <div className="ml-4 flex-1 rounded-lg border border-white/20 bg-white/40 px-4 py-2 text-center text-sm text-gray-400 shadow-[0_4px_16px_rgba(0,0,0,0.06)] backdrop-blur-md dark:border-white/10 dark:bg-white/10">
                  asklytics.io/dashboard
                </div>
              </div>

              {/* Dashboard Content */}
              <div className="relative overflow-hidden rounded-2xl border border-white/20 bg-white/40 p-8 shadow-[0_8px_32px_rgba(0,0,0,0.08)] backdrop-blur-lg dark:border-white/10 dark:bg-white/10 before:pointer-events-none before:absolute before:inset-0 before:rounded-2xl before:bg-gradient-to-br before:from-white/35 before:to-transparent before:opacity-45 dark:before:from-white/10">
                {/* Metric Cards */}
                <div className="grid grid-cols-4 gap-4 mb-8">
                  <div className="relative overflow-hidden rounded-xl border border-white/20 bg-white/35 p-5 shadow-[0_4px_24px_rgba(0,0,0,0.06)] backdrop-blur-md dark:border-white/10 dark:bg-white/10">
                    <div className="text-xs font-medium text-gray-500 mb-2 tracking-wider">TOTAL REVENUE</div>
                    <div className="text-3xl font-bold mb-2" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>$6.93M</div>
                    <div className="text-sm text-[#22c55e] flex items-center gap-1 font-medium">
                      ↑ +22.4%
                    </div>
                  </div>
                  <div className="relative overflow-hidden rounded-xl border border-white/20 bg-white/35 p-5 shadow-[0_4px_24px_rgba(0,0,0,0.06)] backdrop-blur-md dark:border-white/10 dark:bg-white/10">
                    <div className="text-xs font-medium text-gray-500 mb-2 tracking-wider">NET PROFIT</div>
                    <div className="text-3xl font-bold mb-2" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>$2.44M</div>
                    <div className="text-sm text-[#22c55e] flex items-center gap-1 font-medium">
                      ↑ +31.2%
                    </div>
                  </div>
                  <div className="relative overflow-hidden rounded-xl border border-white/20 bg-white/35 p-5 shadow-[0_4px_24px_rgba(0,0,0,0.06)] backdrop-blur-md dark:border-white/10 dark:bg-white/10">
                    <div className="text-xs font-medium text-gray-500 mb-2 tracking-wider">EXPENSES</div>
                    <div className="text-3xl font-bold mb-2" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>$4.49M</div>
                    <div className="text-sm text-[#22c55e] flex items-center gap-1 font-medium">
                      ↑ +11.8%
                    </div>
                  </div>
                  <div className="relative overflow-hidden rounded-xl border border-white/20 bg-white/35 p-5 shadow-[0_4px_24px_rgba(0,0,0,0.06)] backdrop-blur-md dark:border-white/10 dark:bg-white/10">
                    <div className="text-xs font-medium text-gray-500 mb-2 tracking-wider">MARGIN</div>
                    <div className="text-3xl font-bold mb-2" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>35.2%</div>
                    <div className="text-sm text-[#22c55e] flex items-center gap-1 font-medium">
                      ↑ +3.1pp
                    </div>
                  </div>
                </div>

                {/* Charts */}
                <div className="grid grid-cols-2 gap-6">
                  {/* Line Chart */}
                  <div className="relative overflow-hidden rounded-xl border border-white/20 bg-white/35 p-6 shadow-[0_4px_24px_rgba(0,0,0,0.06)] backdrop-blur-md dark:border-white/10 dark:bg-white/10">
                    <div className="text-xs font-medium text-gray-500 mb-6 tracking-wider">REVENUE VS EXPENSES</div>
                    <div className="relative h-48">
                      <svg width="100%" height="100%" viewBox="0 0 400 180" preserveAspectRatio="none">
                        {/* Grid lines */}
                        <line x1="0" y1="45" x2="400" y2="45" stroke="#e5e7eb" strokeWidth="1" strokeDasharray="4 4" />
                        <line x1="0" y1="90" x2="400" y2="90" stroke="#e5e7eb" strokeWidth="1" strokeDasharray="4 4" />
                        <line x1="0" y1="135" x2="400" y2="135" stroke="#e5e7eb" strokeWidth="1" strokeDasharray="4 4" />
                        
                        {/* Revenue line (green) */}
                        <path 
                          d="M 0 140 Q 80 130, 100 120 T 200 90 T 300 70 T 400 50" 
                          fill="none" 
                          stroke="#22c55e" 
                          strokeWidth="3"
                          strokeLinecap="round"
                        />
                        
                        {/* Expenses line (red dashed) */}
                        <path 
                          d="M 0 160 Q 80 155, 100 145 T 200 120 T 300 105 T 400 90" 
                          fill="none" 
                          stroke="#ef4444" 
                          strokeWidth="3"
                          strokeDasharray="6 4"
                          strokeLinecap="round"
                        />
                      </svg>
                      
                      {/* X-axis labels */}
                      <div className="flex justify-between mt-3 text-xs text-gray-400">
                        <span>Feb</span>
                        <span>Mar</span>
                        <span>Apr</span>
                        <span>May</span>
                        <span>Jun</span>
                      </div>
                    </div>
                  </div>

                  {/* Donut Chart */}
                  <div className="relative overflow-hidden rounded-xl border border-white/20 bg-white/35 p-6 shadow-[0_4px_24px_rgba(0,0,0,0.06)] backdrop-blur-md dark:border-white/10 dark:bg-white/10">
                    <div className="text-xs font-medium text-gray-500 mb-2 tracking-wider">REVENUE MIX</div>
                    <ResponsiveContainer width="100%" height={160}>
                      <PieChart>
                        <Pie
                          data={pie}
                          cx="50%"
                          cy="50%"
                          innerRadius={32}
                          outerRadius={54}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {pie.map((c, i) => (
                            <Cell key={i} fill={c.color} opacity={0.88} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof Section */}
      <section
        ref={aboutSectionRef}
        id="about"
        className="relative overflow-hidden bg-gradient-to-b from-transparent via-slate-100/35 to-[#e8edf0]/60 py-20 dark:via-neutral-900/25 dark:to-neutral-950/35"
      >
        <div className="max-w-7xl mx-auto px-6">
          <h2 ref={aboutHeadingRef} className="text-4xl md:text-5xl font-bold text-center mb-12" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Trusted by financial teams
          </h2>

          <div ref={statsGridRef} className="grid md:grid-cols-3 gap-8 mb-20">
            <div
              ref={statCard0Ref}
              className="relative overflow-hidden rounded-2xl border border-white/20 bg-white/35 p-8 text-center shadow-[0_8px_32px_rgba(0,0,0,0.1)] backdrop-blur-lg dark:border-white/10 dark:bg-white/10 before:pointer-events-none before:absolute before:inset-0 before:rounded-2xl before:bg-gradient-to-br before:from-white/50 before:to-transparent before:opacity-55 dark:before:from-white/12"
            >
              <div className="text-5xl font-bold text-[#22c55e] mb-2">2.4M+</div>
              <div className="text-gray-600">Queries answered</div>
            </div>
            <div
              ref={statCard1Ref}
              className="relative overflow-hidden rounded-2xl border border-white/20 bg-white/35 p-8 text-center shadow-[0_8px_32px_rgba(0,0,0,0.1)] backdrop-blur-lg dark:border-white/10 dark:bg-white/10 before:pointer-events-none before:absolute before:inset-0 before:rounded-2xl before:bg-gradient-to-br before:from-white/50 before:to-transparent before:opacity-55 dark:before:from-white/12"
            >
              <div className="text-5xl font-bold text-[#22c55e] mb-2">98%</div>
              <div className="text-gray-600">Accuracy rate</div>
            </div>
            <div
              ref={statCard2Ref}
              className="relative overflow-hidden rounded-2xl border border-white/20 bg-white/35 p-8 text-center shadow-[0_8px_32px_rgba(0,0,0,0.1)] backdrop-blur-lg dark:border-white/10 dark:bg-white/10 before:pointer-events-none before:absolute before:inset-0 before:rounded-2xl before:bg-gradient-to-br before:from-white/50 before:to-transparent before:opacity-55 dark:before:from-white/12"
            >
              <div className="text-5xl font-bold text-[#22c55e] mb-2">&lt;2s</div>
              <div className="text-gray-600">Average response time</div>
            </div>
          </div>

          {/* Final CTA */}
          <div ref={ctaBlockRef} className="bg-gradient-to-br from-[#1e7a5c] to-[#16614a] rounded-3xl p-16 text-center shadow-2xl">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              Ready to understand your finances?
            </h2>
            <p className="text-xl text-white/90 mb-8">
              Join thousands of analysts who use Asklytics every day.
            </p>
            <Link 
              to="/register" 
              className="inline-block px-8 py-4 bg-white text-[#1e7a5c] rounded-lg hover:bg-gray-100 transition-colors shadow-lg text-lg font-semibold"
            >
              Create your free account →
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer
        ref={footerRef}
        className="relative overflow-hidden border-t border-white/20 bg-white/35 py-8 shadow-[0_-8px_32px_rgba(0,0,0,0.06)] backdrop-blur-lg supports-[backdrop-filter]:bg-white/30 dark:border-white/10 dark:bg-white/10 dark:supports-[backdrop-filter]:bg-white/10 before:pointer-events-none before:absolute before:inset-0 before:bg-gradient-to-t before:from-transparent before:to-white/35 before:opacity-40 dark:before:to-white/5"
      >
        <div className="relative z-10 max-w-7xl mx-auto px-6 flex items-center justify-between">
          <div className="text-3xl sm:text-4xl font-bold text-[#1e7a5c] leading-none" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Asklytics
          </div>
          <div className="text-sm text-gray-600">
            © 2025 Asklytics. All rights reserved.
          </div>
          <div className="flex items-center gap-6">
            <a href="#privacy" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Privacy</a>
            <a href="#terms" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Terms</a>
            <a href="#contact" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
