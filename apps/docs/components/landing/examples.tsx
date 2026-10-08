import type { HeroExample } from "./hero-examples";
import { ExampleSwitcher } from "./example-switcher";

export function LandingExamples({ examples }: { readonly examples: readonly HeroExample[] }) {
  return <ExampleSwitcher examples={examples} />;
}
