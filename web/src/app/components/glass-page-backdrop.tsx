/**
 * Fixed decorative layers: soft color blobs + frosted glass wash.
 * Parent page should use `relative min-h-screen` (or similar) and avoid opaque full-page bg on the root, or keep a matching base under this.
 */
export function GlassPageBackdrop({
  tone = "mint",
}: {
  /** mint: landing (white → gray gradient base). warm: auth pages (#ede8e0 family). */
  tone?: "mint" | "warm";
}) {
  const base =
    tone === "warm"
      ? "bg-gradient-to-br from-[#ebe5dc] via-[#ede8e0] to-[#ddd5c8]"
      : "bg-gradient-to-br from-white via-gray-50 to-gray-100";

  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      aria-hidden
    >
      <div className={`absolute inset-0 ${base}`} />
      {tone === "warm" ? (
        <>
          <div className="absolute -left-[20%] top-[5%] h-[min(480px,55vh)] w-[min(480px,70vw)] rounded-full bg-[#c4b8a8]/35 blur-[100px]" />
          <div className="absolute -right-[15%] top-[25%] h-[min(420px,50vh)] w-[min(420px,65vw)] rounded-full bg-[#1e7a5c]/12 blur-[95px]" />
          <div className="absolute bottom-[-15%] left-[20%] h-[360px] w-[360px] rounded-full bg-amber-100/40 blur-[90px]" />
        </>
      ) : (
        <>
          <div className="absolute -left-[18%] top-[0%] h-[min(520px,58vh)] w-[min(520px,72vw)] rounded-full bg-emerald-400/26 blur-[110px]" />
          <div className="absolute -right-[12%] top-[28%] h-[min(440px,52vh)] w-[min(440px,68vw)] rounded-full bg-cyan-300/30 blur-[100px]" />
          <div className="absolute bottom-[-12%] left-[22%] h-[340px] w-[340px] rounded-full bg-[#1e7a5c]/14 blur-[85px]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_55%_at_50%_0%,rgba(255,255,255,0.45),transparent_50%),radial-gradient(ellipse_70%_50%_at_80%_100%,rgba(226,232,240,0.5),transparent_45%)]" />
        </>
      )}
      <div
        className={`absolute inset-0 backdrop-blur-xl ${
          tone === "warm" ? "bg-white/28" : "bg-white/32"
        }`}
      />
      <div
        className={`absolute inset-0 backdrop-blur-sm ${
          tone === "warm"
            ? "bg-gradient-to-b from-white/20 to-transparent"
            : "bg-gradient-to-b from-white/22 to-slate-200/15"
        }`}
      />
    </div>
  );
}
