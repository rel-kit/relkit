import { Container } from "fumadocs-ui/layouts/home/slots/container";
import { LandingExamples } from "../components/landing/examples";
import { LandingFooter, LandingHeader } from "../components/landing/header";
import { LandingHero } from "../components/landing/hero";
import { DeveloperWorkflows, ObservabilityFeatures } from "../components/landing/journey";
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
      <Capabilities features={primaryCapabilities} />
      <Statistics />
      <DeveloperWorkflows />
      <ObservabilityFeatures />
      <InspectorShowcase />
      <Community />
      <GuideCards />
      <FinalCallToAction />
      <LandingFooter />
    </Container>
  );
}
