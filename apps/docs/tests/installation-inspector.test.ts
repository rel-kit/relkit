/**
 * Checks the three independently selected Inspector steps and lean backend
 * onboarding. Deep-link tutorials must establish the standalone prerequisite;
 * installing a tool or enabling a bridge must never promise automatic UI/history.
 */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Reads one authored guide at the native test boundary.
 * @param page - Catalog guide ID.
 * @returns Content before include expansion.
 */
function guide(page: string): string {
  return readFileSync(resolve(import.meta.dir, `../content/${page}.mdx`), "utf8");
}

test("minimal onboarding advertises a backend with explicitly optional inspection", async () => {
  const source = guide("docs/learn/create-an-app");
  expect(source).toContain("disabled by default");
  expect(source).toContain("/docs/modules/operations/inspector");
  expect(source).not.toContain("the Inspector runs on");
  expect(source).not.toContain("server and Inspector defaults");
});

test("local development establishes standalone setup before the first UI action", async () => {
  const source = guide("docs/learn/local-development");
  const setup = source.indexOf("/docs/modules/operations/inspector");
  expect(setup).toBeGreaterThan(0);
  expect(setup).toBeLessThan(source.indexOf("Choose **Routes**"));
  expect(source).not.toContain("scoped background support path");
});

test("canonical Inspector setup installs the tool before configuring and launching it", async () => {
  const source = guide("docs/modules/operations/inspector");
  const install = source.indexOf("/_snippets/generated/installations/inspector.mdx");
  expect(install).toBeGreaterThan(0);
  expect(install).toBeLessThan(source.indexOf("apps/docs/examples/inspector/config.ts"));
  expect(source).toContain("Node.js 20.9.0");
  expect(source).toContain("relkit-inspector --project-root .");
  expect(source).toContain("--history-directory");
  expect(source).toContain("--connection-file");
});

test("event walkthrough installs an explicit local runtime before using optional Inspector views", async () => {
  expect(guide("guides/events/react-to-order-events")).toContain(
    "/_snippets/generated/installations/local.mdx",
  );
  expect(guide("guides/events/react-to-order-events")).toContain(
    "apps/docs/examples/events/profile.ts",
  );
  for (const page of ["guides/events/react-to-order-events", "docs/modules/events/index"]) {
    expect(guide(page)).toContain("/docs/modules/operations/inspector");
  }
});

test("core application model follows the minimal configuration without an automatic UI listener", async () => {
  const source = guide("docs/learn/concepts/application");
  expect(source).toContain("templates/default/v1/minimal/relkit.config.ts");
  expect(source).not.toContain("separate Inspector listener");
  expect(source).toContain("/docs/modules/integrations");
});

test("shipped realtime references do not teach the retired Inspector UI port setting", async () => {
  for (const template of ["minimal", "api", "agent", "fullstack", "tasks"]) {
    const source = readFileSync(
      resolve(
        import.meta.dir,
        `../../../templates/default/v1/${template}/.agents/skills/relkit/references/realtime-apis.md`,
      ),
      "utf8",
    );
    expect(source, template).not.toMatch(/inspector:\s*\{\s*port:/);
    expect(source, template).toContain("separate");
  }
});
