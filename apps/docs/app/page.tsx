import { Container } from "fumadocs-ui/layouts/home/slots/container";
import { LandingExamples } from "../components/landing/examples";
import { LandingHeader } from "../components/landing/header";
import { LandingFooter } from "../components/landing/footer";
import { LandingHero } from "../components/landing/hero";
import { DeveloperWorkflows } from "../components/landing/journey";
import { Capabilities, Statistics } from "../components/landing/sections";
import {
  Community,
  FinalCallToAction,
  GuideCards,
  InspectorShowcase,
} from "../components/landing/showcase";
import { primaryCapabilities } from "../components/landing/data";
import { HeroDesign } from "../components/landing/hero-design";
import { heroCode, heroMono, heroNeon, heroSans } from "../components/landing/fonts";
import { highlightHeroExamples } from "../components/landing/highlight-hero-examples";
import styles from "../components/landing/landing-system.module.css";

export default async function HomePage() {
  const examples = await highlightHeroExamples();
  return (
    <Container className="landing-root">
      <HeroDesign
        className={`${heroSans.variable} ${heroMono.variable} ${heroNeon.variable} ${heroCode.variable}`}
      >
        <LandingHeader />
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
  );
}
