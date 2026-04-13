import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useLayoutEffect, useRef, type RefObject } from "react";

gsap.registerPlugin(ScrollTrigger);

function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Subtle 3D caps (deg) */
const MAX_DEG = 6;
const MAX_TILT = 6;

const HERO_FROM = [
  { autoAlpha: 0.45, y: 52, scale: 0.92, rotateX: MAX_DEG * 0.55 },
  { autoAlpha: 0.4, y: 64, scale: 0.91, rotateX: MAX_DEG * 0.65 },
  { autoAlpha: 0.35, y: 48, scale: 0.93, rotateX: MAX_DEG * 0.35 },
  { autoAlpha: 0.3, y: 40, scale: 0.9, rotateX: 0 },
] as const;

const HERO_EXIT = [
  { y: -28, autoAlpha: 0.55, scale: 0.96, rotateX: -MAX_DEG * 0.25 },
  { y: -36, autoAlpha: 0.5, scale: 0.94, rotateX: -MAX_DEG * 0.3 },
  { y: -28, autoAlpha: 0.45, scale: 0.95, rotateX: -MAX_DEG * 0.2 },
  { y: -22, autoAlpha: 0.5, scale: 0.94, rotateX: 0 },
] as const;

function bindCardTilt(el: HTMLElement | null): () => void {
  if (!el) return () => undefined;
  const onMove = (e: MouseEvent) => {
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    gsap.to(el, {
      rotateX: Math.max(-MAX_TILT, Math.min(MAX_TILT, -py * MAX_TILT * 2.2)),
      rotateY: Math.max(-MAX_TILT, Math.min(MAX_TILT, px * MAX_TILT * 2.2)),
      translateZ: 14,
      duration: 0.32,
      ease: "power2.out",
      transformPerspective: 1000,
      overwrite: "auto",
    });
  };
  const onEnter = () => {
    el.style.willChange = "transform";
  };
  const onLeave = () => {
    el.style.willChange = "";
    gsap.to(el, {
      rotateX: 0,
      rotateY: 0,
      translateZ: 0,
      duration: 0.5,
      ease: "power2.out",
      transformPerspective: 1000,
    });
  };
  el.addEventListener("mouseenter", onEnter);
  el.addEventListener("mousemove", onMove);
  el.addEventListener("mouseleave", onLeave);
  return () => {
    el.removeEventListener("mouseenter", onEnter);
    el.removeEventListener("mousemove", onMove);
    el.removeEventListener("mouseleave", onLeave);
    el.style.willChange = "";
  };
}

export type MotionPageEffectsConfig = {
  root: RefObject<HTMLDivElement | null>;
  header?: RefObject<HTMLElement | null>;
  footer?: RefObject<HTMLElement | null>;
  hero?: {
    section: RefObject<HTMLElement | null>;
    layers: RefObject<HTMLElement | null>[];
  };
  cardGroups?: Array<{
    grid: RefObject<HTMLElement | null>;
    cards: RefObject<HTMLDivElement | null>[];
  }>;
  parallaxInners?: Array<{
    section: RefObject<HTMLElement | null>;
    inner: RefObject<HTMLDivElement | null>;
  }>;
  introBlocks?: RefObject<HTMLElement | null>[];
  stepCards?: RefObject<HTMLDivElement | null>[];
  mockup?: {
    block: RefObject<HTMLDivElement | null>;
    chrome: RefObject<HTMLDivElement | null>;
  };
  aboutHeading?: RefObject<HTMLElement | null>;
  /** Section that contains `aboutHeading` / stats — used as ScrollTrigger root for heading */
  aboutSection?: RefObject<HTMLElement | null>;
  statsParallax?: {
    section: RefObject<HTMLElement | null>;
    grid: RefObject<HTMLDivElement | null>;
  };
  statCards?: RefObject<HTMLDivElement | null>[];
  ctaBlocks?: RefObject<HTMLDivElement | null>[];
  /** Each direct child: step-style reveal + tilt (dynamic lists) */
  listItemParents?: RefObject<HTMLElement | null>[];
};

/**
 * GSAP + ScrollTrigger motion matching the marketing landing (scrub, 3D, card tilt).
 * Pass only the sections your page has; omitted keys are skipped.
 */
