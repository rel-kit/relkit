export type AgentControl = "steer" | "follow-up" | "stop" | "approve";

export type AgentClientEvents = Readonly<Record<string, import("@relkit/schema").StandardSchemaV1>>;

export type AgentClientPolicy<
  Guard = (...args: any[]) => unknown,
  StateKey extends string = string,
  Events extends AgentClientEvents = AgentClientEvents,
> = (
  | { readonly public: true; readonly authorize?: never }
  | { readonly authorize: Guard; readonly public?: never }
) & { readonly state?: readonly StateKey[]; readonly events?: Events };

export interface AgentChatMapping {
  readonly input: "message";
  readonly output: "answer";
}

export function copyAgentClientPolicy<StateKey extends string>(
  value: unknown,
  allowedStateKeys: ReadonlySet<StateKey> = new Set(),
): AgentClientPolicy<(...args: any[]) => unknown, StateKey> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new TypeError("Agent client policy must be an object");
  const publicAccess = value.public === true;
  const authorize =
    typeof value.authorize === "function"
      ? (value.authorize as (...args: any[]) => unknown)
      : undefined;
  if (publicAccess === (authorize !== undefined)) {
    throw new TypeError("Agent client policy requires exactly one of public or authorize");
  }
  const state = copyStateKeys(value.state, allowedStateKeys);
  const events = copyEvents(value.events);
  return publicAccess
    ? Object.freeze({ public: true, ...(state === undefined ? {} : { state }), ...events })
    : Object.freeze({
        authorize: authorize!,
        ...(state === undefined ? {} : { state }),
        ...events,
      });
}

function copyEvents(value: unknown): { readonly events?: AgentClientEvents } {
  if (value === undefined) return {};
  if (!isRecord(value)) throw new TypeError("Agent client events must be an object");
  for (const [name, event] of Object.entries(value)) {
    if (name.trim() === "" || !isSchema(event)) {
      throw new TypeError(`Agent client event "${name}" must be a Standard Schema v1 validator`);
    }
  }
  return { events: Object.freeze({ ...value }) as AgentClientEvents };
}

function isSchema(value: unknown): boolean {
  return (
    isRecord(value) &&
    isRecord(value["~standard"]) &&
    value["~standard"].version === 1 &&
    typeof value["~standard"].validate === "function"
  );
}

function copyStateKeys<StateKey extends string>(
  value: unknown,
  allowed: ReadonlySet<StateKey>,
): readonly StateKey[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((key) => typeof key !== "string" || key.trim() === "")) {
    throw new TypeError("Agent client state must be an array of middleware state keys");
  }
  if (new Set(value).size !== value.length)
    throw new TypeError("Agent client state must be unique");
  for (const key of value) {
    if (!allowed.has(key)) throw new TypeError(`Agent client state key "${key}" is not declared`);
  }
  return Object.freeze([...value]) as readonly StateKey[];
}

export function copyAgentControls(value: unknown): readonly AgentControl[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new TypeError("Agent controls must be an array");
  const allowed = new Set<AgentControl>(["steer", "follow-up", "stop", "approve"]);
  if (!value.every((control): control is AgentControl => allowed.has(control as AgentControl))) {
    throw new TypeError("Agent controls contain an unsupported capability");
  }
  if (new Set(value).size !== value.length) throw new TypeError("Agent controls must be unique");
  return Object.freeze([...value]);
}

export function copyAgentChat(value: unknown): AgentChatMapping | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || value.input !== "message" || value.output !== "answer") {
    throw new TypeError('Agent chat mapping must be { input: "message", output: "answer" }');
  }
  return Object.freeze({ input: "message", output: "answer" });
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
