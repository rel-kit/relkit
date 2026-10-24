/** Defines current repository-command and topology expectations as pure read-only guardrail facts. */
export const staleAdvice = [
  "apps/web",
  "packages/ui",
  "@repo/",
  "bun run check-types",
  "There is currently no checked-in test implementation",
  "no Phase 0\n`scripts/*.ts` implementation",
  "Turborepo starter",
  "currently empty",
  "reserved inspector",
  "RELKIT_INSPECTOR_ROOT",
];

export const currentTopology = [
  "apps/docs",
  "apps/inspector",
  "examples/commerce",
  "integrations/catalog",
  "integrations/packages",
  "templates/default",
  "bun run typecheck",
  "tests/phase0.test.ts",
  "bun run verify",
  "PORT=3000",
  "port `3210`",
];

export const readmeTopology = [
  "apps/docs",
  "apps/inspector",
  "integrations/catalog",
  "integrations/packages",
];

export const inspectorGuidance = [
  "Pulumi",
  "inspector: { enabled: true }",
  "127.0.0.1",
  "packages/inspector/README.md",
];
