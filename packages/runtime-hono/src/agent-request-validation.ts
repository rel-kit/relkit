import { Schema } from "effect";

import type { AgentInput } from "./agent-rpc-support.types.js";
import { AgentThreadId } from "./agent-rpc-support.schemas.js";
import { createHash } from "node:crypto";
import {
  AGENT_STATE_SCHEMA_VERSION,
  AGENT_STREAM_VERSION,
  canonicalJson,
  REALTIME_RUNTIME_LIMITS,
} from "@relkit/contracts";
import type { AgentStateLimits, RunOwner } from "@relkit/agents";
import { type StandardSchemaV1 } from "@relkit/schema";

import type { RouteMaterializationOptions } from "./materialize-routes.js";
import { isRecord } from "./materialize-routes-utils.js";

/** Validates a nonempty thread identifier without silently trimming its identity.
 * @param value - Value inspected, validated or projected by this operation.
 * @returns The original nonempty thread identifier with no surrounding whitespace.
 */
export function requireAgentThreadId(value: unknown): string {
  if (!Schema.is(AgentThreadId)(value)) {
    throw new TypeError("threadId must be a non-empty string without surrounding whitespace.");
  }
  return value;
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

/** Computes the canonical digest used for idempotency and durable admission fencing.
 * @param value - Value inspected, validated or projected by this operation.
 * @returns The canonical JSON SHA-256 digest with its sha256 prefix.
 */
export function digest(value: unknown): string {
  return `sha256:${createHash("sha256")
    .update(canonicalJson(value as never))
    .digest("hex")}`;
}

/** Checks a supplied semantic digest against the submitted agent payload.
 * @param input - Submitted operation input; validation and authorization occur before effects are admitted.
 * @returns The computed digest, throwing when a supplied digest disagrees with the payload.
 */
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

/** Measures the UTF-8 byte size used by transport or journal limits.
 * @param value - Value inspected, validated or projected by this operation.
 * @returns The UTF-8 byte length of the JSON encoding.
 */
export function encodedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

/** Builds the generation identity required by durable agent admission.
 * @param options - Application dependencies and configuration for this domain.
 * @param profile - Configured provider profile used to select durable state.
 * @returns The generation, protocol, schema and provider-scope ownership descriptor.
 */
export function agentOwner(options: RouteMaterializationOptions, profile: string): RunOwner {
  return {
    generationId: options.agentRuntime!.generationId,
    publicFingerprint: options.agentRuntime!.publicFingerprint,
    protocolVersion: AGENT_STREAM_VERSION,
    schemaVersion: AGENT_STATE_SCHEMA_VERSION,
    providerScope: profile,
  };
}

/** Recognizes the runtime agent descriptor and its required input/output schemas.
 * @param value - Value inspected, validated or projected by this operation.
 * @returns Whether the inspected value satisfies the declared type guard.
 */
export function isAgent(value: unknown): value is {
  readonly input: StandardSchemaV1;
  readonly output: StandardSchemaV1;
  readonly client?: unknown;
  readonly chat?: { readonly input?: unknown; readonly output?: unknown };
} {
  return isRecord(value) && isSchema(value.input) && isSchema(value.output);
}

/** Recognizes the Standard Schema contract required by runtime validation.
 * @param value - Value inspected, validated or projected by this operation.
 * @returns Whether the inspected value satisfies the declared type guard.
 */
export function isSchema(value: unknown): value is StandardSchemaV1 {
  return isRecord(value) && isRecord(value["~standard"]) && value["~standard"].version === 1;
}
