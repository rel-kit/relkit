/**
 * Verifies that native execution, frontend leaves and optional HTTP protocols
 * establish their own install/configuration boundary before source examples.
 * This catches lean-app instructions that accidentally rely on a rich template.
 */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Reads one authored page at the docs test boundary.
 * @param page - Guide ID without extension.
 * @returns Source content with its prerequisite/include order intact.
 */
function guide(page: string): string {
  return readFileSync(resolve(import.meta.dir, `../content/${page}.mdx`), "utf8");
}

test("native agent entry points install the selected owner before native source", async () => {
  for (const page of ["first-agent", "agents", "native-runtime"]) {
    const source = guide(
      page === "first-agent" ? "guides/ai/build-an-offline-agent" : `docs/modules/ai/${page}`,
    );
    const install = source.indexOf("/_snippets/generated/installations/agent.mdx");
    expect(install, page).toBeGreaterThan(0);
    expect(install, page).toBeLessThan(source.search(/<include\s+source=/));
    expect(source).not.toContain("bun add langchain @langchain/langgraph");
    expect(source).not.toContain("Generated agent projects already");
  }
});

test("first-agent extends explicit runtime bindings and keeps inspection separately optional", async () => {
  const source = guide("guides/ai/build-an-offline-agent");
  expect(source).toContain("templates/default/v1/agent/relkit.config.ts");
  expect(source).toContain("realtime");
  expect(source).toContain("agent-state");
  expect(source).toContain("@relkit/langchain");
  expect(source).toContain("/docs/modules/operations/inspector");
});

test("React onboarding installs frontend runtime peers and development CLI before pulling", async () => {
  for (const page of ["docs/modules/client/index", "guides/frontend/connect-react"]) {
    const source = guide(page);
    for (const recipe of ["client-react", "client-cli"]) {
      const install = source.indexOf(`/_snippets/generated/installations/${recipe}.mdx`);
      expect(install, page).toBeGreaterThan(0);
      expect(install, page).toBeLessThan(source.indexOf("bun run relkit client pull"));
    }
    expect(source, page).toContain("--out .relkit/generated");
  }
  expect(guide("docs/modules/client/authentication")).toContain(
    "/_snippets/generated/installations/auth-react.mdx",
  );
});

test("frontend continuations link their selected setup before examples", async () => {
  for (const page of [
    "authentication",
    "mutations",
    "offline",
    "routes",
    "ssr",
    "streams",
    "transports",
    "build-integration",
  ]) {
    const source = guide(`docs/modules/client/${page}`);
    const prerequisite = source.indexOf("/docs/modules/client");
    expect(prerequisite, page).toBeGreaterThan(0);
    const example = source.search(/<include\s+source=/);
    if (example !== -1) expect(prerequisite, page).toBeLessThan(example);
  }
});

test("optional protocols use shared selected-only installation recipes", async () => {
  expect(guide("docs/modules/ai/mcp")).toContain("/_snippets/generated/installations/mcp.mdx");
  expect(guide("docs/modules/ai/index")).toContain("/_snippets/generated/installations/ag-ui.mdx");
  expect(guide("docs/modules/http/openapi")).toContain(
    "/_snippets/generated/installations/scalar.mdx",
  );
  expect(guide("docs/modules/http/generated-clients")).toContain(
    "/_snippets/generated/installations/client.mdx",
  );
});
