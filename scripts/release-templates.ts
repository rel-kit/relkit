export const releaseTemplates = ["minimal", "api", "agent", "fullstack"] as const;

export type ReleaseTemplate = (typeof releaseTemplates)[number];

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
  dev: "bun run check && bun run --parallel dev:api dev:web",
  "dev:api": "RELKIT_ALLOWED_ORIGINS=http://127.0.0.1:3001 relkit dev",
  "dev:web": "next dev web --hostname 127.0.0.1 --port 3001",
  check: "relkit check",
  typecheck: "tsc --noEmit && tsc --noEmit -p web/tsconfig.json",
  test: "bun test",
  build: "relkit build && next build web",
  start: "relkit start",
};

export function expectedTemplateScripts(template: ReleaseTemplate) {
  return template === "fullstack" ? fullstackScripts : backendScripts;
}
