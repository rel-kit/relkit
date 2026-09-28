import type { StandardSchemaV1 } from "@relkit/schema";

/**
 * Durable control capabilities that may be exposed to an agent client.
 *
 * @example
 * const control: AgentControl = "stop";
 */
export type AgentControl = "steer" | "follow-up" | "stop" | "approve";

/**
 * Named public events and their Standard Schema validators.
 * Names must be nonempty before the policy is published.
 *
 * @example
 * import { z } from "@relkit/schema";
 * const events: AgentClientEvents = { completed: z.string() };
 */
export type AgentClientEvents = Readonly<Record<string, StandardSchemaV1>>;

/**
 * Client visibility, selected state, and public event schemas.
 * Exactly one of public access and an authorization guard must be supplied.
 *
 * @example
 * const policy: AgentClientPolicy = { public: true, state: ["answer"] };
 */
export type AgentClientPolicy<
  Guard = (...args: any[]) => unknown,
  StateKey extends string = string,
  Events extends AgentClientEvents = AgentClientEvents,
> = (
  | { readonly public: true; readonly authorize?: never }
  | { readonly authorize: Guard; readonly public?: never }
) & { readonly state?: readonly StateKey[]; readonly events?: Events };

/**
 * Fixed input and output field mapping for an agent chat client.
 *
 * @example
 * const chat: AgentChatMapping = { input: "message", output: "answer" };
 */
export interface AgentChatMapping {
  readonly input: "message";
  readonly output: "answer";
}
