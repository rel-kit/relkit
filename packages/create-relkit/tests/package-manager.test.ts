/** Covers package-manager selection for new and existing projects and its command spellings. */
import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGenerateNextSteps } from "../src/generate-output.js";
import { normalizeCreateOptions } from "../src/options.js";
import {
  creationPackageManager,
  packageManagerCommands,
  packageManagerFromUserAgent,
  projectPackageManager,
} from "../src/package-manager.js";

test("reads the invoking manager and its version from the user agent", () => {
  expect(
    packageManagerFromUserAgent("npm/10.9.0 node/v22.13.0 darwin arm64 workspaces/false"),
  ).toEqual({ name: "npm", version: "10.9.0" });
  expect(packageManagerFromUserAgent("pnpm/11.9.0 npm/? node/v24.12.0 darwin arm64")).toEqual({
    name: "pnpm",
    version: "11.9.0",
  });
  expect(packageManagerFromUserAgent("yarn/4.5.0 npm/? node/v22.13.0")).toBeUndefined();
  expect(packageManagerFromUserAgent("")).toBeUndefined();
});

test("an explicit choice wins over the invoking manager", () => {
  expect(creationPackageManager("pnpm", "npm/10.9.0 node/v22.13.0")).toBe("pnpm");
  expect(creationPackageManager(undefined, "npm/10.9.0 node/v22.13.0")).toBe("npm");
  // Without an agent, the runtime decides; tests run on Bun.
  expect(creationPackageManager(undefined, "")).toBe("bun");
  expect(normalizeCreateOptions(["app", "--package-manager", "pnpm"]).packageManager).toBe("pnpm");
  expect(() => normalizeCreateOptions(["app", "--package-manager", "yarn"])).toThrow(
    "--package-manager must be one of: bun|npm|pnpm.",
  );
});

test("an existing project names its manager by packageManager, then by lockfile", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-package-manager-"));
  try {
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "app" }));
    expect(projectPackageManager(root, "npm/10.9.0")).toBe("npm");
    await writeFile(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    expect(projectPackageManager(root, "npm/10.9.0")).toBe("pnpm");
    await writeFile(join(root, "package.json"), JSON.stringify({ packageManager: "bun@1.3.10" }));
    expect(projectPackageManager(root, "npm/10.9.0")).toBe("bun");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("next steps and installs are spelled for the selected manager", () => {
  expect(packageManagerCommands("npm").frozenCheck).toEqual([
    "ci",
    "--dry-run",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
  ]);
  const steps = createGenerateNextSteps(
    { examples: true, install: false, packageManager: "pnpm" },
    "/work/app",
    "/work",
  );
  expect(steps.commands).toEqual({
    cd: "cd app",
    install: "pnpm install",
    prepare: "pnpm exec relkit dev --prepare",
    dev: "pnpm run dev",
    test: "pnpm run test",
    check: "pnpm run check",
    build: "pnpm run build",
  });
});
