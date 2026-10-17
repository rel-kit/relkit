import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { format, resolveConfig } from "prettier";
import {
  renderCapabilitySource,
  templateDigest,
  validateCreationReport,
} from "./release-create-evidence.js";
import type { CreateCapabilityEvidence } from "create-relkit";

type Run = (args: string[]) => Promise<void>;

/**
 * Measures the versioned candidate before retaining its allow-list and evidence.
 * A provisional identity is needed to exercise the packed public creation gate;
 * every failed measurement or validation restores the original owned bytes.
 */
export async function certifyCreation(
  root: string,
  entry: CreateCapabilityEvidence,
  run: Run,
  policy: "readiness" | "performance" = "readiness",
): Promise<void> {
  const sourcePath = join(root, "packages/create-relkit/src/create-capabilities.ts");
  const source = await readFile(sourcePath, "utf8");
  const temporary = await mkdtemp(
    join(process.env.RUNNER_TEMP ?? tmpdir(), "relkit-create-certification-"),
  );
  const previous = new Map<string, string | undefined>([[sourcePath, source]]);
  let passed = false;
  try {
    const config = await resolveConfig(sourcePath);
    const candidate = await format(renderCapabilitySource(source, entry), {
      ...config,
      parser: "typescript",
    });
    await writeFile(sourcePath, candidate);
    await run([
      "x",
      "turbo",
      "run",
      "build",
      "--filter=./packages/*",
      "--filter=./integrations/*",
      "--filter=./integrations/packages/*",
    ]);
    for (const set of ["fresh", "restart"] as const) {
      const output = join(temporary, `${set}.json`);
      await run([
        "scripts/benchmark-packed-dev.ts",
        "--set",
        set,
        "--runs",
        "20",
        "--cleanup",
        ...(policy === "readiness" ? ["--readiness-only"] : []),
        "--output",
        output,
      ]);
      const report = await readFile(output, "utf8");
      const parsed = JSON.parse(report);
      assert.equal(parsed.version, policy === "readiness" ? 2 : 1);
      validateCreationReport(parsed, entry, set);
      if (policy === "readiness" && !parsed.summary.passed) {
        const message = `${set}: functional readiness passed; one-second performance target failed. See retained samples and host identity.`;
        console.warn(process.env.GITHUB_ACTIONS === "true" ? `::warning::${message}` : message);
      }
      const target = join(root, entry[`${set}Evidence`]);
      previous.set(
        target,
        await readFile(target, "utf8").catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
          return undefined;
        }),
      );
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, await format(report, { ...config, parser: "json" }));
    }
    await run(["test", "tests/unit/release-check.test.ts"]);
    await run([
      "x",
      "--bun",
      "vitest",
      "run",
      "--config",
      "packages/create-relkit/vitest.config.ts",
      "packages/create-relkit/tests/create-capabilities.effect.test.ts",
    ]);
    assert.equal(
      await templateDigest(join(root, "templates/default/v1/minimal")),
      entry.templateDigest,
      "Template bytes changed during certification",
    );
    passed = true;
  } finally {
    if (!passed)
      for (const [path, bytes] of previous)
        if (bytes === undefined) await rm(path, { force: true });
        else await writeFile(path, bytes);
    if (passed && policy === "readiness") await rm(temporary, { recursive: true, force: true });
    else
      console.error(
        `${passed ? "Performance" : "Failed"} certification reports retained at ${temporary}`,
      );
  }
}

async function main(): Promise<void> {
  assert.equal(
    process.env.RELKIT_INSPECTOR_ROOT,
    undefined,
    "Certification requires the packaged inspector",
  );
  const root = resolve(import.meta.dir, "..");
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  assert.equal(
    `bun@${Bun.version}`,
    manifest.packageManager,
    "Certification requires the repository's pinned Bun version",
  );
  const run = async (args: string[]) => {
    const child = Bun.spawn([process.execPath, ...args], {
      cwd: root,
      stdout: "inherit",
      stderr: "inherit",
    });
    const code = await child.exited;
    if (code !== 0)
      throw new Error(`Creation certification command failed (${code}): bun ${args.join(" ")}`);
  };
  await run(["x", "turbo", "run", "build", "--filter=create-relkit..."]);
  const { CREATE_CAPABILITY_TABLE, currentCreateCapabilityIdentity } =
    await import("create-relkit");
  const [previous] = CREATE_CAPABILITY_TABLE.entries;
  assert.equal(
    CREATE_CAPABILITY_TABLE.entries.length,
    1,
    "Update the certification driver for additional supported tuples",
  );
  assert.ok(
    previous?.template === "minimal" &&
      previous.cloud === "none" &&
      previous.deploy === "none" &&
      previous.examples &&
      previous.jobs === undefined,
  );
  const identity = currentCreateCapabilityIdentity();
  const entry: CreateCapabilityEvidence = {
    ...previous,
    identity,
    templateDigest: await templateDigest(join(root, "templates/default/v1/minimal")),
    freshEvidence: `docs/evidence/create-capabilities/${identity.release}/fresh.json`,
    restartEvidence: `docs/evidence/create-capabilities/${identity.release}/restart.json`,
  };
  await certifyCreation(
    root,
    entry,
    run,
    process.argv.includes("--performance") ? "performance" : "readiness",
  );
}

if (import.meta.main) await main();
