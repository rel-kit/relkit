import Link from "next/link";
import { HeroScene } from "./hero-scene";
import { landingStack, StackIcon } from "./stack-icons";

export function LandingHero() {
  return (
    <section className="landing-container landing-hero" aria-labelledby="landing-title">
      <div className="landing-hero-copy">
        <Link className="landing-pill" href="/docs/start/create-an-app">
          <span>🛠️ New</span> A complete TypeScript backend model <b aria-hidden="true">→</b>
        </Link>
        <h1 id="landing-title">Relkit</h1>
        <p className="landing-lede">
          Build typed backend workflows from one checked application graph. Run selected services
          locally, replace them explicitly in tests, and deploy only the resources you own.
        </p>
        <div className="landing-actions">
          <Link className="landing-button" href="/docs/start/create-an-app">
            <span aria-hidden="true">〉_</span> Get Started
          </Link>
        </div>
        <p className="landing-availability">Local-first. No cloud credentials required.</p>
      </div>
      <div className="landing-hero-visual" aria-label="Interactive Relkit application graph">
        <HeroScene />
      </div>
      <div className="landing-stack" aria-label="Relkit technology stack">
        {landingStack.map((item) => (
          <span key={item.name}>
            <StackIcon name={item.name} icon={item.icon} /> {item.name}
          </span>
        ))}
      </div>
    </section>
  );
}
