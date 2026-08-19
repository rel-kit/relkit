import { canonicalJson, deepFreeze, normalizeId, type JsonValue } from "@zsys/contracts";
export const MODEL_PROVIDER_PROTOCOL = "zsys.model-provider" as const;
export const MODEL_PROVIDER_VERSION = 1 as const;
/** A provider-neutral profile selected by an agent descriptor. */
export type LogicalModelProfile = string;
export type ModelProfile = LogicalModelProfile;
export type ModelRole = "system" | "user" | "assistant" | "tool";
export interface ModelMessage {
  readonly role: ModelRole;
  readonly content: JsonValue;
  readonly toolCallId?: string;
}
export interface ModelToolDefinition {
  readonly id: string;
  readonly description: string;
  /** JSON-safe input schema projected from the tool's target function. */
  readonly input: JsonValue;
}
export interface ModelRequest {
  readonly profile: LogicalModelProfile;
  readonly messages: readonly ModelMessage[];
  readonly tools: readonly ModelToolDefinition[];
  readonly inputBytes: number;
  readonly maxOutputBytes: number;
  readonly signal?: AbortSignal;
}
export interface CreateModelRequestOptions {
  readonly profile: unknown;
  readonly messages: readonly ModelMessage[];
  readonly tools?: readonly ModelToolDefinition[];
  readonly maxInputBytes: number;
  readonly maxOutputBytes: number;
  readonly signal?: AbortSignal;
}
export interface ModelCapabilities {
  readonly toolCalls: boolean;
  readonly cancellation: boolean;
  readonly maxInputBytes: number;
  readonly maxOutputBytes: number;
}
export type ModelTurn =
  | {
      readonly type: "tool-call";
      readonly callId: string;
      readonly toolId: string;
      readonly input: JsonValue;
    }
  | { readonly type: "final"; readonly output: JsonValue }
  | { readonly type: "error"; readonly code: string; readonly message: string }
  | { readonly type: "cancelled"; readonly reason?: string };
/** The only runtime seam provider implementations need to satisfy. */
export interface ModelProvider {
  readonly profile: LogicalModelProfile;
  readonly capabilities: ModelCapabilities;
  readonly request: (request: ModelRequest) => Promise<ModelTurn>;
}
export class ModelContractError extends TypeError {
  readonly code = "ZSYS_MODEL_CONTRACT_INVALID" as const;

  constructor(message: string) {
    super(message);
    this.name = "ModelContractError";
  }
}
export function normalizeModelProfile(value: unknown): LogicalModelProfile {
  try {
    return normalizeId(value);
  } catch {
    throw new ModelContractError("Model profile must be a stable logical ID");
  }
}
export function createModelCapabilities(options: ModelCapabilities): ModelCapabilities {
  return Object.freeze({
    toolCalls: booleanValue(options.toolCalls, "toolCalls"),
    cancellation: booleanValue(options.cancellation, "cancellation"),
    maxInputBytes: positiveBytes(options.maxInputBytes, "maxInputBytes"),
    maxOutputBytes: positiveBytes(options.maxOutputBytes, "maxOutputBytes"),
  });
}
export function createModelRequest(options: CreateModelRequestOptions): ModelRequest {
  const profile = normalizeModelProfile(options.profile);
  const messages = copyMessages(options.messages);
  const tools = copyTools(options.tools ?? []);
  const maxInputBytes = positiveBytes(options.maxInputBytes, "maxInputBytes");
  const maxOutputBytes = positiveBytes(options.maxOutputBytes, "maxOutputBytes");
  const inputBytes = byteLength({ messages, tools });
  if (inputBytes > maxInputBytes) {
    throw new ModelContractError(`Model request exceeds ${maxInputBytes} input bytes`);
  }
  return Object.freeze({
    profile,
    messages,
    tools,
    inputBytes,
    maxOutputBytes,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
}
/** Validates one provider turn and rejects unbounded model content. */
export function createModelTurn(value: unknown, maxOutputBytes: number): ModelTurn {
  const limit = positiveBytes(maxOutputBytes, "maxOutputBytes");
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new ModelContractError("Model turn must have a valid type");
  }
  if (value.type === "tool-call") {
    return Object.freeze({
      type: value.type,
      callId: stableText(value.callId, "tool call ID"),
      toolId: normalizeModelProfile(value.toolId),
      input: boundedJson(value.input, limit, "tool input"),
    });
  }
  if (value.type === "final") {
    return Object.freeze({ type: value.type, output: boundedJson(value.output, limit, "output") });
  }
  if (value.type === "error") {
    return Object.freeze({
      type: value.type,
      code: stableText(value.code, "error code"),
      message: boundedText(value.message, limit, "error message"),
    });
  }
  if (value.type === "cancelled") {
    return Object.freeze({
      type: value.type,
      ...(value.reason === undefined ? {} : { reason: boundedText(value.reason, limit, "reason") }),
    });
  }
  throw new ModelContractError(`Unsupported model turn type "${value.type}"`);
}
function copyMessages(value: readonly ModelMessage[]): readonly ModelMessage[] {
  if (!Array.isArray(value)) throw new ModelContractError("Model messages must be an array");
  return Object.freeze(
    value.map((entry, index) => {
      if (!isRecord(entry) || !isRole(entry.role)) {
        throw new ModelContractError(`Model message ${index} is invalid`);
      }
      return Object.freeze({
        role: entry.role,
        content: boundedJson(entry.content, Number.MAX_SAFE_INTEGER, `message ${index}`),
        ...(entry.toolCallId === undefined
          ? {}
          : { toolCallId: stableText(entry.toolCallId, "tool call ID") }),
      });
    }),
  );
}
function copyTools(value: readonly ModelToolDefinition[]): readonly ModelToolDefinition[] {
  if (!Array.isArray(value)) throw new ModelContractError("Model tools must be an array");
  return Object.freeze(
    value.map((entry, index) => {
      if (!isRecord(entry)) throw new ModelContractError(`Model tool ${index} is invalid`);
      return Object.freeze({
        id: normalizeModelProfile(entry.id),
        description: stableText(entry.description, "tool description"),
        input: boundedJson(entry.input, Number.MAX_SAFE_INTEGER, `tool ${index} input`),
      });
    }),
  );
}
function boundedJson(value: unknown, maxBytes: number, label: string): JsonValue {
  const serialized = canonicalJson(value);
  if (byteLength(serialized) > maxBytes) {
    throw new ModelContractError(`${label} exceeds ${maxBytes} bytes`);
  }
  return deepFreeze(JSON.parse(serialized) as JsonValue);
}
function boundedText(value: unknown, maxBytes: number, label: string): string {
  if (typeof value !== "string") throw new ModelContractError(`${label} must be text`);
  if (byteLength(value) > maxBytes)
    throw new ModelContractError(`${label} exceeds ${maxBytes} bytes`);
  return value;
}
function stableText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ModelContractError(`${label} must be non-empty text`);
  }
  return value.trim();
}
function positiveBytes(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new ModelContractError(`${label} must be a positive safe integer`);
  }
  return value as number;
}
function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new ModelContractError(`${label} must be boolean`);
  return value;
}
function byteLength(value: unknown): number {
  return new TextEncoder().encode(typeof value === "string" ? value : canonicalJson(value))
    .byteLength;
}
function isRole(value: unknown): value is ModelRole {
  return value === "system" || value === "user" || value === "assistant" || value === "tool";
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
