/**
 * Guards provider/exporter/deployment setup against omitted SDK peers and old
 * ownership promises. Package installation remains distinct from provider-native
 * certification, Docker lifecycle and authorized cloud execution.
 */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Reads a guide without depending on workspace runtime configuration.
 * @param page - Guide ID relative to content/docs.
 * @returns Authored installation and operational instructions.
 */
function guide(page: string): string {
  return readFileSync(resolve(import.meta.dir, `../content/${page}.mdx`), "utf8");
}

test("each job provider establishes its selected SDK recipe before configuration", async () => {
  for (const provider of ["inngest", "effect-mq", "trigger"]) {
    const source = guide(`docs/modules/jobs/providers/${provider}`);
    const install = source.indexOf(`/_snippets/generated/installations/${provider}.mdx`);
    expect(install, provider).toBeGreaterThan(0);
    expect(install, provider).toBeLessThan(source.search(/<include\s+source=/));
    expect(source).toContain("creation tuple is currently rejected");
  }
  expect(guide("docs/modules/jobs/providers/trigger")).not.toContain("@trigger.dev/sdk@4.5.16");
  expect(guide("docs/modules/jobs/providers/trigger")).toContain("**unverified**");
});

test("deployment starts from an existing configured app with development-only SDK setup", async () => {
  const source = guide("docs/modules/deployment/aws");
  expect(source).toContain("/_snippets/generated/installations/deployment.mdx");
  expect(source).toContain("currently rejected");
  expect(source).not.toContain("receives the\nrequired packages and configuration");
});

test("observability assigns persistent history and its directory override to the standalone tool", async () => {
  const source = guide("docs/modules/operations/observability");
  expect(source).toContain("--history-directory");
  expect(source).toContain("/docs/modules/operations/inspector");
  expect(source).not.toContain("RELKIT_OBSERVABILITY_ROOT");
  expect(source).not.toContain("development CLI explicitly acquires");
  expect(source).toContain("/_snippets/generated/installations/sentry.mdx");
  expect(source).toContain("/_snippets/generated/installations/otlp.mdx");
});

test("cache and upload tutorials select their adapter and establish separate Inspector setup", async () => {
  for (const [page, recipe] of [
    ["guides/caching/cache-product-prices", "redis"],
    ["guides/storage/upload-product-images", "s3"],
  ] as const) {
    const source = guide(page);
    expect(source).toContain(`/_snippets/generated/installations/${recipe}.mdx`);
    expect(source).toContain("Docker");
    expect(source).toContain("/docs/modules/operations/inspector");
  }
  expect(guide("docs/modules/caching/index")).not.toContain("without Redis");
});
