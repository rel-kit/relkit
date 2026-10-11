/**
 * Declares generated command contracts checked by release and template smoke tests.
 * Backend and web development commands start independently; preparation belongs
 * to creation or the finite post-install command, rather than a duplicate predev.
 */
import type { ReleaseTemplate } from "./release-templates.types.js";

export type { ReleaseTemplate } from "./release-templates.types.js";

/** Public templates published with the current CLI release. */
export const releaseTemplates = ["minimal", "api", "agent", "fullstack"] as const;
/** Release fixtures also include the documented legacy task starter. */
export const packedTemplates = [...releaseTemplates, "tasks"] as const;

const backendScripts = {
  dev: "relkit dev",
  check: "relkit check",
  typecheck: "tsc --noEmit",
  test: "bun test",
  "test:unit": "bun test tests/unit",
  "test:integration": "bun test tests/integration",
  build: "relkit build",
  start: "relkit start",
  graph: "relkit graph print",
};

const fullstackScripts = {
  dev: "bun run --parallel dev:api dev:web",
  "dev:api": "RELKIT_ALLOWED_ORIGINS=http://127.0.0.1:3001 relkit dev",
  "dev:web": "next dev web --hostname 127.0.0.1 --port 3001",
  check: "relkit check",
  typecheck: "tsc --noEmit && tsc --noEmit -p web/tsconfig.json",
  test: "bun test",
  build: "relkit build && next build web",
  start: "relkit start",
};

const taskScripts = {
  dev: "relkit dev",
  check: "relkit check",
  typecheck: "tsc --noEmit",
  test: "bun test",
  build: "relkit build",
  start: "relkit start",
  "jobs:trigger":
    "relkit jobs trigger --job exportOrders --input-file examples/export-orders.json --operation-id example-trigger",
};

/**
 * Selects the exact generated commands for one supported release fixture.
 * @param template - Public starter or legacy task fixture.
 * @returns Pure command contract; callers verify generated manifest equality.
 */
export function expectedTemplateScripts(template: ReleaseTemplate) {
  if (template === "fullstack") return fullstackScripts;
  if (template === "tasks") return taskScripts;
  return backendScripts;
}
