import Link from "next/link";
import { developerWorkflows, observabilityFeatures } from "./data";
import { SectionHeading } from "./sections";

export function DeveloperWorkflows() {
  return (
    <section className="landing-container landing-section">
      <SectionHeading
        eyebrow="Local to cloud"
        title="Integrations without environment branches."
        description="Connected services, Docker overlays, and infrastructure-owned resources share one checked topology while retaining separate lifecycle ownership."
      />
      <div className="landing-workflow-grid">
        {developerWorkflows.map(([mark, title, description]) => (
          <article key={title}>
            <span>{mark}</span>
            <div>
              <h3>{title}</h3>
              <p>{description}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function ObservabilityFeatures() {
  return (
    <section className="landing-container landing-section">
      <SectionHeading
        eyebrow="Observability"
        title="Observe every execution."
        description="Complete redacted local evidence is available in the Inspector before Sentry and OTLP sampling, with isolated exporter health and failures."
      />
      <div className="landing-path-grid">
        {observabilityFeatures.map((path, index) => (
          <article key={path.label} className={index === 1 ? "is-featured" : undefined}>
            <span>{path.label}</span>
            <h3>{path.title}</h3>
            <p>{path.description}</p>
            <ul>
              {path.points.map((point) => (
                <li key={point}>✓ {point}</li>
              ))}
            </ul>
            <Link className="landing-button" href={path.href}>
              {path.action}
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
