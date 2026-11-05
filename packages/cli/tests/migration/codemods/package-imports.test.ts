/** Fixture tests for the `package-imports` rule: source specifiers and package.json entries. */
import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { packageImportsRule } from "../../../src/migration/code-rules/package-imports.js";
import { exportKey, packageTarget } from "../../../src/migration/code-rules/package-map.js";
import { expectFixture, testContext } from "./fixture.js";

describe("package-imports", () => {
  test("moves @relkit/app and merged packages, reporting what has no 0.9 home", () => {
    const result = expectFixture(packageImportsRule, "source", "src/orders/price.ts");
    expect(result.findings.map((finding) => [finding.line, finding.message])).toEqual([
      [
        8,
        "readableName is not exported from the relkit root; import it from its relkit/<area> subpath.",
      ],
      [9, "Import named exports from relkit instead of the whole module."],
      [
        10,
        "Legacy function-target jobs were removed; define a task and a task-backed defineJob from relkit/jobs.",
      ],
    ]);
  });

  test("replaces merged dependencies with their owners in package.json", () => {
    const result = expectFixture(packageImportsRule, "manifest", "package.json");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.line).toBe(5);
    expectFixture(packageImportsRule, "manifest-both", "examples/app/package.json");
  });

  test("reports a target the 0.9 export maps do not have", () => {
    const context = testContext({
      packageExports: new Map([["relkit", new Set([".", "./functions"])]]),
    });
    const result = packageImportsRule.apply(
      { path: "src/a.ts", text: 'import { x } from "@relkit/functions/missing";\n' },
      context,
    );
    expect(result.text).toBe('import { x } from "@relkit/functions/missing";\n');
    expect(result.findings[0]?.message).toContain("has no 0.9 export relkit/functions/missing");
  });

  test("leaves non-RelKit and unchanged RelKit packages alone", () => {
    expect(packageTarget("zod")).toBeUndefined();
    expect(packageTarget("@relkit/client/react")).toBeUndefined();
    expect(packageTarget("@relkit/deploy-pulumi")).toEqual({
      kind: "moved",
      specifier: "@relkit/pulumi/engine",
      packageName: "@relkit/pulumi",
    });
  });

  test("maps every former package to an export the 0.9 packages publish", () => {
    const manifests: Record<string, string> = {
      relkit: "relkit",
      "@relkit/cli": "cli",
      "@relkit/inspector": "inspector",
      "@relkit/pulumi": "../integrations/packages/pulumi",
    };
    const former = [
      "app",
      "agents",
      "buckets",
      "cache",
      "config",
      "contracts",
      "deploy",
      "diagnostics",
      "engine",
      "events",
      "functions",
      "graph",
      "inspector-api",
      "invocation",
      "jobs",
      "local-service",
      "observability",
      "openapi",
      "provider",
      "providers-local",
      "realtime",
      "routes",
      "runtime-effect",
      "runtime-hono",
      "schema",
      "services",
      "tools",
      "compiler",
      "client-generator",
      "supervisor",
      "observability-local",
      "deploy-pulumi",
    ];
    for (const name of former) {
      const target = packageTarget(`@relkit/${name}`);
      if (target?.kind !== "moved") throw new Error(`@relkit/${name} has no target`);
      const { packageName, key } = exportKey(target.specifier);
      const manifest = JSON.parse(
        readFileSync(
          new URL(`../../../../${manifests[packageName]}/package.json`, import.meta.url),
          "utf8",
        ),
      ) as { exports: Record<string, string> };
      expect(Object.keys(manifest.exports)).toContain(key);
    }
  });
});
