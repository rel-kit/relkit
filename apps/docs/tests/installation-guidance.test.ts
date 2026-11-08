/**
 * Checks the generated commands readers execute against package-owned versions,
 * SDK requirements and manifest sections. Missing fragments fail explicitly so
 * generation cannot silently leave a feature tutorial without its install path.
 */
import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../../..");

/** Reads a required generated installation recipe.
 * @param recipe - Capability selected by the reader.
 * @returns Generated MDX including runnable install commands.
 */
function fragment(recipe: string): string {
  const path = resolve(root, `apps/docs/content/_snippets/generated/installations/${recipe}.mdx`);
  expect(existsSync(path), `${recipe} installation guidance must be generated`).toBe(true);
  return readFileSync(path, "utf8");
}

test("database installs its current adapter and ORM with development-only Kit and owned patch", async () => {
  const manifest = await Bun.file(resolve(root, "packages/drizzle/package.json")).json();
  const source = fragment("database");
  expect(source).toContain(`@relkit/drizzle@${manifest.version}`);
  expect(source).toContain("drizzle-orm@1.0.0-rc.5-169397b");
  expect(source).toMatch(/bun add --dev[^\n]*drizzle-kit@/);
  expect(source).not.toMatch(/bun add --dev[^\n]*@relkit\/drizzle@/);
  expect(source).toContain("dist/patches/drizzle-orm.patch");
  expect(source).toContain("patchedDependencies");
});

test("native agents install the execution owner and full SDK cohort without deep agents", async () => {
  const source = fragment("agent");
  for (const name of [
    "@relkit/langchain@",
    "@relkit/local@",
    "@langchain/core@",
    "@langchain/langgraph@",
    "langchain@",
    "langsmith@",
  ]) {
    expect(source).toContain(name);
  }
  expect(source).not.toContain("deepagents@");
  expect(fragment("deep-agent")).toContain("deepagents@1.13.3");
});

test("provider recipes install selected native SDKs rather than wrappers alone", async () => {
  expect(fragment("inngest")).toContain("inngest@4.20.0");
  expect(fragment("trigger")).toContain("@trigger.dev/sdk@4.7.2");
  expect(fragment("effect-mq")).toContain("effect-mq@0.7.0");
  expect(fragment("effect-mq")).toContain("dist/patches/drizzle-orm.patch");
});

test("deployment requirements remain in development dependencies", async () => {
  const source = fragment("deployment");
  expect(source).toMatch(/bun add --dev[^\n]*@pulumi\/aws@/);
  expect(source).toMatch(/bun add --dev[^\n]*@pulumi\/pulumi@/);
  expect(source).not.toMatch(/\nbun add (?!\-\-dev)[^\n]*@pulumi\//);
});

test("tool-only MCP and independently selected HTTP transports do not acquire a native agent", async () => {
  for (const [recipe, sdk] of [
    ["mcp", "@modelcontextprotocol/server@"],
    ["ag-ui", "@ag-ui/core@"],
    ["scalar", "@scalar/hono-api-reference@"],
  ] as const) {
    const source = fragment(recipe);
    expect(source).toContain(sdk);
    expect(source).not.toContain("@relkit/langchain@");
    expect(source).not.toContain("deepagents@");
  }
  expect(fragment("mcp")).not.toContain("@ag-ui/core@");
  expect(fragment("mcp")).not.toContain("@scalar/hono-api-reference@");
});

test("frontend recipes select required OTel and only the peers used by their public leaf", async () => {
  const client = fragment("client");
  expect(client).toContain("@relkit/client@");
  expect(client).toContain("@opentelemetry/api@1.9.1");
  expect(client).not.toContain("react@");
  expect(client).not.toContain("@tanstack/");
  const react = fragment("client-react");
  expect(react).toContain("react@>=18.0.0");
  expect(react).toContain("@tanstack/react-query@>=5.80.2");
  expect(react).not.toContain("@relkit/app@");
  expect(react).not.toContain("@relkit/drizzle@");
  expect(fragment("auth-react")).toContain("@relkit/better-auth@");
});

test("Inspector installation belongs to a separate tool process", async () => {
  const source = fragment("inspector");
  expect(source).toContain("bun add --global");
  expect(source).toContain("@relkit/inspector@");
  expect(source).toContain("installation does not enable");
});
