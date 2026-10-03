import { Context, Effect, Layer } from "effect";
import { httpBoundary, HttpBoundaryError, observeHttp, runHttp } from "./http-effect.js";
import type { AgentInput } from "./agent-rpc-support.types.js";

import type { AgentRequestScope } from "@relkit/agents";
import { validate, type StandardSchemaV1 } from "@relkit/schema";
import { resolveClientIdentity } from "./client-identity.js";
import type { RouteMaterializationOptions } from "./materialize-routes.js";
import { getEntry, isRecord } from "./materialize-routes-utils.js";
import type { RpcContext } from "./rpc.js";
import { ORPCError } from "@orpc/server";
import { requireClientAuthorization } from "./client-authorization.js";
import { digest, isAgent } from "./agent-request-validation.js";
export {
  requireAgentThreadId,
  agentLimits,
  digest,
  verifiedAgentRequestDigest,
  encodedBytes,
  agentOwner,
} from "./agent-request-validation.js";
export type { AgentInput } from "./agent-rpc-support.types.js";

/** Resolves the current principal, authorization and durable provider scope for an agent operation.
 * @param input - Submitted operation input; validation and authorization occur before effects are admitted.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param options - Application dependencies and configuration for this domain.
 * @param operation - Bounded domain operation or public capability name.
 * @returns The authorized agent descriptor, plan node, provider, durable scope and trusted context.
 */
const agentContextEffect = Effect.fn("AgentAccess.agentContext")(function* (
  input: AgentInput,
  context: RpcContext,
  options: RouteMaterializationOptions,
  operation: string,
) {
  if (options.agentRuntime === undefined || options.clientIdentity === undefined)
    return yield* Effect.fail(
      new HttpBoundaryError({
        operation: "agent.agentContext",
        cause: new Error("Agent client runtime is unavailable."),
      }),
    );
  const { agentRuntime, clientIdentity } = options;
  const node = options.plan.agents.find((candidate) => candidate.id === input.agentId);
  const descriptor = getEntry(options.manifest.agents ?? {}, input.agentId);
  if (node === undefined || node.client === undefined || !isAgent(descriptor))
    return yield* Effect.fail(
      new HttpBoundaryError({
        operation: "agent.agentContext",
        cause: new ORPCError("NOT_FOUND", { message: "Agent resource was not found." }),
      }),
    );
  const identity = yield* httpBoundary("agent.agentContext", () =>
    Promise.resolve(
      resolveClientIdentity(clientIdentity, context.hono.req.raw, context.auth, true),
    ),
  );
  const trusted = yield* httpBoundary("agent.agentContext", () =>
    Promise.resolve(
      agentRuntime.trustedContext?.({
        request: context.hono.req.raw,
        ...(context.auth === undefined ? {} : { auth: context.auth }),
      }),
    ),
  );
  const authorize = isRecord(descriptor.client) ? descriptor.client.authorize : undefined;
  if (typeof authorize === "function") {
    yield* httpBoundary("agent.agentContext", () =>
      Promise.resolve(
        requireClientAuthorization(
          () =>
            authorize(
              {
                agentId: input.agentId,
                threadId: input.threadId,
                runId: input.runId,
                operation,
                input: input.payload,
              },
              trusted,
            ),
          "agent",
        ),
      ),
    );
  }
  const profile = node.stateProfile ?? "default";
  const provider = yield* httpBoundary("agent.agentContext", () =>
    Promise.resolve(agentRuntime.provider(profile)),
  );
  const scope: AgentRequestScope = {
    ...identity,
    applicationId: options.agentRuntime.applicationId,
    environment: options.agentRuntime.environment,
    profile,
    providerEpoch: yield* httpBoundary("agent.agentContext", () =>
      Promise.resolve(provider.getEpoch()),
    ),
    agentId: input.agentId,
    ownerScope: identity.identityScope,
    authorizationGrantId: digest({ identity, agentId: input.agentId }),
  };
  return { descriptor, node, provider, scope, trusted };
});

/** Executes agentContext at the native Promise boundary.
 * @param input - Submitted operation input; validation and authorization occur before effects are admitted.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param options - Application dependencies and configuration for this domain.
 * @param operation - Bounded domain operation or public capability name.
 * @returns The authorized agent descriptor, plan node, provider, durable scope and trusted context.
 */
export function agentContext(
  input: AgentInput,
  context: RpcContext,
  options: RouteMaterializationOptions,
  operation: string,
) {
  return runHttp(
    Effect.gen(function* () {
      const service = yield* AgentAccess;
      return yield* service.agentContext(input, context, options, operation);
    }).pipe(Effect.provide(AgentAccessLive)),
  );
}

/** Validates foreign Standard Schema input and preserves its public failure contract.
 * @param schema - Foreign Standard Schema declaration used to validate public data.
 * @param value - Value inspected, validated or projected by this operation.
 * @returns The value accepted by the declared Standard Schema; invalid values fail validation.
 */
const validateAgentValueEffect = Effect.fn("AgentAccess.validateAgentValue")(function* (
  schema: StandardSchemaV1,
  value: unknown,
) {
  const result = yield* httpBoundary("agent.validateAgentValue", () =>
    Promise.resolve(validate(schema, value as never)),
  );
  if (!("value" in result))
    return yield* Effect.fail(
      new HttpBoundaryError({
        operation: "agent.validateAgentValue",
        cause: new TypeError("Agent value validation failed."),
      }),
    );
  return result.value;
});

/** Executes validateAgentValue at the native Promise boundary.
 * @param schema - Foreign Standard Schema declaration used to validate public data.
 * @param value - Value inspected, validated or projected by this operation.
 * @returns The value accepted by the declared Standard Schema; invalid values fail validation.
 */
export function validateAgentValue(schema: StandardSchemaV1, value: unknown) {
  return runHttp(
    Effect.gen(function* () {
      const service = yield* AgentAccess;
      return yield* service.validateAgentValue(schema, value);
    }).pipe(Effect.provide(AgentAccessLive)),
  );
}

/** Validates agent input with the declared chat-message fallback.
 * @param resolved - Authorized agent descriptor, provider and durable request scope.
 * @param payload - Untrusted public payload validated before application use.
 * @returns Validated input, with a message-field fallback only for declared string chat input.
 */
export async function validateAgentInput(
  resolved: Awaited<ReturnType<typeof agentContext>>,
  payload: unknown,
): Promise<unknown> {
  try {
    return await validateAgentValue(resolved.descriptor.input, payload);
  } catch (error) {
    if (resolved.descriptor.chat?.input !== "message" || typeof payload !== "string") throw error;
    return validateAgentValue(resolved.descriptor.input, { message: payload });
  }
}

/** Lazy agent domain workflows with typed native failures. */
export class AgentAccess extends Context.Service<
  AgentAccess,
  {
    readonly agentContext: typeof agentContextEffect;
    readonly validateAgentValue: typeof validateAgentValueEffect;
  }
>()("@relkit/runtime-hono/AgentAccess") {}

/** Live operations; tests can replace the same contract. */
export const AgentAccessLive = Layer.succeed(AgentAccess, {
  agentContext: (...args) => observeHttp("agent.agentContext", agentContextEffect(...args)),
  validateAgentValue: (...args) =>
    observeHttp("agent.validateAgentValue", validateAgentValueEffect(...args)),
});
