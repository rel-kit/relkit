import type { AgentRegistry, AgentSelector } from "./registry.js";

type AgentFor<Name extends AgentSelector> = AgentRegistry[Name];
export type AgentInput<Name extends AgentSelector> =
  AgentFor<Name> extends { readonly input: infer Value } ? Value : never;
export type AgentOutput<Name extends AgentSelector> =
  AgentFor<Name> extends { readonly output: infer Value } ? Value : never;
export type AgentControls<Name extends AgentSelector> =
  AgentFor<Name> extends { readonly controls: infer Value } ? Value : never;
export type AgentChat<Name extends AgentSelector> =
  AgentFor<Name> extends { readonly chat: infer Value } ? Value : false;
export type AgentResume<Name extends AgentSelector> =
  AgentFor<Name> extends { readonly resume: infer Value } ? Value : never;
export type AgentTool<Name extends AgentSelector> =
  AgentFor<Name> extends { readonly tool: infer Value } ? Value : never;
export type AgentPublicState<Name extends AgentSelector> =
  AgentFor<Name> extends { readonly publicState: infer Value } ? Value : never;
export type AgentCustomEvent<Name extends AgentSelector> =
  AgentFor<Name> extends { readonly customEvent: infer Value } ? Value : never;
export type AgentScope<Name extends AgentSelector> =
  AgentFor<Name> extends { readonly scope: infer Value } ? Value : never;
export type AgentWaiting<Name extends AgentSelector> =
  AgentFor<Name> extends { readonly waiting: infer Value } ? Value : never;
