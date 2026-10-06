import { Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { GeneratorFileSystem } from "./generator-filesystem.js";
import { GeneratorPrompt } from "./generator-prompt.js";

import {
  scaffoldErrors,
  type GeneratorDomainError,
  type GeneratorIoError,
  type GeneratorPromptError,
} from "./generator-errors.js";

import { AddResolutionState, choices } from "./add-resolution-state.js";
import {
  artifactOptions,
  artifacts,
  profiles,
  selectedDomain,
} from "./add-resolution-discovery.js";
import type { ProjectDiscovery } from "./project-discovery-types.js";
/**
 * Resolves event function options through explicit prompt and filesystem authority.
 * @param state - Invocation-owned state or a read-only planning snapshot.
 * @param discovery - Declaration-only project facts.
 * @returns Completion after event target, delivery and provider choices are recorded.
 */
export const eventFunctionOptionsEffect = Effect.fn("AddResolution.eventFunctionOptions")(
  function* (
    state: AddResolutionState,
    discovery: ProjectDiscovery,
  ): Effect.fn.Return<
    void,
    GeneratorDomainError | GeneratorIoError | GeneratorPromptError,
    GeneratorPrompt | GeneratorFileSystem
  > {
    if (!state.has("event")) {
      const values = artifacts(discovery, selectedDomain(state, discovery), "event");
      if (!state.interactive && values.length === 1)
        yield* state.optionEffect("event", values[0]!.id ?? values[0]!.binding);
      else if (state.parsed.createService) {
        const value = yield* state.textEffect("Event name to create", "Example", true);
        if (value) yield* state.optionEffect("event", value);
      } else {
        const value = yield* state.selectEffect("Event to consume", artifactOptions(values));
        if (value) yield* state.optionEffect("event", value);
      }
    }
    if (!state.has("delivery")) {
      const delivery = yield* state.selectEffect(
        "Delivery mode",
        choices(["durable", "transient"]),
        "durable",
      );
      if (delivery) yield* state.optionEffect("delivery", delivery);
    }
    yield* providerProfileEffect(state, discovery, "event");
  },
  (effect) =>
    observeExecution("generator", "add.resolve.eventFunctionOptions", scaffoldErrors(effect)),
);

/**
 * Resolves task options through explicit prompt and filesystem authority.
 * @param state - Invocation-owned state or a read-only planning snapshot.
 * @returns Completion after task version and execution choices are recorded.
 */
export const taskOptionsEffect = Effect.fn("AddResolution.taskOptions")(
  function* (
    state: AddResolutionState,
  ): Effect.fn.Return<
    void,
    GeneratorDomainError | GeneratorIoError | GeneratorPromptError,
    GeneratorPrompt | GeneratorFileSystem
  > {
    if (!state.has("version")) yield* state.optionEffect("version", "1");
    if (!state.has("execution") && state.interactive) {
      const execution = yield* state.selectEffect(
        "Task execution",
        choices(["durable", "retryable"]),
        "durable",
      );
      if (execution) yield* state.optionEffect("execution", execution);
    }
  },
  (effect) => observeExecution("generator", "add.resolve.taskOptions", scaffoldErrors(effect)),
);

/**
 * Resolves job options through explicit prompt and filesystem authority.
 * @param state - Invocation-owned state or a read-only planning snapshot.
 * @param discovery - Declaration-only project facts.
 * @returns Completion after the target function/task and job provider are recorded.
 */
export const jobOptionsEffect = Effect.fn("AddResolution.jobOptions")(
  function* (
    state: AddResolutionState,
    discovery: ProjectDiscovery,
  ): Effect.fn.Return<
    void,
    GeneratorDomainError | GeneratorIoError | GeneratorPromptError,
    GeneratorPrompt | GeneratorFileSystem
  > {
    if (!state.has("target")) {
      const taskValues = artifacts(discovery, selectedDomain(state, discovery), "task");
      const values =
        taskValues.length > 0
          ? taskValues
          : artifacts(discovery, selectedDomain(state, discovery), "function");
      if (!state.interactive && values.length === 1)
        yield* state.optionEffect("target", values[0]!.id ?? values[0]!.binding);
      else if (state.parsed.createService) {
        const value = yield* state.textEffect("Callable function name to create", "Example", true);
        if (value) yield* state.optionEffect("target", value);
      } else {
        const value = yield* state.selectEffect(
          "Callable function target",
          artifactOptions(values),
        );
        if (value) yield* state.optionEffect("target", value);
      }
    }
    yield* providerProfileEffect(state, discovery, "job");
  },
  (effect) => observeExecution("generator", "add.resolve.jobOptions", scaffoldErrors(effect)),
);

/**
 * Resolves provider profile through explicit prompt and filesystem authority.
 * @param state - Invocation-owned state or a read-only planning snapshot.
 * @param discovery - Declaration-only project facts.
 * @param capability - Requested provider capability.
 * @returns Completion after the requested event/job provider profile is resolved.
 */
export const providerProfileEffect = Effect.fn("AddResolution.providerProfile")(
  function* (
    state: AddResolutionState,
    discovery: ProjectDiscovery,
    capability: "event" | "job",
  ): Effect.fn.Return<
    void,
    GeneratorDomainError | GeneratorIoError | GeneratorPromptError,
    GeneratorPrompt | GeneratorFileSystem
  > {
    if (state.has("profile") || !state.interactive) return;
    const existing = profiles(discovery, capability);
    const local = "__local__";
    const value = yield* state.selectEffect(`${capability} profile`, [
      ...existing.map((profile) => ({
        value: profile.name,
        label: profile.name,
        ...(profile.isDefault ? { hint: "configured default" } : {}),
      })),
      { value: local, label: "File-backed local", hint: "add @relkit/local" },
    ]);
    if (value) yield* state.optionEffect("profile", value === local ? "local" : value);
  },
  (effect) => observeExecution("generator", "add.resolve.providerProfile", scaffoldErrors(effect)),
);
