"use client";

import { Link } from "fumadocs-core/framework";
import { Heading } from "fumadocs-ui/components/heading";
import { buttonVariants } from "fumadocs-ui/components/ui/button";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import * as motion from "motion/react-m";

export function LandingHero() {
  return (
    <motion.section className="hero-copy-row" aria-label="RelKit">
      <motion.div
        className="hero-container hero-copy"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
      >
        <motion.p className="hero-eyebrow">OPEN SOURCE · MIT LICENSE</motion.p>
        <Heading as="h1" className="hero-title">
          <motion.span>The TypeScript</motion.span>
          <motion.span>backend framework</motion.span>
        </Heading>
        <motion.p className="hero-description">
          where you write the business logic. RelKit wires the APIs, jobs, events, agents and typed
          <motion.span>
            client, and gives you, and your coding agent, a live map of the app.
          </motion.span>
        </motion.p>
        <motion.div className="hero-actions">
          <Link
            className={buttonVariants({ className: "hero-start", variant: "primary" })}
            href="/docs/learn/create-an-app"
          >
            Start building <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
          <Link className="hero-docs-link" href="/docs">
            Read the docs <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </motion.div>
      </motion.div>
    </motion.section>
  );
}
