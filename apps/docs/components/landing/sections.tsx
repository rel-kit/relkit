import { Activity, ArrowUpRight, Boxes, Braces, RadioTower, Route } from "lucide-react";
import Link from "next/link";
import { Topology } from "./topology";
import system from "./landing-system.module.css";
import styles from "./landing-sections.module.css";

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
  readonly title: string;
  readonly description?: string;
}) {
  return (
    <div className={system.heading}>
      <p className={system.label}>{eyebrow}</p>
      <h2 className={system.title}>{title}</h2>
      {description === undefined ? null : <p className={system.description}>{description}</p>}
    </div>
  );
}

export function Capabilities({ features }: { readonly features: readonly Capability[] }) {
  return (
    <section className={system.row} aria-label="Application capabilities">
      <div className={`${system.frame} ${styles.capabilities}`}>
        <div className={styles.capabilityIntro}>
          <p className={system.label}>01 / The building blocks</p>
          <h2>
            Five parts.
            <br />
            One application.
          </h2>
          <p>From a focused service to a complete execution path. The pieces fit together.</p>
        </div>
        {features.map((feature, index) => {
          const Icon = capabilityIcons[index]!;
          return (
            <Link className={styles.capability} key={feature.id} href={`/docs/${feature.guide}`}>
              <div className={styles.capabilityTop}>
                <Icon size={22} strokeWidth={1.5} aria-hidden="true" />
                <span className={system.label}>0{index + 1}</span>
              </div>
              <h3>{feature.title}</h3>
              <p>{feature.summary}</p>
              <span className={system.textLink}>
                Explore {feature.title.toLowerCase()} <ArrowUpRight size={14} aria-hidden="true" />
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function Statistics() {
  return (
    <section className={system.row} aria-label="One application model">
      <div className={system.frame}>
        <div className={styles.model}>
          <div className={styles.modelCopy}>
            <SectionHeading
              eyebrow="02 / One source of truth"
              title="Your code is the blueprint."
              description="Describe your application in TypeScript. Relkit checks the graph that connects your services, routes, resources, and async work."
            />
            <p className={system.description}>
              Development, tests, inspection, and deployment all start from that same model.
            </p>
            <Link className={system.textLink} href="/docs/service/organization">
              Explore the application model <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
          </div>
          <Topology />
        </div>
        <dl className={styles.statistics}>
          {[
            ["1", "Checked application graph"],
            ["3", "Templates: minimal, API, agent"],
            ["0", "Cloud credentials to start locally"],
          ].map(([value, label]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
