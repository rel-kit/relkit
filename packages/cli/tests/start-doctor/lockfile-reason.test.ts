/**
 * `relkit doctor` says why the frozen lockfile check failed, with the package manager's own first
 * lines, in the terminal and in `--json`, without anything that looks like a credential.
 */
import { afterEach, beforeEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkLockfile } from "../../src/commands/doctor-checks.js";
import { lockfileReason } from "../../src/commands/doctor-lockfile-reason.js";
import { formatDoctor } from "../../src/commands/doctor-support.js";
import type { DoctorResult } from "../../src/commands/doctor.types.js";

const npmOutput = [
  "npm error code EUSAGE",
  "npm error",
  "npm error `npm ci` can only install packages when your package.json and package-lock.json are in sync.",
  "npm error",
  "npm error Missing: left-pad@1.3.0 from lock file",
  "npm error Invalid: lock file's react@18.2.0 does not satisfy react@19.0.0",
  "npm error",
  "npm error Clean install a project",
  "npm error",
  "npm error Usage:",
  "npm error npm ci",
  "npm error",
  "npm error Options:",
  "npm error [--install-strategy <hoisted|nested|shallow|linked>]",
].join("\n");

let root = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "relkit-doctor-lockfile-"));
  await writeFile(join(root, "package.json"), '{"name":"x","version":"1.0.0"}');
  await writeFile(join(root, "package-lock.json"), "{}");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

test("keeps the reason and drops npm's usage text", () => {
  expect(lockfileReason(npmOutput, root)).toEqual([
    "code EUSAGE",
    "`npm ci` can only install packages when your package.json and package-lock.json are in sync.",
    "Missing: left-pad@1.3.0 from lock file",
    "Invalid: lock file's react@18.2.0 does not satisfy react@19.0.0",
  ]);
});

test("trims long output to its first lines and long lines to a bounded length", () => {
  const output = Array.from({ length: 40 }, (_, index) => `error: line ${index}`).join("\n");
  expect(lockfileReason(output, root)).toHaveLength(8);
  expect(lockfileReason(`error: ${"x".repeat(600)}`, root)[0]!.length).toBeLessThanOrEqual(200);
});

test("masks credentials, registry logins and the project path", () => {
  const output = [
    `error: cannot reach https://deploy:s3cr3t-pass@registry.example/pkg for ${root}/package.json`,
    "npm error //registry.npmjs.org/:_authToken=npm_abcdefghijklmnopqrstuvwxyz0123456789",
    "error: Authorization: Bearer abc.def.ghi",
    "error: token=ghp_abcdefghijklmnopqrstuvwxyz0123456789",
  ].join("\n");
  const reason = lockfileReason(output, root).join("\n");
  expect(reason).not.toContain("s3cr3t-pass");
  expect(reason).not.toContain("npm_abcdefghij");
  expect(reason).not.toContain("abc.def.ghi");
  expect(reason).not.toContain("ghp_abcdefghij");
  expect(reason).not.toContain(root);
  expect(reason).toContain("registry.example/pkg");
  expect(reason).toContain("<project>/package.json");
});

test("a failed check carries the reason in its details and in the terminal report", async () => {
  const check = await checkLockfile(root, async () => ({ exitCode: 1, output: npmOutput }));
  expect(check).toMatchObject({
    name: "lockfile",
    ok: false,
    message: "Frozen lockfile consistency check failed.",
    details: {
      packageManager: "npm",
      reason: [
        "code EUSAGE",
        "`npm ci` can only install packages when your package.json and package-lock.json are in sync.",
        "Missing: left-pad@1.3.0 from lock file",
        "Invalid: lock file's react@18.2.0 does not satisfy react@19.0.0",
      ],
    },
  });
  const result: DoctorResult = { ok: false, command: "doctor", projectRoot: root, checks: [check] };
  const lines = formatDoctor(result).split("\n");
  expect(lines[0]).toBe("✗ lockfile: Frozen lockfile consistency check failed.");
  expect(lines).toContain("    Missing: left-pad@1.3.0 from lock file");
  expect(JSON.parse(JSON.stringify(result)).checks[0].details.reason).toHaveLength(4);
});

test("a consistent lockfile and a failure without output stay as they were", async () => {
  expect(await checkLockfile(root, async () => ({ exitCode: 0 }))).toEqual({
    name: "lockfile",
    ok: true,
    message: "Frozen lockfile is consistent.",
  });
  const silent = await checkLockfile(root, async () => ({ exitCode: 1 }));
  expect(silent.ok).toBe(false);
  expect(silent.details?.["reason"]).toBeUndefined();
});

test.skipIf(spawnSync("npm", ["--version"]).status !== 0)(
  "names the dependency npm says is out of sync with the lockfile",
  async () => {
    await mkdir(join(root, "app"));
    await writeFile(
      join(root, "app", "package.json"),
      '{"name":"x","version":"1.0.0","dependencies":{"left-pad":"1.3.0"}}',
    );
    await writeFile(
      join(root, "app", "package-lock.json"),
      '{"name":"x","version":"1.0.0","lockfileVersion":3,"requires":true,"packages":{"":{"name":"x","version":"1.0.0"}}}',
    );
    const check = await checkLockfile(join(root, "app"));
    expect(check.ok).toBe(false);
    expect(check.details?.["reason"]).toContain("Missing: left-pad@1.3.0 from lock file");
  },
  30_000,
);
