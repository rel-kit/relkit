import Link from "next/link";
import { developerWorkflows, observabilityFeatures } from "./data";
import { SectionHeading } from "./sections";

export function DeveloperWorkflows() {
  return (
    <section className="landing-container landing-section">
      <SectionHeading
        eyebrow="Build, automate, and observe"
        title="Observable AI workflows."
        description="Agents and tools use the same schemas and application context as the rest of your backend, while tracing and the inspector show exactly what ran."
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
        description="Requests, structured logs, and traces share Relkit graph identities, so you can move from a symptom to the exact function, event, job, or provider call that produced it."
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
