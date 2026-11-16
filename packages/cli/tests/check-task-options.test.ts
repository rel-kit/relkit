/**
 * A task limit that the selected jobs backend does not enforce is reported by name: as a warning
 * of `relkit check`, through the real check pipeline, and as a warning the generated server logs
 * when it starts. The local backend enforces both limits and is not reported.
 */
import { expect, test } from "bun:test";
import { mkdir, realpath, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect } from "effect";
import { checkProjectEffect } from "../src/commands/check.js";
import { serverProviderSource } from "../src/commands/build-server-provider.js";
import { runCli } from "../src/main.js";
import { projectCapabilitiesLayer } from "../src/services/project-capabilities.js";
import {
  copyProject,
  registerCommandCleanup,
} from "../../../tests/fixtures/cli/commands-core-fixture.js";

registerCommandCleanup();

const CODE = "RELKIT_JOB_TASK_OPTION_UNSUPPORTED";

/**
 * Copies the minimal application and adds one task with both limits, run by one job.
 * @param backend - Import and call of the jobs backend under test.
 * @returns The project root.
 */
async function projectWithLimits(backend: {
  readonly from: string;
  readonly call: string;
}): Promise<string> {
  const root = await copyProject("tests/compiler/fixtures/valid-minimal");
  const zod = await realpath(join(import.meta.dir, "../../relkit/node_modules/zod"));
  await symlink(zod, join(root, "node_modules/zod"));
  await writeFile(
    join(root, "relkit.config.ts"),
    `import { defineApp, defineEnv, env as envFactory } from "relkit";
import { ${backend.call.replace(/\(.*$/u, "")} } from "${backend.from}";

const env = defineEnv({ SERVICE_PORT: envFactory.port().default(3000) });
export default defineApp({
  id: "minimal-app",
  env,
  jobs: { default: ${backend.call} },
  defaults: { jobs: "default" },
});
`,
  );
  await mkdir(join(root, "src/hello/tasks"), { recursive: true });
  await mkdir(join(root, "src/hello/jobs"), { recursive: true });
  await writeFile(
    join(root, "src/hello/tasks/export.task.ts"),
    `import { defineTask } from "relkit/tasks";
import { z } from "zod";

export default defineTask({
  id: "hello.export",
  version: "1",
  input: z.object({}),
  output: z.object({ done: z.boolean() }),
  maxDuration: "30 seconds",
  maxElapsed: "5 minutes",
  handler: async () => ({ done: true }),
});
`,
  );
  await writeFile(
    join(root, "src/hello/jobs/export.job.ts"),
    `import { defineJob } from "relkit/jobs";
import exportTask from "../tasks/export.task.js";

export default defineJob({ name: "exportHello", id: "hello.export", task: exportTask });
`,
  );
  return root;
}

/**
 * Runs the real check pipeline.
 * @param projectRoot - Project root.
 * @returns The check result.
 */
function check(projectRoot: string) {
  return Effect.runPromise(
    checkProjectEffect({ projectRoot }).pipe(Effect.provide(projectCapabilitiesLayer)),
  );
}

test("check warns for each limit the jobs backend does not enforce", async () => {
  const result = await check(
    await projectWithLimits({ from: "@relkit/inngest", call: "inngest()" }),
  );
  expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
  const reported = result.diagnostics.filter(({ code }) => code === CODE);
  expect(reported.map(({ severity }) => severity)).toEqual(["warning", "warning"]);
  expect(reported.map(({ message }) => message)).toEqual([
    'Task "hello.export" declares maxDuration, which the inngest jobs backend (profile "default") does not enforce.',
    'Task "hello.export" declares maxElapsed, which the inngest jobs backend (profile "default") does not enforce.',
  ]);
  expect(reported[0]).toMatchObject({ file: "src/hello/tasks/export.task.ts" });
  expect(reported[0]!.suggestion).toContain("@relkit/local");
});

test("the check command prints the warnings of a check that passes", async () => {
  const root = await projectWithLimits({ from: "@relkit/inngest", call: "inngest()" });
  const stdout: string[] = [];
  const code = await runCli(["check", "--project-root", root], {
    io: { stdout: (line) => stdout.push(line), stderr: () => undefined },
    installSignalHandlers: false,
  });
  const text = stdout.join("\n");
  expect(code).toBe(0);
  expect(text).toContain(CODE);
  expect(text).toContain(
    'declares maxDuration, which the inngest jobs backend (profile "default")',
  );
  expect(text.trimEnd().split("\n").at(-1)).toStartWith("Checked ");
});

test("check does not warn on the local backend, which enforces both limits", async () => {
  const result = await check(
    await projectWithLimits({ from: "@relkit/local", call: "localJob()" }),
  );
  expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
  expect(result.diagnostics.map(({ code }) => code)).not.toContain(CODE);
});

test("the generated server logs each unenforced limit as a warning when it starts", () => {
  const entry = {
    taskId: "hello.export",
    option: "maxElapsed",
    backend: "inngest",
    profile: "default",
    message:
      'Task "hello.export" declares maxElapsed, which the inngest jobs backend (profile "default") does not enforce.',
  };
  const source = serverProviderSource([], [entry]);
  const start = source.indexOf("const unsupportedTaskOptions");
  const end = source.indexOf("const localDurableStateError");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  // The report runs once the jobs workers have started, never for an embedded handle.
  expect(source.slice(end)).toContain(
    "if (relkitMode.embedded !== true) reportUnsupportedTaskOptions();",
  );
  const written: Record<string, unknown>[] = [];
  const report = new Function(
    "writeRuntimeLog",
    "telemetry",
    "generationId",
    "graphHash",
    `${source.slice(start, end)}\nreturn reportUnsupportedTaskOptions;`,
  )(
    (record: Record<string, unknown>) => written.push(record),
    { collect: (record: unknown) => record },
    "generation-1",
    "sha256:graph",
  ) as () => void;
  report();
  expect(written).toHaveLength(1);
  expect(written[0]).toMatchObject({
    signal: "log",
    level: "warn",
    message: entry.message,
    fields: { code: CODE, task: "hello.export", option: "maxElapsed", backend: "inngest" },
  });
});
