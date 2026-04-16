import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useLayoutEffect, type RefObject } from "react";

export type ScrollAnimationVariant = "fadeUp" | "scaleIn";

gsap.registerPlugin(ScrollTrigger);

export type UseScrollAnimationOptions = {
  variant?: ScrollAnimationVariant;
  /** Extra delay before animation (seconds). */
  delay?: number;
  /** Stagger between matched children (seconds). When set, children are animated. */
  stagger?: number;
  /** Selector for child elements when `stagger` is set. */
  childSelector?: string;
  disabled?: boolean;
};

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Scroll-triggered reveal for a container or its children (stagger).
 * Cleans up via gsap.context().revert() on unmount.
 */
export function useScrollAnimation(
  ref: RefObject<HTMLElement | null>,
  options: UseScrollAnimationOptions = {},
): void {
  const {
    variant = "fadeUp",
    delay = 0,
    stagger,
    childSelector = "[data-scroll-reveal]",
    disabled = false,
  } = options;

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root || disabled || prefersReducedMotion()) return;

    const targets: HTMLElement[] =
      stagger !== undefined
        ? Array.from(root.querySelectorAll<HTMLElement>(childSelector))
        : [root];

    if (targets.length === 0) return;

    const fromVars =
      variant === "scaleIn"
        ? {
            opacity: 0,
            scale: 0.97,
            duration: 0.65,
            delay,
            ...(stagger !== undefined ? { stagger } : {}),
            ease: "power2.out" as const,
            force3D: true,
          }
        : {
            opacity: 0,
            y: 28,
            duration: 0.58,
            delay,
            ...(stagger !== undefined ? { stagger } : {}),
            ease: "power2.out" as const,
            force3D: true,
          };

    const ctx = gsap.context(() => {
      gsap.from(targets, {
        ...fromVars,
        scrollTrigger: {
          trigger: root,
          start: "top 88%",
          once: true,
          invalidateOnRefresh: true,
        },
      });
    }, root);

    return () => ctx.revert();
  }, [
    ref,
    variant,
    delay,
    stagger,
    childSelector,
    disabled,
  ]);
}

/**
 * Subtle vertical shift on the sticky nav element itself (not a transformed ancestor).
 */
export function useNavbarScrollParallax(
  ref: RefObject<HTMLElement | null>,
  options: { distance?: number; disabled?: boolean } = {},
): void {
  const { distance = 5, disabled = false } = options;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || disabled || prefersReducedMotion()) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { y: 0, force3D: true },
        {
          y: -distance,
          ease: "none",
          force3D: true,
          scrollTrigger: {
            trigger: el,
            start: "top top",
            end: "+=420",
            scrub: 0.65,
            invalidateOnRefresh: true,
          },
        },
      );
    }, el);

    return () => ctx.revert();
  }, [ref, distance, disabled]);
}

/**
 * Lightweight mouse-follow parallax for decorative backgrounds (transform only).
 */
export function useMouseParallax(
  ref: RefObject<HTMLElement | null>,
  options: { strength?: number; disabled?: boolean } = {},
): void {
  const { strength = 10, disabled = false } = options;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || disabled || prefersReducedMotion()) return;

    const onMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 2 * strength;
      const y = (e.clientY / window.innerHeight - 0.5) * 2 * strength;
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, [ref, strength, disabled]);
}
