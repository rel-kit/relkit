import Link from "next/link";
import { ArrowUpRight, Grid2X2 } from "lucide-react";
import system from "./landing-system.module.css";
import styles from "./landing-footer.module.css";

export function LandingFooter() {
  return (
    <footer className={`${system.frame} ${styles.footer}`}>
      <div className={styles.footerTop}>
        <Link className={styles.brand} href="/" aria-label="Relkit home">
          <Grid2X2 size={28} viewBox="3 3 18 18" stroke="#fff" strokeWidth={2} aria-hidden="true" />
          RELKIT
        </Link>
        <p>The TypeScript application kit.</p>
        <nav aria-label="Footer navigation">
          <Link href="/docs">Docs</Link>
          <Link href="/docs/operations/cli-reference">CLI</Link>
          <Link href="/docs/api/app">API</Link>
          <a href="https://github.com/rel-kit/relkit">
            GitHub <ArrowUpRight size={12} aria-hidden="true" />
          </a>
        </nav>
      </div>
      <div className={styles.footerBottom}>
        <span>Built in the open. Built with TypeScript.</span>
        <a href="#">Back to top ↑</a>
      </div>
    </footer>
  );
}
