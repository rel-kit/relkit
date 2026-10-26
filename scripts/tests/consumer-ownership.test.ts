/**
 * Verifies inventory completeness and catalog resolution on actual source
 * manifests. Source declaration observations remain distinct from proof that
 * an external consumer can install and typecheck the candidate.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { inventoryConsumerOwnership } from "../consumer-ownership.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "relkit-ownership-test-"));
  for (const directory of [
    "apps",
    "examples",
    "templates/default/v1",
    "packages/fixture/dist",
    "integrations/catalog",
    "packages/cli/editor",
  ])
    await mkdir(join(root, directory), { recursive: true });
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "workspace", catalog: { effect: "4.0.1" } }),
  );
  await writeFile(
    join(root, "integrations/catalog/package.json"),
    JSON.stringify({ name: "@relkit/integrations", version: "1.0.0" }),
  );
  await writeFile(
    join(root, "packages/cli/editor/package.json"),
    JSON.stringify({ name: "fixture-editor", private: true }),
  );
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("source consumer ownership", () => {
  it("retains every direct external edge and its emitted declaration references", async () => {
    await writeFile(
      join(root, "packages/fixture/package.json"),
      JSON.stringify({
        name: "@relkit/fixture",
        version: "1.0.0",
        dependencies: { effect: "catalog:", langchain: "1.5.10" },
        devDependencies: { vitest: "5.0.1" },
        exports: { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } },
      }),
    );
    await writeFile(
      join(root, "packages/fixture/dist/index.d.ts"),
      'export type { Effect } from "effect";\n',
    );
    const rows = await Effect.runPromise(inventoryConsumerOwnership(root));
    const fixture = rows.find((row) => row.manifest.name === "@relkit/fixture");
    expect(rows).toHaveLength(4);
    expect(fixture?.dependencies).toHaveLength(3);
    expect(fixture?.dependencies.find((row) => row.dependency === "effect")).toMatchObject({
      version: "4.0.1",
      declarationReferences: ["dist/index.d.ts"],
      role: "runtime",
    });
    expect(fixture?.dependencies.find((row) => row.dependency === "langchain")).toMatchObject({
      finalOwner: "@relkit/langchain",
      capability: "agent-execution",
    });
    expect(rows.find((row) => row.manifest.name === "workspace")?.category).toBe("tooling");
  });

  it("rejects unresolved catalog references instead of inventing versions", async () => {
    await writeFile(
      join(root, "packages/fixture/package.json"),
      JSON.stringify({
        name: "@relkit/fixture",
        dependencies: { missing: "catalog:" },
      }),
    );
    await expect(Effect.runPromise(inventoryConsumerOwnership(root))).rejects.toThrow(
      /Missing or invalid catalog entry/,
    );
  });
});
