import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { SectionHeading } from "./sections";
import { MotionRegion } from "./motion-region";
import { WorkflowConnector } from "./workflow-connector";
import { WorkflowIcon } from "./workflow-icons";
import motion from "./workflow-motion.module.css";
import system from "./landing-system.module.css";
import styles from "./landing-sections.module.css";

export function DeveloperWorkflows() {
  return (
    <section className={system.row} aria-label="Local to cloud">
      <div className={system.frame}>
        <SectionHeading
          eyebrow="03 / Local to cloud"
          title="Change the environment. Keep the model."
          description="Local recipes, connected services, and infrastructure-owned resources share one checked topology, with explicit lifecycle ownership."
        />
        <MotionRegion name="workflow" className={`${styles.workflows} ${motion.workflows}`}>
          <article className={styles.workflow}>
            <div className={`${styles.recipe} ${motion.diagram}`} aria-hidden="true">
              <span className={styles.diagramLabel} data-flow="source" data-flow-motion="">
                Your application
              </span>
              <WorkflowConnector />
              <div className={styles.resourcePair} data-flow="resources">
                <span>
                  <WorkflowIcon name="database" /> Redis
                </span>
                <span>
                  <WorkflowIcon name="folder" /> MinIO
                </span>
              </div>
              <span className={styles.diagramCaption}>Project-scoped Docker recipes</span>
            </div>
            <div className={styles.workflowCopy}>
              <p className={system.label}>Develop locally</p>
              <h3>Only the services you need.</h3>
              <p>
                Start pinned Redis and MinIO recipes for graph-required bindings. Keep local state
                scoped to your project.
              </p>
              <Link className={system.textLink} href="/docs/start/local-development">
                Explore local development <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            </div>
          </article>
          <article className={styles.workflow}>
            <div className={`${styles.recipe} ${motion.diagram}`} aria-hidden="true">
              <span className={styles.diagramLabel} data-flow="source" data-flow-motion="">
                One checked topology
              </span>
              <WorkflowConnector />
              <div className={styles.resourcePair} data-flow="resources">
                <span>
                  <WorkflowIcon name="link" /> Connected
                </span>
                <span>
                  <WorkflowIcon name="cloud-upload" /> AWS-owned
                </span>
              </div>
              <span className={styles.diagramCaption}>Separate lifecycle ownership</span>
            </div>
            <div className={styles.workflowCopy}>
              <p className={system.label}>Connect and deploy</p>
              <h3>Explicit resources. Less branching.</h3>
              <p>
                Combine connected services with infrastructure-owned AWS resources without
                maintaining parallel environment branches.
              </p>
              <Link className={system.textLink} href="/docs/integrations">
                Explore integrations <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            </div>
          </article>
        </MotionRegion>
      </div>
    </section>
  );
}
