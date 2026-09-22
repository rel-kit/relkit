import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { generateProject, normalizeCreateOptions } from "../../packages/create-relkit/src/index.js";

test("Docker Jobs starters include the local orchestrator and documented config", async () => {
  const parent = await mkdtemp(join(tmpdir(), "relkit-jobs-starters-"));
  try {
    for (const provider of ["inngest", "effect-mq", "trigger"] as const) {
      const options = normalizeCreateOptions([
        `relkit-${provider}`,
        "--jobs",
        `${provider}-docker`,
        "--no-install",
        "--no-git",
      ]);
      const generated = await generateProject(options, {
        cwd: parent,
        templateRoot: resolve(import.meta.dir, "../../templates/default/v1"),
      });
      const manifest = JSON.parse(await readFile(join(generated.destination, "package.json"), "utf8"));
      expect(manifest.dependencies).toMatchObject({
        "@relkit/docker": manifest.dependencies["@relkit/app"],
        "@relkit/local": manifest.dependencies["@relkit/app"],
        [`@relkit/${provider}`]: manifest.dependencies["@relkit/app"],
      });
      const config = await readFile(join(generated.destination, "relkit.config.ts"), "utf8");
      const example = resolve(import.meta.dir, `../../apps/docs/examples/jobs/providers/${provider}-config.ts`);
      expect(config).toBe(await readFile(example, "utf8"));
    }
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
