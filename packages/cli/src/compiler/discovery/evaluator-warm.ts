/**
 * Client of the warm development evaluator. Starts `evaluator-warm-child` on first use with
 * the request's allowlisted environment and the project root as working directory, sends
 * one request at a time over IPC and keeps the child for the next save. A child that
 * exceeds the evaluator deadline, exits, or is asked for a different root or environment
 * is stopped and replaced; the timed-out request answers with the one-shot evaluator's
 * timeout failure, so check diagnostics stay the same. A runtime without an evictable module
 * registry (Node) cannot keep modules between saves, so there every evaluation is one-shot.
 */
import { existsSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import { observeCompiler } from "../observability.js";
import { failedResponseEffect } from "./evaluator-response.js";
import { allowlistedEnvironment, createEvaluatorRequestEffect } from "./evaluator-request.js";
import { evaluateCandidatesEffect } from "./evaluator.js";
import { runtime, scriptCommand } from "../../runtime/index.js";
import type { RuntimeSubprocess } from "relkit/runtime";
import type { EvaluatorOptions } from "./evaluator-request.types.js";
import type {
  WarmEvaluation,
  WarmEvaluator,
  WarmEvaluatorReply,
  WarmEvaluatorRequest,
} from "./evaluator-warm.types.js";
export type { WarmEvaluation, WarmEvaluator } from "./evaluator-warm.types.js";

/** A running warm child and what it was started for. */
interface WarmChild {
  readonly process: RuntimeSubprocess;
  readonly key: string;
  readonly pending: Map<number, (reply: WarmEvaluatorReply) => void>;
}

/**
 * Creates a session-owned warm evaluator; no process starts until the first evaluation.
 * @returns Evaluation and close operations.
 */
export function createWarmEvaluator(): WarmEvaluator {
  if (runtime.modules.registry === undefined) return oneShotEvaluator();
  let child: WarmChild | undefined;
  let nextId = 0;
  const close = () => {
    child?.process.kill("SIGKILL");
    child = undefined;
  };
  const evaluate = Effect.fn("Discovery.evaluateWarmCandidates")(
    function* (options: EvaluatorOptions, invalidate: readonly string[]) {
      const request = yield* createEvaluatorRequestEffect(options).pipe(Effect.orDie);
      const key = `${request.projectRoot}\0${request.environmentAllowlist.join(",")}`;
      const full = child === undefined || child.key !== key || child.process.exitCode !== null;
      if (full) {
        close();
        child = spawnWarmChild(request.projectRoot, request.environmentAllowlist, key);
      }
      const owner = child!;
      nextId += 1;
      const message: WarmEvaluatorRequest = { id: nextId, request, invalidate, full };
      const reply = yield* Effect.callback<WarmEvaluatorReply | undefined>((resume) => {
        owner.pending.set(message.id, (value) => resume(Effect.succeed(value)));
        owner.process.send(message);
        return Effect.sync(() => owner.pending.delete(message.id));
      }).pipe(Effect.timeoutOption(request.timeoutMs));
      const value = reply._tag === "None" ? undefined : reply.value;
      if (value === undefined || "error" in value) {
        close();
        const response = yield* failedResponseEffect(request.generationId, request.sourceMaps, {
          code:
            reply._tag === "None" ? "RELKIT_EVALUATOR_TIMEOUT" : "RELKIT_EVALUATOR_PROCESS_FAILED",
          message: failureMessage(reply._tag === "None", value, request.timeoutMs),
          generationId: request.generationId,
        });
        return { response, reimported: [] } satisfies WarmEvaluation;
      }
      return { response: value.response, reimported: value.reimported };
    },
    (effect, options) =>
      observeCompiler("discovery", "evaluateCandidates", effect, () => ({
        files: options.candidates.length,
      })),
  );
  return { evaluate, close };
}

/**
 * Evaluates every request in a fresh one-shot child, reporting every candidate as re-imported.
 * @returns An evaluator with nothing to close.
 */
function oneShotEvaluator(): WarmEvaluator {
  return {
    evaluate: (options) =>
      evaluateCandidatesEffect(options).pipe(
        Effect.map((response) => ({
          response,
          reimported: options.candidates.map((candidate) =>
            relative(
              options.projectRoot,
              resolve(
                options.projectRoot,
                typeof candidate === "string" ? candidate : candidate.fileName,
              ),
            ).replaceAll("\\", "/"),
          ),
        })),
      ),
    close: () => undefined,
  };
}

/**
 * Describes why a warm evaluation produced no response.
 * @param timedOut - Whether the deadline elapsed.
 * @param reply - Error reply, if the child answered or exited.
 * @param timeoutMs - Evaluator deadline.
 * @returns Diagnostic message matching the one-shot evaluator's wording.
 */
function failureMessage(
  timedOut: boolean,
  reply: { readonly error: string } | undefined,
  timeoutMs: number,
): string {
  if (timedOut) return `Evaluator exceeded ${timeoutMs}ms and was killed.`;
  return reply?.error ?? "The warm evaluator exited.";
}

/**
 * Starts the warm child with the allowlisted environment.
 * @param projectRoot - Evaluator working directory.
 * @param allowlist - Environment names the child may read.
 * @param key - Identity of this configuration.
 * @returns The running child.
 */
function spawnWarmChild(projectRoot: string, allowlist: readonly string[], key: string): WarmChild {
  const pending = new Map<number, (reply: WarmEvaluatorReply) => void>();
  const process = runtime.processes.spawn(
    scriptCommand(childPath(), { bunFlags: ["--no-install"] }),
    {
      cwd: projectRoot,
      env: allowlistedEnvironment(allowlist),
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
      ipc: (message) => {
        const reply = message as WarmEvaluatorReply;
        pending.get(reply.id)?.(reply);
        pending.delete(reply.id);
      },
    },
  );
  // A crashed child settles every waiter instead of leaving it to the deadline.
  void process.exited.then(() => {
    for (const resolve of pending.values())
      resolve({ id: -1, error: "The warm evaluator exited." });
    pending.clear();
  });
  return { process, key, pending };
}

/**
 * Chooses the built warm-child entry or its source fallback.
 * @returns Absolute entry path.
 */
function childPath(): string {
  const compiled = fileURLToPath(new URL("./evaluator-warm-child.js", import.meta.url));
  return existsSync(compiled)
    ? compiled
    : fileURLToPath(new URL("./evaluator-warm-child.ts", import.meta.url));
}
