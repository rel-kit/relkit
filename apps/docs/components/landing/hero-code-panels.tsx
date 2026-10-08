"use client";

import Link from "next/link";
import { CodeBlock, Pre } from "fumadocs-ui/components/codeblock";
import * as motion from "motion/react-m";
import type { HeroCodePanel } from "./hero-examples";

export function HeroCodePanels({
  panels,
  guide,
}: {
  readonly panels: readonly HeroCodePanel[];
  readonly guide: string;
}) {
  return panels.map((panel) => (
    <CodeBlock
      key={panel.label}
      className="hero-code-panel"
      allowCopy={false}
      viewportProps={{ className: "hero-code-viewport", "aria-label": `${panel.label} example` }}
      title={
        <motion.div className="hero-code-heading">
          <motion.strong>{panel.label}</motion.strong>
          <Link href={panel.guide ?? guide} title={`Read the ${panel.label.toLowerCase()} guide`}>
            {panel.file}
          </Link>
        </motion.div>
      }
    >
      <Pre className="hero-source" dangerouslySetInnerHTML={{ __html: panel.highlightedCode }} />
    </CodeBlock>
  ));
}
