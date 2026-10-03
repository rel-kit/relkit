export { jobEnvelopeSchema, jobItemSchema } from "./common.schemas.js";
import type { JobClientOperation } from "@relkit/contracts/jobs";
import type { RouteMaterializationOptions } from "../materialize-routes.js";
import { assertExpectedIdentity, assertRpcSecurity } from "../rpc-identity.js";
import type { RpcContext } from "../rpc.js";
import { jobError } from "./support.js";
import { jobsRuntime, type JobsRpcRuntime } from "./types.js";

/** Require a configured jobs runtime before serving a job operation.
 * @param options - Runtime configuration and dependencies for this operation.
 * @returns The runtime configuration or a public job-not-found failure.
 */
export function configFor(options: RouteMaterializationOptions): JobsRpcRuntime {
  const config = jobsRuntime(options);
  if (config === undefined)
    throw jobError("RELKIT_JOB_RUN_NOT_FOUND", "Jobs runtime is unavailable.");
  return config;
}

/** Check jobs protocol, expected identity and mutation transport security.
 * @param options - Runtime configuration and dependencies for this operation.
 * @param context - Current Hono or RPC request context.
 * @param input - Public job request data.
 * @param operation - Public job client operation.
 * @returns Nothing after the request passes every applicable guard.
 */
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

/** Require an object envelope for a jobs RPC operation.
 * @param value - Value to validate or project.
 * @returns The input record or a public access-denied failure.
 */
export function recordInput(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw jobError("RELKIT_JOB_ACCESS_DENIED", "Job request is invalid.");
  return value;
}

/** Reject job envelope fields outside the operation's allowlist.
 * @param value - Value to validate or project.
 * @param allowed - Envelope field names accepted by this operation.
 * @returns The validated envelope record.
 */
export function envelopeInput(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  const input = recordInput(value);
  const fields = new Set(allowed);
  if (Object.keys(input).some((key) => !fields.has(key))) {
    throw jobError("RELKIT_JOB_ACCESS_DENIED", "Job request contains an unsupported field.");
  }
  return input;
}

/** Require nonempty job metadata bounded to 256 UTF-8 bytes.
 * @param value - Value to validate or project.
 * @param name - Field, job or stream name.
 * @returns The validated text or an access-denied failure.
 */
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

/** Validate bounded job metadata only when the caller supplies it.
 * @param value - Value to validate or project.
 * @param name - Field, job or stream name.
 * @returns The validated text or undefined.
 */
export function optionalText(value: unknown, name: string): string | undefined {
  return value === undefined ? undefined : requiredText(value, name);
}

/** Validate a nonempty cursor bounded to 4096 UTF-8 bytes.
 * @param value - Value to validate or project.
 * @param name - Field, job or stream name.
 * @returns The cursor text or undefined.
 */
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

/** Read bounded identity preconditions and reject unknown identity fields.
 * @param value - Value to validate or project.
 * @returns The expected identity scope/session epoch, or undefined.
 */
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

/** Restrict trigger options to the public submission fields.
 * @param value - Value to validate or project.
 * @returns The supported options record, defaulting to an empty object.
 */
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

/** Identify jobs operations that require mutation transport protection.
 * @param operation - Public job client operation.
 * @returns Whether the operation triggers, cancels or retries a run.
 */
export function isMutation(operation: JobClientOperation): boolean {
  return operation === "trigger" || operation === "cancel" || operation === "retry";
}

/** Check advertised jobs protocol and public contract fingerprint.
 * @param options - Runtime configuration and dependencies for this operation.
 * @param request - Incoming HTTP request.
 * @param rpcHeaders - Headers supplied through the RPC transport.
 * @returns Nothing when the advertised values match the runtime.
 */
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

/** Read a case-insensitive RPC header, selecting its first value.
 * @param headers - Response or request header values.
 * @param name - Field, job or stream name.
 * @returns The header text or null when absent.
 */
function header(
  headers: Readonly<Record<string, string | string[] | undefined>> | undefined,
  name: string,
): string | null {
  if (headers === undefined) return null;
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  if (entry === undefined) return null;
  return Array.isArray(entry[1]) ? (entry[1][0] ?? null) : (entry[1] ?? null);
}

/** Check whether a value is a non-null object suitable for field inspection.
 * @param value - Value to validate or project.
 * @returns Whether object fields can be inspected.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
