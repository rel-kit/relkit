import { createHash } from "node:crypto";
import { canonicalJson } from "@relkit/contracts";
import type { ChannelDescriptorAny, ChannelCheckpoint, RealtimeScope } from "@relkit/realtime";
import { validate, type StandardSchemaV1 } from "@relkit/schema";
import type { RpcContext } from "./rpc.js";
import { resolveClientIdentity } from "./client-identity.js";
import type { RouteMaterializationOptions } from "./materialize-routes.js";
import { getEntry, isRecord } from "./materialize-routes-utils.js";
import { ORPCError } from "@orpc/server";
import { requireClientAuthorization } from "./client-authorization.js";

export interface SubscribeInput {
  readonly channel: string;
  readonly params: unknown;
  readonly after?: ChannelCheckpoint;
  readonly expectedIdentity?: import("@relkit/contracts").ExpectedClientIdentity;
}

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
  if (!("value" in parsed)) throw new TypeError("Channel params validation failed.");
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

export async function validatePublicValue(
  schema: StandardSchemaV1,
  value: unknown,
): Promise<unknown> {
  const result = await validate(schema, value as never);
  if (!("value" in result)) throw new TypeError("Stored realtime value failed validation.");
  return result.value;
}

function isChannel(value: unknown): value is ChannelDescriptorAny {
  return isRecord(value) && value.kind === "channel" && isSchema(value.params);
}

function isSchema(value: unknown): value is StandardSchemaV1 {
  return isRecord(value) && isRecord(value["~standard"]) && value["~standard"].version === 1;
}
