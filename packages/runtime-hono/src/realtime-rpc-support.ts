import { ORPCError } from "@orpc/server";
import { canonicalJson } from "@relkit/contracts";
import type { ChannelDescriptorAny, RealtimeScope } from "@relkit/realtime";
import { validate, type StandardSchemaV1 } from "@relkit/schema";
import { createHash } from "node:crypto";
import { requireClientAuthorization } from "./client-authorization.js";
import { resolveClientIdentity } from "./client-identity.js";
import { getEntry, isRecord } from "./materialize-routes-utils.js";
import type { RouteMaterializationOptions } from "./materialize-routes.js";
import type { SubscribeInput } from "./realtime-rpc-support.types.js";
import type { RpcContext } from "./rpc.js";
export type { SubscribeInput } from "./realtime-rpc-support.types.js";

/** Resolves channel identity, partition, authorization and provider state for an observation.
 * @param input - Submitted operation input; validation and authorization occur before effects are admitted.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param options - Application dependencies and configuration for this domain.
 * @returns The authorized descriptor, validated params, provider, scoped identity and trusted context.
 */
export async function channelContext(
  input: SubscribeInput,
  context: RpcContext,
  options: RouteMaterializationOptions,
) {
  if (options.realtime === undefined || options.clientIdentity === undefined) {
    throw new Error("Realtime client runtime is unavailable.");
  }
  const node = options.plan.channels?.find((candidate) => candidate.id === input.channel);
  const descriptor = getEntry(options.manifest.channels ?? {}, input.channel);
  if (node === undefined || node.client === "internal" || !isChannel(descriptor)) {
    throw new ORPCError("NOT_FOUND", { message: "Channel resource was not found." });
  }
  const parsed = await validate(descriptor.params, input.params as never);
  if (!("value" in parsed)) {
    throw new ORPCError("BAD_REQUEST", { message: "Channel params validation failed." });
  }
  const identity = await resolveClientIdentity(
    options.clientIdentity,
    context.hono.req.raw,
    context.auth,
    true,
  );
  let trusted: unknown;
  if (descriptor.client !== undefined && "authorize" in descriptor.client) {
    trusted = await options.realtime.trustedContext?.({
      request: context.hono.req.raw,
      ...(context.auth === undefined ? {} : { auth: context.auth }),
    });
    await requireClientAuthorization(
      () => descriptor.client!.authorize!(parsed.value, trusted),
      "channel",
    );
  }
  const partition = `sha256:${createHash("sha256")
    .update(canonicalJson(parsed.value as never))
    .digest("hex")}`;
  const provider = await options.realtime.provider(node.profile);
  const scope: RealtimeScope = {
    ...identity,
    applicationId: options.realtime.applicationId,
    environment: options.realtime.environment,
    channelId: node.id,
    partition,
    profile: node.profile,
    policyEpoch: options.clientIdentity.publicFingerprint,
    providerEpoch: await provider.getEpoch(),
  };
  return {
    descriptor,
    params: parsed.value,
    provider,
    scope,
    trusted,
  };
}

/** Validates a public realtime payload against the declared Standard Schema.
 * @param schema - Foreign Standard Schema declaration used to validate public data.
 * @param value - Value inspected, validated or projected by this operation.
 * @returns The schema-validated value, rejecting when stored public data violates its schema.
 */
export async function validatePublicValue(
  schema: StandardSchemaV1,
  value: unknown,
): Promise<unknown> {
  const result = await validate(schema, value as never);
  if (!("value" in result)) throw new TypeError("Stored realtime value failed validation.");
  return result.value;
}

/** Recognizes a runtime channel descriptor with its declared event schemas.
 * @param value - Value inspected, validated or projected by this operation.
 * @returns Whether the inspected value satisfies the declared type guard.
 */
function isChannel(value: unknown): value is ChannelDescriptorAny {
  return isRecord(value) && value.kind === "channel" && isSchema(value.params);
}

/** Recognizes the Standard Schema contract required by runtime validation.
 * @param value - Value inspected, validated or projected by this operation.
 * @returns Whether the inspected value satisfies the declared type guard.
 */
function isSchema(value: unknown): value is StandardSchemaV1 {
  return isRecord(value) && isRecord(value["~standard"]) && value["~standard"].version === 1;
}
