/**
 * Entry of the warm evaluator: one long-lived child per `relkit dev` session that keeps the
 * modules it evaluated. Each IPC request carries an ordinary evaluator request and the
 * files the caller knows changed (the changed sources and their descriptor dependents from
 * the compiler's watch dependency index). The child adds every loaded module whose file
 * changed on disk, evicts those modules and their importers from Bun's registry, imports
 * only the evicted candidates again under the request's generation URL, and reuses the
 * snapshot of every other candidate. Detectors wrap each import exactly as in the one-shot
 * child, and the child runs with the same allowlisted environment.
 */
import { relative, resolve } from "node:path";
import { Effect } from "effect";
import { createModuleReloader } from "relkit/host";
import { evaluatorResponse } from "./evaluator-child-framing.js";
import { evaluateCandidate } from "./evaluator-child.js";
import { decodeEvaluatorRequest } from "./evaluator-protocol.js";
import type { CandidateResult } from "./evaluator-child.types.js";
import type { EvaluatorFailure, EvaluatorModuleResult } from "./evaluator-protocol.types.js";
import type { WarmEvaluatorReply, WarmEvaluatorRequest } from "./evaluator-warm.types.js";

const reloader = createModuleReloader(process.cwd());
const results = new Map<string, CandidateResult>();

/**
 * Evaluates one request, re-importing only what changed.
 * @param message - Accepted IPC request.
 * @returns The reply with the response and the candidates imported again.
 */
const evaluate = Effect.fn("Discovery.evaluateWarm")(function* (message: WarmEvaluatorRequest) {
  const request = yield* decodeEvaluatorRequest(message.request);
  const root = resolve(request.projectRoot);
  if (message.full) results.clear();
  const changed = [...reloader.changed(), ...message.invalidate.map((file) => resolve(root, file))];
  const evicted = new Set(reloader.invalidate(changed));
  const reimported: string[] = [];
  const outcomes: CandidateResult[] = [];
  for (const candidate of request.candidates) {
    const file = resolve(root, candidate.file);
    const cached = results.get(file);
    if (cached !== undefined && !evicted.has(file) && cached.failure === undefined) {
      outcomes.push(withGeneration(cached, request.generationId));
      continue;
    }
    const result = yield* evaluateCandidate(candidate, request);
    results.set(file, result);
    reimported.push(relative(root, file).replaceAll("\\", "/"));
    outcomes.push(result);
  }
  reloader.record();
  const modules: EvaluatorModuleResult[] = [];
  const failures: EvaluatorFailure[] = [];
  for (const outcome of outcomes) {
    if (outcome.failure !== undefined) failures.push(outcome.failure);
    else if (outcome.module !== undefined) modules.push(outcome.module);
  }
  const response = yield* evaluatorResponse(request, modules, failures, "", "");
  return { id: message.id, response, reimported } satisfies WarmEvaluatorReply;
});

/**
 * Re-labels a reused snapshot with the current generation, which its references carry.
 * @param result - Snapshot from an earlier generation.
 * @param generationId - Current generation identity.
 * @returns The same snapshot addressed to the current generation.
 */
function withGeneration(result: CandidateResult, generationId: string): CandidateResult {
  if (result.module === undefined) return result;
  return {
    ...result,
    stdout: "",
    stderr: "",
    module: {
      ...result.module,
      manifestReferences: result.module.manifestReferences.map((reference) => ({
        ...reference,
        generationId,
      })),
    },
  };
}

process.on("message", (message: WarmEvaluatorRequest) => {
  void Effect.runPromise(evaluate(message)).then(
    (reply) => process.send?.(reply),
    (error) =>
      process.send?.({ id: message.id, error: String(error) } satisfies WarmEvaluatorReply),
  );
});
// The parent owns this child; losing the channel means the session is gone.
process.on("disconnect", () => process.exit(0));
