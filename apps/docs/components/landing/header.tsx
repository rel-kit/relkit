import Link from "next/link";
import { ThemeSwitch } from "fumadocs-ui/layouts/shared/slots/theme-switch";
import { RelkitLogo } from "./logo";

export function LandingHeader() {
  return (
    <header className="landing-header">
      <div className="landing-container landing-header-inner">
        <Link className="landing-brand" href="/" aria-label="Relkit home">
          <RelkitLogo />
          <span>Relkit</span>
        </Link>
        <div className="landing-header-actions">
          <ThemeSwitch className="landing-theme-switch" />
          <Link className="landing-button landing-button-small" href="/docs/start/create-an-app">
            Get Started
          </Link>
        </div>
      </div>
    </header>
  );
}

export function LandingFooter() {
  return (
    <footer className="landing-container landing-footer">
      <div className="landing-footer-row">
        <Link className="landing-brand" href="/" aria-label="Relkit home">
          <RelkitLogo size={30} />
          <span>Relkit</span>
        </Link>
        <nav aria-label="Footer navigation">
          <Link href="/docs">Docs</Link>
          <Link href="/docs/operations/cli-reference">CLI</Link>
          <Link href="/docs/api/app">API</Link>
          <a href="https://github.com/rel-kit/relkit">GitHub</a>
        </nav>
      </div>
      <p className="landing-wordmark">Relkit</p>
    </footer>
  );
}
