import { Bot, Braces, RadioTower, RefreshCw, Route, TestTube2 } from "lucide-react";
import Link from "next/link";

interface Capability {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly guide: string;
}

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
  const icons = [Braces, Route, RadioTower, RefreshCw, Bot, TestTube2];
  return (
    <section className="landing-container landing-section">
      <SectionHeading
        eyebrow="Features"
        title="Build more from one model."
        description="Start with a typed function, then expose it through HTTP, events, jobs, agents, and deterministic tests without duplicating contracts."
      />
      <div className="landing-capability-grid">
        {features.map((feature, index) => {
          const Icon = icons[index]!;
          const isAgents = feature.id === "agents";
          return (
            <Link key={feature.id} href={`/docs/${feature.guide}`}>
              <span className="landing-feature-mark">
                <Icon aria-hidden="true" />
              </span>
              <h3>{isAgents ? "AI agents and workflows" : feature.title}</h3>
              <p>
                {isAgents
                  ? "Build bounded model workflows with typed input, allowlisted tools, approvals, and execution limits."
                  : feature.summary}
              </p>
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
