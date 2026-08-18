import { afterEach, expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { defineEnv, env } from "@zsys/config";
import { checkProject } from "./src/commands/check.js";
import { runDoctor } from "./src/commands/doctor.js";
import { runEnv } from "./src/commands/env.js";
import { runGraph } from "./src/commands/graph.js";

const roots: string[] = [];
const cliEnv = defineEnv({
  API_KEY: env.secret().default("cli-synthetic-secret").description("API key"),
  PORT: env.port().default(3210),
  REQUIRED: env.string().requiredIn("production").example("safe-value"),
});

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("graph print/check/diff success and failure use structured exits", async () => {
  const root = await copyProject("tests/compiler/fixtures/valid-minimal");
  const checked = await checkProject({ projectRoot: root });
  const graphPath = join(root, ".zsys", "generated", "application.graph.json");
  const afterPath = join(root, ".zsys", "generated", "after.graph.json");
  await writeFile(afterPath, await readFile(graphPath));

  const printed = capture();
  expect(await runGraph(["print", graphPath], printed.context)).toBe(0);
  expect(printed.outputs[0]).toMatchObject({ command: "print", graphHash: checked.graphHash });

  const valid = capture();
  expect(await runGraph(["check", graphPath, "--hash", checked.graphHash!], valid.context)).toBe(0);
  expect(valid.outputs[0]).toMatchObject({ command: "check", graphHash: checked.graphHash });

  const diff = capture();
  expect(await runGraph(["diff", graphPath, afterPath], diff.context)).toBe(0);
  expect(diff.outputs[0]).toMatchObject({ command: "diff", changes: [] });

  const mismatch = capture();
  expect(
    await runGraph(["check", graphPath, "--hash", `sha256:${"0".repeat(64)}`], mismatch.context),
  ).toBe(1);
  expect(mismatch.errors[0]).toMatchObject({ code: "ZSYS_GRAPH_HASH_MISMATCH" });

  const usage = capture();
  expect(await runGraph(["diff", graphPath], usage.context)).toBe(2);
  expect(usage.errors[0]).toMatchObject({ code: "ZSYS_GRAPH_USAGE" });
});

test("env and doctor cover safe success, failure, and usage paths", async () => {
  const envSuccess = capture();
  expect(
    await runEnv(["check", "--environment", "development"], envSuccess.context, {
      definition: cliEnv,
      source: {},
    }),
  ).toBe(0);
  expect(envSuccess.outputs[0]).toMatchObject({ ok: true, command: "check" });

  const explain = capture();
  expect(
    await runEnv(["explain", "API_KEY"], explain.context, { definition: cliEnv, source: {} }),
  ).toBe(0);
  expect(explain.outputs[0]).toMatchObject({ name: "API_KEY", sensitive: true, hasDefault: true });
  expect(JSON.stringify(explain.outputs)).not.toContain("cli-synthetic-secret");

  const envFailure = capture();
  expect(
    await runEnv(["check", "--environment", "production"], envFailure.context, {
      definition: cliEnv,
      source: {},
    }),
  ).toBe(1);
  expect(envFailure.outputs[0]).toMatchObject({ ok: false, command: "check" });
  expect(JSON.stringify(envFailure.outputs)).not.toContain("cli-synthetic-secret");

  const envUsage = capture();
  expect(await runEnv(["check", "--unknown"], envUsage.context)).toBe(2);
  expect(envUsage.errors[0]).toMatchObject({ code: "ZSYS_ENV_USAGE" });

  const doctorRoot = await copyProject("apps/fixture-commerce");
  const doctorSuccess = capture();
  expect(
    await runDoctor(["--project-root", doctorRoot, "--no-pulumi"], doctorSuccess.context, {
      source: { PORT: "0" },
      commandRunner: async () => ({ exitCode: 0 }),
      portProbe: async () => true,
    }),
  ).toBe(0);
  expect(doctorSuccess.outputs[0]).toMatchObject({ ok: true, command: "doctor" });

  const doctorFailure = capture();
  expect(
    await runDoctor(["--project-root", doctorRoot, "--pulumi"], doctorFailure.context, {
      source: { AWS_SECRET_ACCESS_KEY: "doctor-cli-synthetic-secret" },
      commandRunner: async () => ({ exitCode: 1 }),
      portProbe: async () => true,
    }),
  ).toBe(1);
  expect(doctorFailure.outputs[0]).toMatchObject({ ok: false, command: "doctor" });
  expect(JSON.stringify(doctorFailure.outputs)).not.toContain("doctor-cli-synthetic-secret");

  const doctorUsage = capture();
  expect(await runDoctor(["--unknown"], doctorUsage.context)).toBe(2);
  expect(doctorUsage.errors[0]).toMatchObject({ code: "ZSYS_DOCTOR_USAGE" });
});

async function copyProject(relativePath: string): Promise<string> {
  const root = await mkdtemp(join(process.cwd(), ".zsys-cli-test-"));
  roots.push(root);
  await cp(join(process.cwd(), relativePath), root, { recursive: true });
  await cp(join(process.cwd(), "apps/fixture-commerce/package.json"), join(root, "package.json"));
  await rm(join(root, "node_modules"), { recursive: true, force: true });
  await linkWorkspacePackages(root);
  return root;
}

async function linkWorkspacePackages(root: string): Promise<void> {
  const scope = join(root, "node_modules", "@zsys");
  await mkdir(scope, { recursive: true });
  for (const name of [
    "agents",
    "app",
    "buckets",
    "cache",
    "compiler",
    "config",
    "contracts",
    "diagnostics",
    "engine",
    "events",
    "functions",
    "graph",
    "jobs",
    "observability",
    "providers-local",
    "routes",
    "runtime-effect",
    "schema",
    "supervisor",
    "testing",
    "tools",
  ])
    await symlink(join(process.cwd(), "packages", name), join(scope, name));
}

function capture() {
  const outputs: unknown[] = [];
  const errors: Array<{ readonly code: string; readonly message: string }> = [];
  return {
    outputs,
    errors,
    context: {
      json: true,
      reporter: {
        output: (value: unknown) => outputs.push(value),
        error: (code: string, message: string) => errors.push({ code, message }),
      },
    },
  };
}
