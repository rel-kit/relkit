/**
 * `relkit add jobs --provider postgres` and `relkit add events --provider postgres`
 * as transactional edits on a temporary project: the planned profile, default,
 * dependency and DATABASE_URL secret are written and verified together, a
 * failed installation restores every file byte for byte, and a profile name
 * already used by another adapter is refused before any write.
 */
import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ADD_FAILURE_CODES } from "create-relkit/add-types";
import { normalizeAddRequest } from "../../src/scaffolding/add-options.js";
import { planAdd } from "../../src/scaffolding/add-plan.js";
import { applyScaffoldPlan } from "../../src/scaffolding/add-transaction.js";

const CONFIG = `import { defineApp } from "@relkit/app/config";\nimport env from "./src/platform/env.js";\n\nexport default defineApp({ env });\n`;
const ENV = `import { defineEnv, env } from "@relkit/app/config";\n\nexport default defineEnv({\n  LOG_LEVEL: env.string().default("info"),\n});\n`;

async function project(run: (root: string) => Promise<void>, config = CONFIG): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "relkit-add-durable-"));
  try {
    await writeFile(
      join(root, "package.json"),
      `${JSON.stringify({ name: "orders", dependencies: { relkit: "0.8.3" } }, null, 2)}\n`,
    );
    await writeFile(join(root, "relkit.config.ts"), config);
    await mkdir(join(root, "src/platform"), { recursive: true });
    await writeFile(join(root, "src/platform/env.ts"), ENV);
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const succeed = async () => ({ exitCode: 0, stdout: "", stderr: "" });

for (const [kind, constructor, key] of [
  ["jobs", "postgresJob", "jobs"],
  ["events", "postgresEvent", "event"],
] as const) {
  test(`relkit add ${kind} --provider postgres writes a default Postgres profile`, async () => {
    await project(async (root) => {
      const plan = await planAdd(
        normalizeAddRequest([kind, "--provider", "postgres", "--project-root", root]),
      );
      expect(plan.warnings.map((warning) => warning.code)).toContain("database-url-required");
      await applyScaffoldPlan(plan, { commandRunner: succeed });
      const config = await readFile(join(root, "relkit.config.ts"), "utf8");
      expect(config).toContain(`import { ${constructor} } from "@relkit/postgres";`);
      expect(config).toContain(
        `${key}: { "postgres": ${constructor}({ url: binding.secret("DATABASE_URL") }) }`,
      );
      expect(config).toContain(`${key}: "postgres"`);
      const environment = await readFile(join(root, "src/platform/env.ts"), "utf8");
      expect(environment).toContain(`DATABASE_URL: env.secret()`);
      const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
      expect(manifest.dependencies["@relkit/postgres"]).toMatch(/^\d+\.\d+\.\d+/u);
    });
  });
}

test("a failed installation rolls back every edit of relkit add jobs", async () => {
  await project(async (root) => {
    const before = {
      config: await readFile(join(root, "relkit.config.ts")),
      environment: await readFile(join(root, "src/platform/env.ts")),
      manifest: await readFile(join(root, "package.json")),
    };
    const plan = await planAdd(
      normalizeAddRequest(["jobs", "--provider", "postgres", "--project-root", root]),
    );
    await expect(
      applyScaffoldPlan(plan, {
        commandRunner: async () => {
          await writeFile(join(root, "bun.lock"), "partial lock\n");
          return { exitCode: 1, stdout: "", stderr: "registry unavailable" };
        },
      }),
    ).rejects.toMatchObject({ code: ADD_FAILURE_CODES.installation });
    expect(await readFile(join(root, "relkit.config.ts"))).toEqual(before.config);
    expect(await readFile(join(root, "package.json"))).toEqual(before.manifest);
    expect(await readFile(join(root, "src/platform/env.ts"))).toEqual(before.environment);
    expect(await Bun.file(join(root, "bun.lock")).exists()).toBe(false);
  });
});

test("an existing profile of the same name with another adapter is refused", async () => {
  const config = `import { defineApp } from "@relkit/app/config";\nimport { localJob } from "@relkit/local";\nimport env from "./src/platform/env.js";\n\nexport default defineApp({ env, jobs: { postgres: localJob() } });\n`;
  await project(async (root) => {
    await expect(
      planAdd(normalizeAddRequest(["jobs", "--provider", "postgres", "--project-root", root])),
    ).rejects.toMatchObject({ code: ADD_FAILURE_CODES.usage });
    expect(await readFile(join(root, "relkit.config.ts"), "utf8")).toBe(config);
  }, config);
});
