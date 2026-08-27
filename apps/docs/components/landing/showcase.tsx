import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { SectionHeading } from "./sections";
import { landingCommunityStack, StackIcon } from "./stack-icons";

export function InspectorShowcase() {
  return (
    <section id="inspector" className="landing-container landing-section">
      <SectionHeading
        eyebrow="Inspector"
        title="Visualize everything running in your application."
        description="Open the local inspector, choose a route or function, then follow its graph identity through diagnostics, requests, logs, and spans."
      />
      <Link className="landing-inspector" href="/docs/operations/inspector">
        <Image
          className="landing-inspector-light"
          src="/inspector-light.png"
          alt="Relkit inspector in light theme with the full navigation sidebar and routes workspace"
          width={1280}
          height={900}
          sizes="(max-width: 800px) 100vw, 1000px"
          loading="eager"
        />
        <Image
          className="landing-inspector-dark"
          src="/inspector-dark.png"
          alt="Relkit inspector in dark theme with the full navigation sidebar and routes workspace"
          width={1280}
          height={900}
          sizes="(max-width: 800px) 100vw, 1000px"
          loading="eager"
        />
        <span>Open the step-by-step inspector guide →</span>
      </Link>
    </section>
  );
}

export function Community() {
  return (
    <section className="landing-container landing-section">
      <SectionHeading
        eyebrow="Open source"
        title="Relkit is built in the open."
        description="Explore the GitHub repository, run the executable examples, report issues, or contribute improvements to the framework and documentation."
      />
      <div className="landing-community">
        <div className="landing-ripples" aria-label="Relkit technology stack">
          {landingCommunityStack.map((item, index) => (
            <span
              aria-hidden="true"
              className="landing-ring"
              key={`${item.name}-ring`}
              style={{ "--orbit-size": `${12 + index * 3.7}rem` } as CSSProperties}
            />
          ))}
          {landingCommunityStack.map((item, index) => (
            <span
              className="landing-orbit"
              key={item.name}
              style={
                {
                  "--orbit-size": `${12 + index * 3.7}rem`,
                  "--orbit-start": `${index * 40}deg`,
                  "--counter-start": `${index * -40}deg`,
                } as CSSProperties
              }
            >
              <span className="landing-orbit-brand">
                <StackIcon name={item.name} icon={item.icon} />
                <b>{item.name}</b>
              </span>
            </span>
          ))}
        </div>
        <a className="landing-button" href="https://github.com/rel-kit/relkit">
          View Relkit on GitHub
        </a>
      </div>
    </section>
  );
}

export function GuideCards() {
  const guides = [
    {
      eyebrow: "Start",
      title: "Create, change, verify, build, and start your first app",
      href: "/docs/start/create-an-app",
      visual: "bunx create-relkit@latest relkit-orders",
    },
    {
      eyebrow: "HTTP",
      title: "Map validated functions to filesystem routes and OpenAPI",
      href: "/docs/http/routes",
      visual: "POST /orders  →  createOrder",
    },
    {
      eyebrow: "Operations",
      title: "Test failure paths and trace one request end to end",
      href: "/docs/operations/testing",
      visual: "request → log → span → graph",
    },
  ] as const;
  return (
    <section className="landing-container landing-section">
      <SectionHeading
        eyebrow="Read the guides"
        description="Follow a focused path from your first local app to HTTP contracts and production diagnostics."
      />
      <div className="landing-guide-grid">
        {guides.map((guide) => (
          <Link key={guide.href} href={guide.href}>
            <div className="landing-guide-visual">
              <code>{guide.visual}</code>
            </div>
            <small>{guide.eyebrow}</small>
            <h3>{guide.title}</h3>
            <span>Open guide →</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function FinalCallToAction() {
  return (
    <section className="landing-container landing-cta">
      <p>Ready to build?</p>
      <h2>Build your first Relkit app.</h2>
      <Link className="landing-button" href="/docs/start/create-an-app">
        <span aria-hidden="true">〉_</span> Get Started
      </Link>
    </section>
  );
}
