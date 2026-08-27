import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { scanAuthoring } from "../../scripts/authoring-scan";

const repositoryRoot = resolve(import.meta.dir, "../..");

describe("agent declaration/source boundaries", () => {
  test("the real public authoring sources contain no vendor agent details", () => {
    expect(scanAuthoring(repositoryRoot)).toEqual([]);
  });

  test("the shared authoring scan rejects vendor models and credentials on agents", async () => {
    const root = await mkdtemp(join(process.env.TMPDIR ?? "/tmp", "relkit-agent-scan-"));
    try {
      const source = join(root, "examples/commerce/src/invalid.agent.ts");
      await mkdir(join(root, "packages"), { recursive: true });
      await mkdir(join(root, "examples/commerce/src"), { recursive: true });
      await writeFile(
        source,
        `defineAgent({ id: "bad.agent", input, output, model: "gpt-4o", credentials: { apiKey: "secret" }, instructions: "bad", tools: [], limits: { maxSteps: 1, maxToolCalls: 1, timeoutMs: 1 } });\n`,
      );
      expect(scanAuthoring(root).map(({ rule }) => rule)).toEqual([
        "vendor-profile-name",
        "agent-provider-details",
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
