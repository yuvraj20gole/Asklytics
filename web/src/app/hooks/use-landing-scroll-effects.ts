import type { RefObject } from "react";
import { useMotionPageEffects } from "./use-motion-page-effects";

export type LandingScrollEffectRefs = {
  root: RefObject<HTMLDivElement | null>;
  header: RefObject<HTMLElement | null>;
  heroSection: RefObject<HTMLElement | null>;
  heroBadge: RefObject<HTMLDivElement | null>;
  heroHeading: RefObject<HTMLHeadingElement | null>;
  heroSub: RefObject<HTMLParagraphElement | null>;
  heroCtas: RefObject<HTMLDivElement | null>;
  featuresGrid: RefObject<HTMLDivElement | null>;
  featureCards: [
    RefObject<HTMLDivElement | null>,
    RefObject<HTMLDivElement | null>,
    RefObject<HTMLDivElement | null>,
    RefObject<HTMLDivElement | null>,
  ];
  howSection: RefObject<HTMLElement | null>;
  howInner: RefObject<HTMLDivElement | null>;
  howIntro: RefObject<HTMLDivElement | null>;
  howMid: RefObject<HTMLDivElement | null>;
  stepCards: [
    RefObject<HTMLDivElement | null>,
    RefObject<HTMLDivElement | null>,
    RefObject<HTMLDivElement | null>,
  ];
  mockBlock: RefObject<HTMLDivElement | null>;
  mockChrome: RefObject<HTMLDivElement | null>;
  aboutSection: RefObject<HTMLElement | null>;
  aboutHeading: RefObject<HTMLHeadingElement | null>;
  statsGrid: RefObject<HTMLDivElement | null>;
  statCards: [
    RefObject<HTMLDivElement | null>,
    RefObject<HTMLDivElement | null>,
    RefObject<HTMLDivElement | null>,
  ];
  ctaBlock: RefObject<HTMLDivElement | null>;
  footer: RefObject<HTMLElement | null>;
};

export function useLandingScrollEffects(refs: LandingScrollEffectRefs): void {
  useMotionPageEffects({
    root: refs.root,
    header: refs.header,
    footer: refs.footer,
    hero: {
      section: refs.heroSection,
      layers: [refs.heroBadge, refs.heroHeading, refs.heroSub, refs.heroCtas],
    },
    cardGroups: [{ grid: refs.featuresGrid, cards: [...refs.featureCards] }],
    parallaxInners: [{ section: refs.howSection, inner: refs.howInner }],
    introBlocks: [refs.howIntro, refs.howMid],
    stepCards: [...refs.stepCards],
    mockup: { block: refs.mockBlock, chrome: refs.mockChrome },
    aboutHeading: refs.aboutHeading,
    aboutSection: refs.aboutSection,
    statsParallax: { section: refs.aboutSection, grid: refs.statsGrid },
    statCards: [...refs.statCards],
    ctaBlocks: [refs.ctaBlock],
  });
}
