import Image from "next/image";
import Link from "next/link";
import { Activity, ArrowRight, ArrowUpRight, Braces, Terminal } from "lucide-react";
import { observabilityFeatures } from "./data";
import { SectionHeading } from "./sections";
import { landingCommunityStack, StackIcon } from "./stack-icons";
import { MotionRegion } from "./motion-region";
import motion from "./landing-motion.module.css";
import system from "./landing-system.module.css";
import styles from "./landing-showcase.module.css";

const guides = [
  {
    label: "01 / Get started",
    title: "Your first Relkit app",
    description: "Create, change, verify, and run an application.",
    href: "/docs/start/create-an-app",
    icon: Terminal,
    visual: "$ bunx create-relkit@latest",
  },
  {
    label: "02 / HTTP contracts",
    title: "From function to endpoint",
    description: "Connect validated functions to routes and OpenAPI.",
    href: "/docs/http/routes",
    icon: Braces,
    visual: "POST /orders → createOrder",
  },
  {
    label: "03 / Operations",
    title: "Follow the execution",
    description: "Test failure paths and trace a request end to end.",
    href: "/docs/operations/testing",
    icon: Activity,
    visual: "request → log → span",
  },
] as const;

export function InspectorShowcase() {
  return (
    <section id="inspector" className={system.row}>
      <div className={system.frame}>
        <SectionHeading
          eyebrow="04 / Observe and inspect"
          title="See how it all connects."
          description="Follow requests, functions, events, and async work through the local Inspector. The same graph identity connects the whole execution."
        />
        <div className={styles.inspectorStage}>
          <Link
            className={styles.inspector}
            href="/docs/operations/inspector"
            aria-label="Explore the Relkit Inspector guide"
          >
            <div className={styles.inspectorBar}>
              <span>
                <i /> localhost:3210
              </span>
              <span>
                Relkit Inspector <ArrowUpRight size={14} aria-hidden="true" />
              </span>
            </div>
            <Image
              src="/inspector-light.png"
              alt="Relkit Inspector with its navigation sidebar and routes workspace"
              width={1280}
              height={900}
              sizes="(max-width: 560px) 90vw, (max-width: 1200px) 85vw, 992px"
            />
          </Link>
          <p className={system.label}>Local evidence. Redacted before persistence.</p>
        </div>
        <div className={styles.observability}>
          {observabilityFeatures.map((path, index) => (
            <article key={path.label}>
              <p className={system.label}>
                0{index + 1} / {path.label}
              </p>
              <h3>{path.title}</h3>
              <p>{path.description}</p>
              <Link className={system.textLink} href={path.href}>
                {path.action} <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Community() {
  return (
    <section className={system.row} aria-label="Open source ecosystem">
      <div className={system.frame}>
        <div className={styles.community}>
          <div>
            <p className={system.label}>05 / Built in the open</p>
            <h2>Familiar tools. A shared foundation.</h2>
          </div>
          <div>
            <p>Explore the source, run the examples, or help shape what comes next.</p>
            <a className={system.textLink} href="https://github.com/rel-kit/relkit">
              View Relkit on GitHub <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          </div>
        </div>
        <MotionRegion name="technology" className={motion.technology}>
          <div className={motion.window}>
            <div className={motion.track}>
              {[false, true].map((duplicate) => (
                <ul
                  key={String(duplicate)}
                  className={motion.stack}
                  aria-label={duplicate ? undefined : "Relkit technology stack"}
                  aria-hidden={duplicate || undefined}
                >
                  {landingCommunityStack.map((item) => (
                    <li key={item.name}>
                      <StackIcon name={item.name} icon={item.icon} />
                      <span>{item.name}</span>
                    </li>
                  ))}
                </ul>
              ))}
            </div>
          </div>
        </MotionRegion>
      </div>
    </section>
  );
}

export function GuideCards() {
  return (
    <section className={system.row} aria-label="Read the guides">
      <div className={system.frame}>
        <SectionHeading
          eyebrow="06 / Find your starting point"
          title="A little reading. A lot of building."
        />
        <div className={styles.guides}>
          {guides.map(({ icon: Icon, ...guide }) => (
            <Link key={guide.href} href={guide.href}>
              <div className={styles.guideVisual} aria-hidden="true">
                <Icon size={28} strokeWidth={1} />
                <code>{guide.visual}</code>
              </div>
              <p className={system.label}>{guide.label}</p>
              <h3>{guide.title}</h3>
              <p>{guide.description}</p>
              <span className={system.textLink}>
                Open guide <ArrowRight size={14} aria-hidden="true" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FinalCallToAction() {
  return (
    <section className={system.row}>
      <div className={`${system.frame} ${styles.cta}`}>
        <p className={system.label}>Your next application starts here</p>
        <h2>
          Make the pieces
          <br />
          work together.
        </h2>
        <p>One TypeScript application. From the first local run.</p>
        <Link className={system.button} href="/docs/start/create-an-app">
          Start building <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
        <code>bunx create-relkit@latest</code>
      </div>
    </section>
  );
}
