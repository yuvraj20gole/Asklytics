import { useCallback, useRef, useState, type ReactNode } from "react";
import { cn } from "./ui/utils";

type AnimatedCardProps = {
  children: ReactNode;
  className?: string;
  /** Subtle hover tilt; disabled when false or when user prefers reduced motion. */
  tilt?: boolean;
};

const MAX_TILT_DEG = 3.5;

export function AnimatedCard({
  children,
  className,
  tilt = true,
}: AnimatedCardProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [hovering, setHovering] = useState(false);

  const onMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!tilt || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
      }
      const el = rootRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      const rotateY = px * 2 * MAX_TILT_DEG;
      const rotateX = -py * 2 * MAX_TILT_DEG;
      el.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateZ(0)`;
    },
    [tilt],
  );

  const onLeave = useCallback(() => {
    setHovering(false);
    const el = rootRef.current;
    if (!el) return;
    el.style.transform =
      "perspective(1000px) rotateX(0deg) rotateY(0deg) translateZ(0)";
  }, []);

  const onEnter = useCallback(() => setHovering(true), []);

  return (
    <div
      ref={rootRef}
      onMouseMove={tilt ? onMove : undefined}
      onMouseEnter={tilt ? onEnter : undefined}
      onMouseLeave={tilt ? onLeave : undefined}
      style={{ transformStyle: tilt ? "preserve-3d" : undefined }}
      className={cn(
        "rounded-xl transition-[box-shadow] duration-300",
        "border border-border/70 bg-card/75 shadow-md shadow-black/[0.04] backdrop-blur-md",
        "dark:bg-card/70 dark:shadow-black/25",
        "hover:border-border hover:shadow-lg hover:shadow-black/[0.06] dark:hover:shadow-black/35",
        hovering && "will-change-transform",
        className,
      )}
    >
      {children}
    </div>
  );
}
