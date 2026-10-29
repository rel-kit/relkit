/** Renders the original landing as one hydrated React tree, preserving shared motion and theme context. */
import { Container } from "fumadocs-ui/layouts/home/slots/container";
import { RootProvider } from "fumadocs-ui/provider/base";
import { LandingExamples } from "./examples";
import { LandingFooter } from "./footer";
import { LandingHero } from "./hero";
import { DeveloperWorkflows } from "./journey";
import { Capabilities, Statistics } from "./sections";
import { Community, FinalCallToAction, GuideCards, InspectorShowcase } from "./showcase";
import { primaryCapabilities } from "./data";
import { HeroDesign } from "./hero-design";
import { heroCode, heroMono, heroNeon, heroSans } from "./fonts";
import type { HeroExample } from "./hero-examples";
import styles from "./landing-system.module.css";

/**
 * Receives build-highlighted examples from the Astro page and renders the marketing experience.
 * @param props - Serializable examples with the same highlighted code used by the original page.
 * @returns The landing's shared provider tree and unchanged visual sections.
 */
export function LandingPage({ examples }: { readonly examples: readonly HeroExample[] }) {
  return (
    // The landing is light-only; forcing it keeps the shared docs header on the same tokens.
    <RootProvider theme={{ forcedTheme: "light" }} search={{ enabled: false }}>
      <Container className="landing-root">
        <HeroDesign
          className={`${heroSans.variable} ${heroMono.variable} ${heroNeon.variable} ${heroCode.variable}`}
        >
          <LandingHero />
          <LandingExamples examples={examples} />
        </HeroDesign>
        <div className={`${styles.page} ${heroSans.variable} ${heroMono.variable}`}>
          <Capabilities features={primaryCapabilities} />
          <Statistics />
          <DeveloperWorkflows />
          <InspectorShowcase />
          <Community />
          <GuideCards />
          <FinalCallToAction />
          <LandingFooter />
        </div>
      </Container>
    </RootProvider>
  );
}
