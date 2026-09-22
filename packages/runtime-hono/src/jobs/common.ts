import type { StandardSchemaV1 } from "@relkit/schema";
import { assertJsonValue, isJsonValue } from "@relkit/contracts";
import type { JobClientOperation } from "@relkit/contracts/jobs";
import type { TaskJobNode } from "@relkit/graph";
import type { RouteMaterializationOptions } from "../materialize-routes.js";
import { assertExpectedIdentity, assertRpcSecurity } from "../rpc-identity.js";
import type { RpcContext } from "../rpc.js";
import { jobError } from "./support.js";
import { jobsRuntime, type JobsRpcRuntime } from "./types.js";

export const jobEnvelopeSchema: StandardSchemaV1 = {
  "~standard": {
    version: 1,
    vendor: "relkit-jobs-envelope",
    validate(value: unknown) {
      if (!isRecord(value)) return { issues: [{ message: "Job RPC input must be an object." }] };
      assertJsonValue(value);
      return { value };
    },
  },
};

export const jobItemSchema: StandardSchemaV1 = {
  "~standard": {
    version: 1,
    vendor: "relkit-jobs-frame",
    validate(value: unknown) {
      assertJsonValue(value);
      return { value };
    },
  },
};

export function configFor(options: RouteMaterializationOptions): JobsRpcRuntime {
  const config = jobsRuntime(options);
  if (config === undefined)
    throw jobError("RELKIT_JOB_RUN_NOT_FOUND", "Jobs runtime is unavailable.");
  return config;
}

export async function guardJobRequest(
  options: RouteMaterializationOptions,
  context: RpcContext,
  input: Record<string, unknown>,
  operation: JobClientOperation,
): Promise<void> {
  assertJobsNegotiation(options, context.hono.req.raw, context.rpcHeaders);
  if (options.clientIdentity !== undefined) {
    await assertExpectedIdentity(context, options.clientIdentity, expectedIdentity(input));
  }
  if (isMutation(operation) && options.transportSecurity !== undefined) {
    await assertRpcSecurity(context, options.transportSecurity);
  }
}

export function recordInput(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw jobError("RELKIT_JOB_ACCESS_DENIED", "Job request is invalid.");
  return value;
}

export function envelopeInput(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  const input = recordInput(value);
  const fields = new Set(allowed);
  if (Object.keys(input).some((key) => !fields.has(key))) {
    throw jobError("RELKIT_JOB_ACCESS_DENIED", "Job request contains an unsupported field.");
  }
  return input;
}

export function requiredText(value: unknown, name: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    new TextEncoder().encode(value).byteLength > 256
  ) {
    throw jobError("RELKIT_JOB_ACCESS_DENIED", `Job ${name} is invalid.`);
  }
  return value;
}

export function optionalText(value: unknown, name: string): string | undefined {
  return value === undefined ? undefined : requiredText(value, name);
}

export function optionalCursor(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    new TextEncoder().encode(value).byteLength > 4096
  ) {
    throw jobError("RELKIT_JOB_CURSOR_INVALID", `Job ${name} is invalid.`);
  }
  return value;
}

export function expectedIdentity(
  value: Record<string, unknown>,
): { readonly identityScope: string; readonly sessionEpoch: string } | undefined {
  if (value.expectedIdentity === undefined) return undefined;
  const identity = recordInput(value.expectedIdentity);
  if (Object.keys(identity).some((key) => key !== "identityScope" && key !== "sessionEpoch")) {
    throw jobError("RELKIT_JOB_ACCESS_DENIED", "Job identity metadata is invalid.");
  }
  return {
    identityScope: requiredText(identity.identityScope, "identity scope"),
    sessionEpoch: requiredText(identity.sessionEpoch, "session epoch"),
  };
}

export function operationOptions(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  const options = recordInput(value);
  for (const key of Object.keys(options)) {
    if (!["operationId", "idempotencyKey", "delay", "at", "tags", "correlationId"].includes(key)) {
      throw jobError(
        "RELKIT_JOB_ACCESS_DENIED",
        "Job trigger options contain an unsupported field.",
      );
    }
  }
  return options;
}

export function isMutation(operation: JobClientOperation): boolean {
  return operation === "trigger" || operation === "cancel" || operation === "retry";
}

export function assertJobsNegotiation(
  options: RouteMaterializationOptions,
  request: Request,
  rpcHeaders?: Readonly<Record<string, string | string[] | undefined>>,
): void {
  const config = jobsRuntime(options);
  const version =
    request.headers.get("x-relkit-jobs-protocol") ?? header(rpcHeaders, "x-relkit-jobs-protocol");
  if (version !== null && version !== String(config?.protocolVersion ?? 1)) {
    throw jobError("RELKIT_JOB_PROTOCOL_UNSUPPORTED", "The jobs protocol version is unsupported.");
  }
  const fingerprint =
    request.headers.get("x-relkit-public-fingerprint") ??
    header(rpcHeaders, "x-relkit-public-fingerprint");
  if (
    fingerprint !== null &&
    config?.publicFingerprint !== undefined &&
    fingerprint !== config.publicFingerprint
  ) {
    throw jobError("RELKIT_JOB_PUBLIC_CONTRACT_STALE", "The public job contract is stale.");
  }
}

function header(
  headers: Readonly<Record<string, string | string[] | undefined>> | undefined,
  name: string,
): string | null {
  if (headers === undefined) return null;
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  if (entry === undefined) return null;
  return Array.isArray(entry[1]) ? (entry[1][0] ?? null) : (entry[1] ?? null);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
