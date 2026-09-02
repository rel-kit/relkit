import { Activity, Boxes, Braces, RadioTower, Route } from "lucide-react";
import Link from "next/link";

interface Capability {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly guide: string;
}

const capabilityIcons = [Boxes, Route, Braces, RadioTower, Activity];

export function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  readonly eyebrow: string;
  readonly title?: string;
  readonly description?: string;
}) {
  return (
    <div className="landing-section-heading">
      <p>{eyebrow}</p>
      {title === undefined ? null : <h2>{title}</h2>}
      {description === undefined ? null : <span>{description}</span>}
    </div>
  );
}

export function Capabilities({ features }: { readonly features: readonly Capability[] }) {
  return (
    <section className="landing-container landing-section">
      <SectionHeading
        eyebrow="Features"
        title="The five parts of a Relkit application."
        description="Organize a service, implement functions, expose routes, publish events, and observe the complete execution path."
      />
      <div className="landing-capability-grid">
        {features.map((feature, index) => {
          const Icon = capabilityIcons[index]!;
          return (
            <Link key={feature.id} href={`/docs/${feature.guide}`}>
              <span className="landing-feature-mark">
                <Icon aria-hidden="true" />
              </span>
              <h3>{feature.title}</h3>
              <p>{feature.summary}</p>
              <small>Learn more &gt;</small>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function Statistics() {
  return (
    <section className="landing-container landing-section">
      <SectionHeading eyebrow="One source of truth" />
      <div className="landing-stat-grid">
        {[
          ["1", "checked application graph"],
          ["3", "project templates: minimal, API, agent"],
          ["0", "cloud credentials for the local journey"],
        ].map(([value, label]) => (
          <article key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </article>
        ))}
      </div>
    </section>
  );
}
