"use client";

import Link from "next/link";
import * as motion from "motion/react-m";
import { ArrowUpRight, Grid2X2 } from "lucide-react";
import { RelkitLogo } from "./logo";

export function LandingHeader() {
  return (
    <motion.header className="hero-navigation">
      <motion.div className="hero-container hero-navigation-inner">
        <Link className="hero-brand" href="/" aria-label="Relkit home">
          <Grid2X2
            className="hero-logo"
            size={28}
            viewBox="3 3 18 18"
            fill="none"
            stroke="#ffffff"
            strokeWidth={2}
            aria-hidden="true"
          />
          RELKIT
        </Link>
        <motion.nav className="hero-navigation-links" aria-label="Main navigation">
          <Link href="/docs">Documentation</Link>
          <Link href="https://github.com/rel-kit/relkit">
            GitHub <ArrowUpRight size={12} aria-hidden="true" />
          </Link>
          <Link href="/docs/start/create-an-app">
            Start building <ArrowUpRight size={12} aria-hidden="true" />
          </Link>
        </motion.nav>
      </motion.div>
    </motion.header>
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
