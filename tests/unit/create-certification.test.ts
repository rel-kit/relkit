import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { certifyCreation } from "../../scripts/certify-create.ts";
import { templateDigest, validateCreationReport } from "../../scripts/release-create-evidence.ts";
import { CREATE_CAPABILITY_TABLE } from "../../packages/create-relkit/src/create-capabilities.ts";

const root = resolve(import.meta.dir, "../..");
const entry = {
  ...CREATE_CAPABILITY_TABLE.entries[0]!,
  identity: { ...CREATE_CAPABILITY_TABLE.entries[0]!.identity, release: "9.9.9" },
  freshEvidence: "docs/evidence/create-capabilities/9.9.9/fresh.json",
  restartEvidence: "docs/evidence/create-capabilities/9.9.9/restart.json",
};

function report(set: "fresh" | "restart") {
  return {
    protocol: "relkit.dev-readiness",
    version: 1,
    mode: "candidate-certification",
    set,
    command: "bun dev",
    thresholdMs: 1_000,
    fixture: { version: entry.identity.release, examples: "examples" },
    identity: {
      bun: { version: entry.identity.bun },
      cli: { version: entry.identity.release },
      typescript: { version: entry.identity.typescript },
      inspectorOverride: "absent",
      artifacts: ["create-relkit", "@relkit/cli"].map((name) => ({
        name,
        hash: `sha256:${"a".repeat(64)}`,
      })),
    },
    summary: { runs: 20, passed: true, preparationPassed: true },
    attempts: Array.from({ length: 20 }, (_, index) => ({
      run: index + 1,
      sample: {
        outcome: "response",
        durationMs: 100,
        cleanupFailure: undefined as string | undefined,
        exitCode: undefined as number | undefined,
      },
    })),
    preparationAttempt: { sample: { outcome: "response", durationMs: 100 } },
  };
}

test("certification requires all original packed attempts and exact identities", () => {
  for (const set of ["fresh", "restart"] as const) {
    expect(() => validateCreationReport(report(set), entry, set)).not.toThrow();
    for (const mutate of [
      (value: ReturnType<typeof report>) => {
        value.fixture.version = "0.0.0";
      },
      (value: ReturnType<typeof report>) => {
        value.identity.cli.version = "0.0.0";
      },
      (value: ReturnType<typeof report>) => {
        value.mode = "candidate-diagnostic";
      },
      (value: ReturnType<typeof report>) => {
        value.attempts.pop();
      },
      (value: ReturnType<typeof report>) => {
        value.attempts[0]!.sample.durationMs = 1_000;
      },
      (value: ReturnType<typeof report>) => {
        value.attempts[0]!.sample.cleanupFailure = "leaked child";
      },
      (value: ReturnType<typeof report>) => {
        value.attempts[0]!.sample.exitCode = 1;
      },
      (value: ReturnType<typeof report>) => {
        value.identity.artifacts = [];
      },
      (value: ReturnType<typeof report>) => {
        value.identity.inspectorOverride = "present";
      },
    ]) {
      const value = report(set);
      mutate(value);
      expect(() => validateCreationReport(value, entry, set)).toThrow();
    }
  }
  const restart = report("restart");
  restart.preparationAttempt.sample.durationMs = 1_000;
  expect(() => validateCreationReport(restart, entry, "restart")).toThrow();
});

for (const failure of ["none", "measurement", "report", "final-check"] as const) {
  test(`certification preserves owned bytes when failure is ${failure}`, async () => {
    const fixture = await mkdtemp(join(tmpdir(), "relkit-certification-test-"));
    const sourcePath = join(fixture, "packages/create-relkit/src/create-capabilities.ts");
    const source = await readFile(
      join(root, "packages/create-relkit/src/create-capabilities.ts"),
      "utf8",
    );
    const restartPath = join(fixture, entry.restartEvidence);
    try {
      await mkdir(dirname(sourcePath), { recursive: true });
      await writeFile(sourcePath, source);
      const templateRoot = join(fixture, "templates/default/v1/minimal");
      await mkdir(templateRoot, { recursive: true });
      const fixtureEntry = { ...entry, templateDigest: await templateDigest(templateRoot) };
      await mkdir(dirname(restartPath), { recursive: true });
      await writeFile(restartPath, "previous report bytes\n");
      const calls: string[][] = [];
      const run = async (args: string[]) => {
        calls.push(args);
        const set = args[args.indexOf("--set") + 1];
        if (args.includes("--set")) {
          expect(args).toContain("20");
          expect(await readFile(sourcePath, "utf8")).toContain('release: "9.9.9"');
          if (failure === "measurement") throw new Error("measurement failed");
          const value = report(set as "fresh" | "restart");
          if (failure === "report" && set === "restart") value.attempts.pop();
          await writeFile(args[args.indexOf("--output") + 1]!, JSON.stringify(value));
        } else if (failure === "final-check" && args[0] === "test")
          throw new Error("packaged gate failed");
      };
      if (failure === "none") {
        await certifyCreation(fixture, fixtureEntry, run);
        expect(calls).toHaveLength(5);
        expect(JSON.parse(await readFile(restartPath, "utf8")).fixture.version).toBe("9.9.9");
      } else {
        await expect(certifyCreation(fixture, fixtureEntry, run)).rejects.toThrow();
        expect(await readFile(sourcePath, "utf8")).toBe(source);
        expect(await readFile(restartPath, "utf8")).toBe("previous report bytes\n");
        expect(await Bun.file(join(fixture, entry.freshEvidence)).exists()).toBe(false);
      }
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });
}
