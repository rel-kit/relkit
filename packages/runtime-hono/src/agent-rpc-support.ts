import { createHash } from "node:crypto";
import {
  AGENT_STATE_SCHEMA_VERSION,
  AGENT_STREAM_VERSION,
  canonicalJson,
  REALTIME_RUNTIME_LIMITS,
  type OperationId,
} from "@relkit/contracts";
import type { AgentRequestScope, AgentStateLimits, RunOwner } from "@relkit/agents";
import { validate, type StandardSchemaV1 } from "@relkit/schema";
import { resolveClientIdentity } from "./client-identity.js";
import type { RouteMaterializationOptions } from "./materialize-routes.js";
import { getEntry, isRecord } from "./materialize-routes-utils.js";
import type { RpcContext } from "./rpc.js";
import { ORPCError } from "@orpc/server";
import { requireClientAuthorization } from "./client-authorization.js";

export interface AgentInput {
  readonly agentId: string;
  readonly expectedIdentity?: import("@relkit/contracts").ExpectedClientIdentity;
  readonly threadId?: string;
  readonly resume?: boolean;
  readonly waitingRevision?: string;
  readonly runId?: string;
  readonly operationId?: OperationId;
  readonly kind?: string;
  readonly payload?: unknown;
  readonly after?: unknown;
  readonly requestDigest?: string;
  readonly snapshotId?: string;
  readonly cursor?: string;
}

export function requireAgentThreadId(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    throw new TypeError("threadId must be a non-empty string without surrounding whitespace.");
  }
  return value;
}

export async function agentContext(
  input: AgentInput,
  context: RpcContext,
  options: RouteMaterializationOptions,
  operation: string,
) {
  if (options.agentRuntime === undefined || options.clientIdentity === undefined)
    throw new Error("Agent client runtime is unavailable.");
  const node = options.plan.agents.find((candidate) => candidate.id === input.agentId);
  const descriptor = getEntry(options.manifest.agents ?? {}, input.agentId);
  if (node === undefined || node.client === undefined || !isAgent(descriptor))
    throw new ORPCError("NOT_FOUND", { message: "Agent resource was not found." });
  const identity = await resolveClientIdentity(
    options.clientIdentity,
    context.hono.req.raw,
    context.auth,
    true,
  );
  const trusted = await options.agentRuntime.trustedContext?.({
    request: context.hono.req.raw,
    ...(context.auth === undefined ? {} : { auth: context.auth }),
  });
  const authorize = isRecord(descriptor.client) ? descriptor.client.authorize : undefined;
  if (typeof authorize === "function") {
    await requireClientAuthorization(
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
    );
  }
  const profile = node.stateProfile ?? "default";
  const provider = await options.agentRuntime.provider(profile);
  const scope: AgentRequestScope = {
    ...identity,
    applicationId: options.agentRuntime.applicationId,
    environment: options.agentRuntime.environment,
    profile,
    providerEpoch: await provider.getEpoch(),
    agentId: input.agentId,
    ownerScope: identity.identityScope,
    authorizationGrantId: digest({ identity, agentId: input.agentId }),
  };
  return { descriptor, node, provider, scope, trusted };
}

export async function validateAgentValue(schema: StandardSchemaV1, value: unknown) {
  const result = await validate(schema, value as never);
  if (!("value" in result)) throw new TypeError("Agent value validation failed.");
  return result.value;
}

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

export const agentLimits: AgentStateLimits = {
  maxSnapshotBytes: REALTIME_RUNTIME_LIMITS.initialSnapshotBytes,
  maxHistoryPageBytes: REALTIME_RUNTIME_LIMITS.snapshotHistoryPageBytes,
  maxJournalRecordBytes: REALTIME_RUNTIME_LIMITS.progressRecordBytes,
  maxJournalBytesPerThread: REALTIME_RUNTIME_LIMITS.journalBytesPerThread,
  maxStateBytesPerApplication: REALTIME_RUNTIME_LIMITS.agentStateBytes,
  maxThreadsPerPrincipal: REALTIME_RUNTIME_LIMITS.threadsPerPrincipal,
  maxActiveRunsPerPrincipal: REALTIME_RUNTIME_LIMITS.activeRunsPerPrincipal,
  maxActiveRunsPerApplication: REALTIME_RUNTIME_LIMITS.activeRunsPerApplication,
  terminalReserveBytes: REALTIME_RUNTIME_LIMITS.terminalReserveBytes,
  terminalReserveRecords: REALTIME_RUNTIME_LIMITS.terminalReserveRecords,
};

export function digest(value: unknown): string {
  return `sha256:${createHash("sha256")
    .update(canonicalJson(value as never))
    .digest("hex")}`;
}

export function verifiedAgentRequestDigest(input: AgentInput): string {
  const value =
    input.resume === true
      ? { payload: input.payload, waitingRevision: input.waitingRevision }
      : input.payload;
  const actual = digest(value);
  if (input.requestDigest !== undefined && input.requestDigest !== actual) {
    throw new TypeError("Agent request digest does not match its payload.");
  }
  return actual;
}

export function encodedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function agentOwner(options: RouteMaterializationOptions, profile: string): RunOwner {
  return {
    generationId: options.agentRuntime!.generationId,
    publicFingerprint: options.agentRuntime!.publicFingerprint,
    protocolVersion: AGENT_STREAM_VERSION,
    schemaVersion: AGENT_STATE_SCHEMA_VERSION,
    providerScope: profile,
  };
}

function isAgent(value: unknown): value is {
  readonly input: StandardSchemaV1;
  readonly output: StandardSchemaV1;
  readonly client?: unknown;
  readonly chat?: { readonly input?: unknown; readonly output?: unknown };
} {
  return isRecord(value) && isSchema(value.input) && isSchema(value.output);
}

function isSchema(value: unknown): value is StandardSchemaV1 {
  return isRecord(value) && isRecord(value["~standard"]) && value["~standard"].version === 1;
}
