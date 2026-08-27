import type { RenderedLandingExample } from "./data";
import { ExampleSwitcher } from "./example-switcher";

export function LandingExamples({
  examples,
}: {
  readonly examples: readonly RenderedLandingExample[];
}) {
  return (
    <section id="examples" className="landing-container landing-section" aria-label="Examples">
      <ExampleSwitcher examples={examples} />
    </section>
  );
}
