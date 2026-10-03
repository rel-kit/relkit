import type { TaskJobNode } from "@relkit/graph";
import {
  decodeJobWire,
  prepareCanonicalSubmission,
  submitPreparedSubmission,
  validateTaskInput,
} from "@relkit/jobs";
import { Effect } from "effect";
import { httpBoundary } from "../http-effect.js";
import type { RouteMaterializationOptions } from "../materialize-routes.js";
import type { RpcContext } from "../rpc.js";
import { assertGrantLive, authorizeJobOperation } from "./authorization.js";
import { configFor, envelopeInput, guardJobRequest, operationOptions } from "./common.js";
import { descriptorFor, runtimeFor, scopedRuntime, trustedScopeFor } from "./support.js";

/** Validates job input and admits a scoped run through the configured runtime.
 * @param options - Compiled route plan, manifest and jobs runtime configuration.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param job - Registered job declaration and its client operation policy.
 * @param value - Untrusted request envelope for this job operation.
 * @param signal - Cancellation signal inherited from the caller or owning scope.
 * @returns The accepted run handle after scoped authorization and submission.
 */
export const triggerJobEffect = Effect.fn("JobsMutations.triggerJob")(function* (
  options: RouteMaterializationOptions,
  context: RpcContext,
  job: TaskJobNode,
  value: unknown,
  signal?: AbortSignal,
) {
  const input = envelopeInput(value, ["input", "options", "expectedIdentity"]);
  yield* httpBoundary("jobs.triggerJob", () => guardJobRequest(options, context, input, "trigger"));
  const config = configFor(options);
  const descriptor = yield* httpBoundary("jobs.triggerJob", () => descriptorFor(config, job));
  const runtime = yield* httpBoundary("jobs.triggerJob", () => runtimeFor(config, job));
  const validated = yield* httpBoundary("jobs.triggerJob", () =>
    validateTaskInput(descriptor.task.input, input.input),
  );
  const canonicalInput = decodeJobWire(validated.wire);
  const trusted = yield* httpBoundary("jobs.triggerJob", () =>
    trustedScopeFor(config, context, job, "trigger", canonicalInput ?? null),
  );
  const admission = yield* httpBoundary("jobs.triggerJob", () =>
    prepareCanonicalSubmission(
      scopedRuntime(runtime, trusted.scope),
      descriptor.task,
      validated.wire,
      operationOptions(input.options),
      descriptor,
    ),
  );
  const authorized = yield* httpBoundary("jobs.triggerJob", () =>
    authorizeJobOperation(
      config,
      context,
      job,
      descriptor,
      "trigger",
      admission.input,
      undefined,
      signal,
    ),
  );
  const finalRuntime = scopedRuntime(runtime, authorized.grant.scope);
  const finalAdmission =
    authorized.grant.scope === trusted.scope
      ? admission
      : yield* httpBoundary("jobs.triggerJob", () =>
          prepareCanonicalSubmission(
            finalRuntime,
            descriptor.task,
            validated.wire,
            operationOptions(input.options),
            descriptor,
          ),
        );
  assertGrantLive(authorized.grant);
  return yield* httpBoundary("jobs.submit", () =>
    submitPreparedSubmission(finalRuntime, finalAdmission, signal),
  );
});
