import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import {
  StackNotFoundError,
  type PulumiCommand,
} from "../../packages/deploy-pulumi/node_modules/@pulumi/pulumi/automation/index.js";
import { createPulumiWorkspace } from "../../packages/deploy-pulumi/src/workspace.ts";
import { hashGraph, type ApplicationGraph } from "../../packages/graph/src/index.ts";
import { runDeploy } from "../../packages/cli/src/commands/deploy.ts";

const graph = JSON.parse(
  await readFile(
    join(import.meta.dir, "../compiler/fixtures/valid-minimal/expected.graph.json"),
    "utf8",
  ),
) as ApplicationGraph;

test("previews an isolated stack with redacted events, confirmation, and a no-op repeat", async () => {
  const root = await mkdtemp(join(tmpdir(), "zsys-preview-"));
  const stack = `preview-${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const state = createState(stack);
  try {
    const init = capture();
    const initialized = await runDeploy(
      ["init", "--project-root", root, "--stack", stack, "--backend", "local"],
      init.context,
      options(root, state),
    );
    expect(initialized, JSON.stringify(init.outputs)).toBe(0);

    const first = capture();
    const cloudBeforePreview = state.cloudMutations;
    const previewCode = await runDeploy(
      ["preview", "--project-root", root, "--stack", stack, "--backend", "local"],
      first.context,
      options(root, state),
    );
    expect(previewCode, JSON.stringify(first.outputs)).toBe(0);
    expect(state.backendKinds).toEqual(["local", "local"]);
    expect(state.previewCalls).toBe(1);
    expect(state.updateCalls).toBe(0);
    expect(state.cloudMutations).toBe(cloudBeforePreview);
    assertPreview(first.outputs.at(-1), 3, state.secret);
    const firstOutput = first.outputs.at(-1) as { reportPath: string; stack: string };
    expect(firstOutput.stack).toBe(stack);
    const reportBytes = await readFile(firstOutput.reportPath, "utf8");
    expect(reportBytes).toContain('"create":3');
    expect(reportBytes).not.toContain(state.secret);
    expect(JSON.stringify(first.logs)).not.toContain(state.secret);

    state.nextPreview = { delete: 1 };
    let confirmations = 0;
    const declined = capture();
    expect(
      await runDeploy(
        ["up", "--project-root", root, "--stack", stack, "--backend", "local"],
        declined.context,
        {
          ...options(root, state),
          confirm: async () => {
            confirmations += 1;
            return false;
          },
        },
      ),
    ).toBe(1);
    expect(confirmations).toBe(1);
    expect(state.updateCalls).toBe(0);
    expect((declined.outputs.at(-1) as { status?: string }).status).toBe("declined");

    expect(
      await runDeploy(
        ["up", "--project-root", root, "--stack", stack, "--backend", "local", "--non-interactive"],
        capture().context,
        options(root, state),
      ),
    ).toBe(0);
    expect(state.updateCalls).toBe(1);
    expect(state.cloudMutations).toBe(0);

    const second = capture();
    expect(
      await runDeploy(
        ["preview", "--project-root", root, "--stack", stack, "--backend", "local"],
        second.context,
        options(root, state),
      ),
    ).toBe(0);
    expect(state.previewCalls).toBe(4);
    assertPreview(second.outputs.at(-1), 0, state.secret, 3);
  } finally {
    await boundedRemove(root);
  }
});

interface PreviewState {
  readonly stack: string;
  readonly secret: string;
  readonly command: PulumiCommand;
  readonly backendKinds: string[];
  exists: boolean;
  previewCalls: number;
  updateCalls: number;
  cloudMutations: number;
  applied: boolean;
  nextPreview?: Record<string, number>;
}

function createState(stack: string): PreviewState {
  const state = {
    stack,
    secret: `preview-secret-${randomUUID()}`,
    backendKinds: [],
    previewCalls: 0,
    updateCalls: 0,
    cloudMutations: 0,
    applied: false,
    exists: false,
  } as PreviewState;
  const command = {
    command: "zsys-isolated-pulumi",
    version: { toString: () => "3.204.0" },
    run: async (
      args: string[],
      _cwd: string,
      _env: Record<string, string>,
      _onOutput: unknown,
      _onError: unknown,
      signal?: AbortSignal,
    ) => {
      if (signal?.aborted) throw signal.reason ?? new Error("preview interrupted");
      const operation = args[0];
      if (operation === "stack") return stackCommand(args, state);
      if (operation === "config") return result();
      if (operation === "preview") {
        state.previewCalls += 1;
        const summary = state.nextPreview ?? (state.applied ? { same: 3 } : { create: 3 });
        state.nextPreview = undefined;
        await emitEvents(args, summary, state.secret);
        return result();
      }
      if (operation === "up") {
        state.updateCalls += 1;
        state.applied = true;
        await emitEvents(args, { create: 3 }, state.secret);
        return result();
      }
      throw new Error(`unexpected Pulumi operation: ${operation}`);
    },
  } as unknown as PulumiCommand;
  (state as { command: PulumiCommand }).command = command;
  return state;
}

function stackCommand(args: readonly string[], state: PreviewState): Promise<CommandResult> {
  const subcommand = args[1];
  const stack = valueAfter(args, "--stack") ?? state.stack;
  if (subcommand === "select") {
    if (!state.exists || stack !== state.stack) throw missingStack(stack);
    return Promise.resolve(result());
  }
  if (subcommand === "init") {
    state.exists = true;
    return Promise.resolve(result());
  }
  if (subcommand === "output") return Promise.resolve({ ...result(), stdout: "{}" });
  if (subcommand === "history")
    return Promise.resolve({
      ...result(),
      stdout: state.applied
        ? JSON.stringify([{ resourceChanges: { create: 3 }, result: "succeeded" }])
        : "[]",
    });
  return Promise.resolve(result());
}

function missingStack(stack: string): StackNotFoundError {
  return new StackNotFoundError({ toString: () => `no stack named ${stack} found` } as never);
}

interface CommandResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number;
}

function result(): CommandResult {
  return { stdout: "", stderr: "", code: 0 };
}

async function emitEvents(
  args: readonly string[],
  resourceChanges: Record<string, number>,
  secret: string,
): Promise<void> {
  const path = valueAfter(args, "--event-log");
  if (path === undefined) return;
  await writeFile(
    path,
    `${JSON.stringify({ sequence: 1, timestamp: 1_700_000_000_000, diagnosticEvent: { message: `password=${secret}`, color: "", severity: "error" } })}\n${JSON.stringify({ sequence: 2, timestamp: 1_700_000_000_001, summaryEvent: { maybeCorrupt: false, durationSeconds: 0, resourceChanges, policyPacks: {} } })}\n`,
  );
  await new Promise((resolve) => setTimeout(resolve, 250));
}

function valueAfter(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index < 0 ? undefined : args[index + 1];
}

function options(root: string, state: PreviewState) {
  return {
    check: async () => ({
      ok: true,
      activatable: true,
      projectRoot: root,
      generatedDirectory: join(root, ".zsys", "generated"),
      graphHash: hashGraph(graph),
      diagnostics: [],
      outputs: {
        graph: JSON.stringify(graph),
        manifest: "",
        diagnostics: "[]",
        openapi: "",
        client: "",
      },
    }),
    build: async () => ({
      ok: true,
      projectRoot: root,
      buildDirectory: join(root, ".zsys", "build"),
      diagnostics: [],
      artifacts: [],
      graphHash: hashGraph(graph),
    }),
    createWorkspace: async (workspaceOptions: Parameters<typeof createPulumiWorkspace>[0]) => {
      state.backendKinds.push(workspaceOptions.backend?.kind ?? "cloud");
      return createPulumiWorkspace({ ...workspaceOptions, pulumiCommand: state.command });
    },
  };
}

function capture() {
  const outputs: unknown[] = [];
  const logs: unknown[] = [];
  return {
    outputs,
    logs,
    context: {
      json: true,
      reporter: {
        output: (value: unknown) => outputs.push(value),
        error: (code: string, message: string) => outputs.push({ code, message }),
      },
      log: (level: string, message: string, fields: unknown) =>
        logs.push({ level, message, fields }),
    },
  };
}

function assertPreview(value: unknown, create: number, secret: string, same = 0): void {
  const report = (
    value as {
      report: {
        summary: {
          resourceChanges: Record<string, number>;
          diagnostics: { error: number };
          logs: readonly unknown[];
        };
      };
    }
  ).report;
  expect(report.summary.resourceChanges.create ?? 0).toBe(create);
  expect(report.summary.resourceChanges.same ?? 0).toBe(same);
  expect(report.summary.diagnostics.error).toBe(1);
  expect(JSON.stringify(report.logs)).not.toContain(secret);
}

async function boundedRemove(path: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      rm(path, { recursive: true, force: true }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`cleanup timed out for ${path}`)), 2_000);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
