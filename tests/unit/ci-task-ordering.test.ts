/** Exercises real Turbo prerequisite graphs and cold native package imports before container gate startup. */
import { expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repository = resolve(import.meta.dir, "../..");

for (const owner of ["cli", "inspector"])
  test(`${owner} typecheck waits for every direct first-party dependency`, () => {
    const result = Bun.spawnSync(
      ["./node_modules/.bin/turbo", "run", "typecheck", `--filter=@relkit/${owner}`, "--dry=json"],
      { cwd: repository, stdout: "pipe", stderr: "pipe", timeout: 10_000 },
    );
    expect(result.exitCode, result.stderr.toString()).toBe(0);
    const plan: { tasks: { taskId: string; dependencies: string[] }[] } = JSON.parse(
      result.stdout.toString(),
    );
    const manifest: {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    } = JSON.parse(readFileSync(join(repository, "packages", owner, "package.json"), "utf8"));
    const tasks = new Map(plan.tasks.map((entry) => [entry.taskId, entry.dependencies]));
    const prerequisites = tasks.get(`@relkit/${owner}#typecheck`);
    expect(prerequisites).toBeDefined();
    for (const [name, specifier] of Object.entries({
      ...manifest.dependencies,
      ...manifest.devDependencies,
    })) {
      if (!specifier.startsWith("workspace:")) continue;
      const dependency = `${name}#typecheck`;
      expect(prerequisites, name).toContain(dependency);
      expect(tasks.has(dependency), name).toBe(true);
    }
  });

for (const outcome of ["success", "build-failure"])
  test(`container command bootstraps a cold package before runtime imports: ${outcome}`, () => {
    const fixture = mkdtempSync(join(tmpdir(), "relkit-container-bootstrap-"));
    try {
      prepareContainerFixture(fixture, outcome);
      expect(existsSync(join(fixture, "packages/contracts/dist"))).toBe(false);
      const install = Bun.spawnSync([process.execPath, "install", "--ignore-scripts"], {
        cwd: fixture,
        stdout: "pipe",
        stderr: "pipe",
        timeout: 10_000,
      });
      expect(install.exitCode, install.stderr.toString()).toBe(0);
      mkdirSync(join(fixture, "node_modules/.bin"), { recursive: true });
      symlinkSync(
        join(repository, "node_modules/.bin/turbo"),
        join(fixture, "node_modules/.bin/turbo"),
      );
      const result = Bun.spawnSync([process.execPath, "run", "test:container"], {
        cwd: fixture,
        stdout: "pipe",
        stderr: "pipe",
        timeout: 20_000,
        env: { ...process.env, TURBO_TELEMETRY_DISABLED: "1" },
      });
      const output = result.stdout.toString() + result.stderr.toString();
      if (outcome === "success") {
        expect(result.exitCode, output).toBe(0);
        expect(output).toContain("container runtime imported compiled contracts");
      } else {
        expect(result.exitCode).not.toBe(0);
        expect(output).toContain("contracts bootstrap failed");
        expect(output).not.toContain("container runtime imported compiled contracts");
      }
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

/**
 * Creates a tiny workspace with no contracts output and the actual root container command.
 * @param fixture - Owned temporary root, removed after the native child settles.
 * @param outcome - Whether the package build emits its entrypoint or fails first.
 * @returns Completion after source, exports, task config and probe are available.
 */
function prepareContainerFixture(fixture: string, outcome: string): void {
  const manifest: { scripts: Record<string, string>; packageManager: string } = JSON.parse(
    readFileSync(join(repository, "package.json"), "utf8"),
  );
  mkdirSync(join(fixture, "packages/contracts/src"), { recursive: true });
  mkdirSync(join(fixture, "scripts"));
  writeFileSync(
    join(fixture, "package.json"),
    JSON.stringify({
      name: "container-bootstrap-fixture",
      private: true,
      type: "module",
      packageManager: manifest.packageManager,
      workspaces: ["packages/*"],
      dependencies: { "@relkit/contracts": "workspace:*" },
      scripts: { "test:container": manifest.scripts["test:container"] },
    }),
  );
  writeFileSync(
    join(fixture, "turbo.json"),
    JSON.stringify({ tasks: { build: { outputs: ["dist/**"] } } }),
  );
  prepareContractsPackage(fixture, outcome);
  writeFileSync(
    join(fixture, "scripts/test-container.ts"),
    'import { ready } from "@relkit/contracts/operation";\nif (!ready) throw new Error("Missing contracts bootstrap");\nconsole.log("container runtime imported compiled contracts");\n',
  );
}

/**
 * Defines an actual source build and package export, without any prebuilt artifact.
 * @param fixture - Workspace root containing the fixture contracts package.
 * @param outcome - Native successful build or deliberate failure before runtime admission.
 * @returns Completion after the package manifest and TypeScript input exist.
 */
function prepareContractsPackage(fixture: string, outcome: string): void {
  writeFileSync(
    join(fixture, "packages/contracts/package.json"),
    JSON.stringify({
      name: "@relkit/contracts",
      version: "0.0.0",
      type: "module",
      exports: { "./operation": "./dist/operation.js" },
      scripts: {
        build:
          outcome === "success"
            ? "bun build src/operation.ts --outdir dist --target bun"
            : "bun -e 'console.error(\"contracts bootstrap failed\");process.exit(37)'",
      },
    }),
  );
  writeFileSync(
    join(fixture, "packages/contracts/src/operation.ts"),
    "export const ready: boolean = true;\n",
  );
}
