import {
  createModelCapabilities,
  createModelTurn,
  normalizeModelProfile,
  type ModelProvider,
  type ModelRequest,
} from "@zsys/agents";
import { resolveValue, text } from "./config.js";

export interface OpenAiModelOptions {
  readonly profile: string;
  readonly apiKey?: unknown;
  readonly model?: unknown;
  readonly endpoint?: unknown;
  readonly values?: Readonly<Record<string, unknown>> | undefined;
  readonly fetch?: typeof globalThis.fetch | undefined;
  readonly maxInputBytes?: number;
  readonly maxOutputBytes?: number;
}

const DEFAULT_ENDPOINT = "https://api.openai.com/v1/chat/completions";

/** Small OpenAI-compatible adapter; prompt/result content never enters errors or telemetry. */
export function createOpenAiModelProvider(options: OpenAiModelOptions): ModelProvider {
  const profile = normalizeModelProfile(options.profile);
  const apiKey = text(resolveValue(options.apiKey, options.values), "OpenAI apiKey");
  const model = text(options.model, "OpenAI model") ?? "gpt-4o-mini";
  const endpoint = text(options.endpoint, "OpenAI endpoint") ?? DEFAULT_ENDPOINT;
  const parsed = new URL(endpoint);
  if (parsed.protocol !== "https:" && !isLocal(parsed.hostname))
    throw new TypeError("OpenAI endpoint must use HTTPS outside a local test host");
  const capabilities = createModelCapabilities({
    toolCalls: true,
    cancellation: true,
    maxInputBytes: options.maxInputBytes ?? 64 * 1024,
    maxOutputBytes: options.maxOutputBytes ?? 16 * 1024,
  });
  const request = async (value: ModelRequest) => {
    if (normalizeModelProfile(value.profile) !== profile)
      throw new Error(`Model profile ${profile} is not selected`);
    if (apiKey === undefined) throw new Error("OpenAI apiKey is not configured");
    const response = await (options.fetch ?? globalThis.fetch)(endpoint, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        messages: value.messages.map((message) => ({
          role: message.role,
          content: content(message.content),
        })),
        ...(value.tools.length === 0
          ? {}
          : {
              tools: value.tools.map((tool) => ({
                type: "function",
                function: { name: tool.id, description: tool.description, parameters: tool.input },
              })),
            }),
        max_tokens: Math.max(1, Math.floor(value.maxOutputBytes / 4)),
      }),
      ...(value.signal === undefined ? {} : { signal: value.signal }),
    });
    if (!response.ok) throw new Error(`OpenAI request failed with status ${response.status}`);
    return createModelTurn(toTurn(await response.json()), capabilities.maxOutputBytes);
  };
  return Object.freeze({ profile, capabilities, request });
}

function toTurn(value: unknown): unknown {
  const choice = record(value)?.choices;
  const message = Array.isArray(choice) ? record(choice[0])?.message : undefined;
  const calls = record(message)?.tool_calls;
  const call = Array.isArray(calls) ? record(calls[0]) : undefined;
  const functionValue = record(call?.function);
  if (call !== undefined && functionValue !== undefined)
    return {
      type: "tool-call",
      callId: text(call.id, "tool call ID") ?? crypto.randomUUID(),
      toolId: text(functionValue.name, "tool name") ?? "unknown",
      input: parseJson(functionValue.arguments),
    };
  return { type: "final", output: record(message)?.content ?? "" };
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value ?? {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function content(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function record(value: unknown): Record<string, any> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : undefined;
}

function isLocal(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".test")
  );
}
