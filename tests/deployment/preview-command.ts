/** Simulates only the existing Pulumi CLI-private command boundary and event stream; no cloud operation is performed. */
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import {
  StackNotFoundError,
  type PulumiCommand,
} from "../../packages/deploy-pulumi/node_modules/@pulumi/pulumi/automation/index.js";
/** Mutable observations and the exact native SDK-private stub retained by the preview case. */
export interface PreviewState {
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
interface CommandResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number;
}

/** @param stack - Exact isolated stack identity. @returns The original SDK-private command stub and mutable operation observations. */
export function createState(stack: string): PreviewState {
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
    command: "relkit-isolated-pulumi",
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

/** @param args - Original native command arguments. @param state - Shared simulated stack state. @returns Existing select/init/output/history command behavior. */
export function stackCommand(args: readonly string[], state: PreviewState): Promise<CommandResult> {
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

/** @param stack - Missing selected stack. @returns The original native SDK missing-stack error fixture. */
export function missingStack(stack: string): StackNotFoundError {
  return new StackNotFoundError({ toString: () => `no stack named ${stack} found` } as never);
}

/** @returns The original successful empty native command result. */
export function result(): CommandResult {
  return { stdout: "", stderr: "", code: 0 };
}

/** @param args - Native command arguments containing the event-log path. @param resourceChanges - Original preview/update summary. @param secret - Synthetic secret whose redaction is asserted. @returns After writing both events and preserving the original 250ms delivery delay. */
export async function emitEvents(
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

/** @param args - Native command arguments. @param flag - Original value-taking flag. @returns Its following argument if present. */
export function valueAfter(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index < 0 ? undefined : args[index + 1];
}
