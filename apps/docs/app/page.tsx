import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { codeToHtml } from "shiki";
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
import { exampleDefinitions, primaryCapabilities } from "../components/landing/data";

export default async function HomePage() {
  const repositoryRoot = resolve(process.cwd(), "../..");
  const examples = await Promise.all(
    exampleDefinitions.map(async (example) => {
      const source = await readFile(
        resolve(/* turbopackIgnore: true */ repositoryRoot, example.source),
        "utf8",
      );
      return {
        ...example,
        highlightedCode: await codeToHtml(source.trim(), {
          lang: "typescript",
          themes: { light: "github-light", dark: "github-dark" },
          defaultColor: false,
        }),
      };
    }),
  );
  return (
    <main className="landing-root">
      <LandingHeader />
      <LandingHero />
      <LandingExamples examples={examples} />
      <Capabilities features={primaryCapabilities} />
      <Statistics />
      <DeveloperWorkflows />
      <ObservabilityFeatures />
      <InspectorShowcase />
      <Community />
      <GuideCards />
      <FinalCallToAction />
      <LandingFooter />
    </main>
  );
}