export function useMotionPageEffects(config: MotionPageEffectsConfig): void {
  const configRef = useRef(config);
  configRef.current = config;

  useLayoutEffect(() => {
    if (reducedMotion()) return;

    const c = configRef.current;
    const root = c.root.current;
    if (!root) return;

    root.style.perspective = "1200px";
    const tiltCleanups: Array<() => void> = [];

    const ctx = gsap.context(() => {
      const heroCfg = c.hero;
      const heroEl = heroCfg?.section.current;
      const layerEls =
        heroCfg?.layers
          .map((r) => r.current)
          .filter((n): n is HTMLElement => n !== null) ?? [];

      if (heroEl && layerEls.length > 0) {
        gsap.set(layerEls, { transformPerspective: 1000, force3D: true });
        const enter = gsap.timeline({
          scrollTrigger: {
            trigger: heroEl,
            start: "top 88%",
            end: "top 22%",
            scrub: 0.42,
          },
        });
        layerEls.forEach((el, i) => {
          const from = HERO_FROM[Math.min(i, HERO_FROM.length - 1)];
          enter.fromTo(
            el,
            { ...from },
            {
              autoAlpha: 1,
              y: 0,
              scale: 1,
              rotateX: 0,
              duration: 1,
              ease: "none",
            },
            i * 0.06,
          );
        });
        const exit = gsap.timeline({
          scrollTrigger: {
            trigger: heroEl,
            start: "bottom bottom",
            end: "bottom top",
            scrub: 0.55,
          },
        });
        layerEls.forEach((el, i) => {
          const to = HERO_EXIT[Math.min(i, HERO_EXIT.length - 1)];
          exit.to(el, { ...to, duration: 1, ease: "none" }, i * 0.02);
        });
      }

      c.cardGroups?.forEach(({ grid, cards }) => {
        const gridEl = grid.current;
        const cardEls = cards.map((r) => r.current).filter(Boolean) as HTMLDivElement[];
        if (!gridEl || cardEls.length === 0) return;
        gsap.set(cardEls, { transformPerspective: 1000, force3D: true });
        if (cardEls.length === 4) {
          const ft = gsap.timeline({
            scrollTrigger: {
              trigger: gridEl,
              start: "top 86%",
              end: "top 28%",
              scrub: 0.48,
            },
          });
          cardEls.forEach((card, i) => {
            ft.fromTo(
              card,
              {
                autoAlpha: 0.5,
                y: 72,
                scale: 0.9,
                rotateX: MAX_DEG * 0.55,
                rotateY: (i - 1.5) * 1.2,
              },
              {
                autoAlpha: 1,
                y: 0,
                scale: 1,
                rotateX: 0,
                rotateY: 0,
                duration: 1,
                ease: "none",
              },
              i * 0.11,
            );
          });
        } else {
          cardEls.forEach((card) => {
            gsap.fromTo(
              card,
              {
                autoAlpha: 0.5,
                y: 64,
                scale: 0.91,
                rotateX: MAX_DEG * 0.5,
              },
              {
                autoAlpha: 1,
                y: 0,
                scale: 1,
                rotateX: 0,
                ease: "none",
                scrollTrigger: {
                  trigger: card,
                  start: "top 88%",
                  end: "top 52%",
                  scrub: 0.5,
                },
              },
            );
          });
        }
        cardEls.forEach((card) => tiltCleanups.push(bindCardTilt(card)));
      });

      c.parallaxInners?.forEach(({ section, inner }) => {
        const s = section.current;
        const inn = inner.current;
        if (!s || !inn) return;
        gsap.fromTo(
          inn,
          { y: 52, force3D: true },
          {
            y: -44,
            ease: "none",
            scrollTrigger: {
              trigger: s,
              start: "top bottom",
              end: "bottom top",
              scrub: 0.62,
            },
          },
        );
      });

      const aboutSec = c.aboutSection?.current;
      c.introBlocks?.forEach((ref) => {
        const el = ref.current;
        if (!el) return;
        gsap.set(el, { transformPerspective: 1000, force3D: true });
        gsap.fromTo(
          el,
          {
            autoAlpha: 0.45,
            y: 56,
            scale: 0.94,
            rotateX: MAX_DEG * 0.4,
          },
          {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            rotateX: 0,
            ease: "none",
            scrollTrigger: {
              trigger: el,
              start: "top 90%",
              end: "top 48%",
              scrub: 0.5,
            },
          },
        );
      });

      c.stepCards?.forEach((ref) => {
        const el = ref.current;
        if (!el) return;
        gsap.set(el, { transformPerspective: 1000, force3D: true });
        gsap.fromTo(
          el,
          {
            autoAlpha: 0.55,
            y: 64,
            scale: 0.92,
            rotateY: -MAX_DEG * 0.55,
            rotateX: MAX_DEG * 0.25,
          },
          {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            rotateY: 0,
            rotateX: 0,
            ease: "none",
            scrollTrigger: {
              trigger: el,
              start: "top 92%",
              end: "top 48%",
              scrub: 0.52,
            },
          },
        );
        tiltCleanups.push(bindCardTilt(el));
      });

      const mb = c.mockup?.block.current;
      const mc = c.mockup?.chrome.current;
      if (mb) {
        gsap.set(mb, { transformPerspective: 1000, force3D: true });
        gsap.fromTo(
          mb,
          {
            autoAlpha: 0.55,
            y: 72,
            scale: 0.9,
            rotateX: MAX_DEG * 0.65,
          },
          {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            rotateX: 0,
            ease: "none",
            scrollTrigger: {
              trigger: mb,
              start: "top 88%",
              end: "top 22%",
              scrub: 0.55,
            },
          },
        );
      }
      if (mb && mc) {
        gsap.set(mc, { transformPerspective: 1000, force3D: true });
        gsap.fromTo(
          mc,
          { y: 36, scale: 0.97, rotateX: MAX_DEG * 0.2 },
          {
            y: -24,
            scale: 1,
            rotateX: 0,
            ease: "none",
            scrollTrigger: {
              trigger: mb,
              start: "top 85%",
              end: "top 18%",
              scrub: 0.65,
            },
          },
        );
        tiltCleanups.push(bindCardTilt(mc));
      }

      const ah = c.aboutHeading?.current;
      if (ah && aboutSec) {
        gsap.set(ah, { transformPerspective: 1000, force3D: true });
        gsap.fromTo(
          ah,
          {
            autoAlpha: 0.4,
            y: 48,
            scale: 0.94,
            rotateX: MAX_DEG * 0.3,
          },
          {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            rotateX: 0,
            ease: "none",
            scrollTrigger: {
              trigger: ah,
              start: "top 90%",
              end: "top 52%",
              scrub: 0.48,
            },
          },
        );
      } else if (ah && !aboutSec) {
        gsap.set(ah, { transformPerspective: 1000, force3D: true });
        gsap.fromTo(
          ah,
          {
            autoAlpha: 0.4,
            y: 48,
            scale: 0.94,
            rotateX: MAX_DEG * 0.3,
          },
          {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            rotateX: 0,
            ease: "none",
            scrollTrigger: {
              trigger: ah,
              start: "top 90%",
              end: "top 52%",
              scrub: 0.48,
            },
          },
        );
      }

      const sp = c.statsParallax;
      if (sp?.section.current && sp.grid.current) {
        gsap.fromTo(
          sp.grid.current,
          { y: 36, force3D: true },
          {
            y: -28,
            ease: "none",
            scrollTrigger: {
              trigger: sp.section.current,
              start: "top bottom",
              end: "bottom top",
              scrub: 0.72,
            },
          },
        );
      }

      c.statCards?.forEach((ref) => {
        const el = ref.current;
        if (!el) return;
        gsap.set(el, { transformPerspective: 1000, force3D: true });
        gsap.fromTo(
          el,
          {
            autoAlpha: 0.55,
            y: 52,
            scale: 0.91,
            rotateX: MAX_DEG * 0.45,
          },
          {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            rotateX: 0,
            ease: "none",
            scrollTrigger: {
              trigger: el,
              start: "top 90%",
              end: "top 52%",
              scrub: 0.48,
            },
          },
        );
        tiltCleanups.push(bindCardTilt(el));
      });

      c.ctaBlocks?.forEach((ref) => {
        const el = ref.current;
        if (!el) return;
        gsap.set(el, { transformPerspective: 1000, force3D: true });
        gsap.fromTo(
          el,
          {
            autoAlpha: 0.55,
            y: 56,
            scale: 0.9,
            rotateX: MAX_DEG * 0.5,
          },
          {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            rotateX: 0,
            ease: "none",
            scrollTrigger: {
              trigger: el,
              start: "top 90%",
              end: "top 32%",
              scrub: 0.42,
            },
          },
        );
        tiltCleanups.push(bindCardTilt(el));
      });

      c.listItemParents?.forEach((parentRef) => {
        const container = parentRef.current;
        if (!container) return;
        const children = Array.from(container.children).filter(
          (n): n is HTMLElement => n instanceof HTMLElement,
        );
        children.forEach((el) => {
          gsap.set(el, { transformPerspective: 1000, force3D: true });
          gsap.fromTo(
            el,
            {
              autoAlpha: 0.55,
              y: 64,
              scale: 0.92,
              rotateY: -MAX_DEG * 0.55,
              rotateX: MAX_DEG * 0.25,
            },
            {
              autoAlpha: 1,
              y: 0,
              scale: 1,
              rotateY: 0,
              rotateX: 0,
              ease: "none",
              scrollTrigger: {
                trigger: el,
                start: "top 92%",
                end: "top 48%",
                scrub: 0.52,
              },
            },
          );
          tiltCleanups.push(bindCardTilt(el));
        });
      });

      const ft = c.footer?.current;
      if (ft) {
        gsap.set(ft, { force3D: true });
        gsap.fromTo(
          ft,
          { autoAlpha: 0.45, y: 40 },
          {
            autoAlpha: 1,
            y: 0,
            ease: "none",
            scrollTrigger: {
              trigger: ft,
              start: "top 98%",
              end: "top 72%",
              scrub: 0.45,
            },
          },
        );
      }

      ScrollTrigger.refresh();
    }, root);

    return () => {
      tiltCleanups.forEach((fn) => fn());
      ctx.revert();
      root.style.perspective = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
