import type { AgentRegistry } from "./registry.js";
import type { AgentSelector } from "./registry.types.js";

/**
 * Looks up one application-declared agent contract.
 * @typeParam Name - Declared registry key selecting the exact application contract.
 */
type AgentFor<Name extends AgentSelector> = AgentRegistry[Name];

/**
 * Infers the declared agent run input.
 * @typeParam Name - Declared registry key selecting the exact application contract.
 */
export type AgentInput<Name extends AgentSelector> =
  AgentFor<Name> extends { readonly input: infer Value } ? Value : never;

/**
 * Infers the declared terminal agent output.
 * @typeParam Name - Declared registry key selecting the exact application contract.
 */
export type AgentOutput<Name extends AgentSelector> =
  AgentFor<Name> extends { readonly output: infer Value } ? Value : never;

/**
 * Infers the declared agent control capabilities.
 * @typeParam Name - Declared registry key selecting the exact application contract.
 */
export type AgentControls<Name extends AgentSelector> =
  AgentFor<Name> extends { readonly controls: infer Value } ? Value : never;

/**
 * Infers whether the declared agent accepts chat send.
 * @typeParam Name - Declared registry key selecting the exact application contract.
 */
export type AgentChat<Name extends AgentSelector> =
  AgentFor<Name> extends { readonly chat: infer Value } ? Value : false;

/**
 * Infers the declared continuation input.
 * @typeParam Name - Declared registry key selecting the exact application contract.
 */
export type AgentResume<Name extends AgentSelector> =
  AgentFor<Name> extends { readonly resume: infer Value } ? Value : never;

/**
 * Infers the declared tool input and output contract.
 * @typeParam Name - Declared registry key selecting the exact application contract.
 */
export type AgentTool<Name extends AgentSelector> =
  AgentFor<Name> extends { readonly tool: infer Value } ? Value : never;

/**
 * Infers the public values projected into observed thread state.
 * @typeParam Name - Declared registry key selecting the exact application contract.
 */
export type AgentPublicState<Name extends AgentSelector> =
  AgentFor<Name> extends { readonly publicState: infer Value } ? Value : never;

/**
 * Infers the declared custom observation event payload.
 * @typeParam Name - Declared registry key selecting the exact application contract.
 */
export type AgentCustomEvent<Name extends AgentSelector> =
  AgentFor<Name> extends { readonly customEvent: infer Value } ? Value : never;

/**
 * Infers declared nested execution scope identities.
 * @typeParam Name - Declared registry key selecting the exact application contract.
 */
export type AgentScope<Name extends AgentSelector> =
  AgentFor<Name> extends { readonly scope: infer Value } ? Value : never;

/**
 * Infers supported waiting request payloads.
 * @typeParam Name - Declared registry key selecting the exact application contract.
 */
export type AgentWaiting<Name extends AgentSelector> =
  AgentFor<Name> extends { readonly waiting: infer Value } ? Value : never;
