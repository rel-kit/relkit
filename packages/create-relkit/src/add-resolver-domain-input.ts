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

import type { ServiceInclude } from "./add-types.js";
import { AddResolutionState, choices } from "./add-resolution-state.js";

/** Supported custom service inclusions in their established prompt order. */
const INCLUDES: readonly ServiceInclude[] = [
  "function",
  "error",
  "event",
  "event-function",
  "task",
  "job",
  "cache",
  "bucket",
  "tool",
  "prompt",
  "agent",
  "constants",
  "route",
];

/**
 * Resolves prompt text through explicit prompt and filesystem authority.
 * @param state - Invocation-owned state or a read-only planning snapshot.
 * @returns Completion after missing prompt text entries are recorded.
 */
export const promptTextEffect = Effect.fn("AddResolution.promptText")(
  function* (
    state: AddResolutionState,
  ): Effect.fn.Return<
    void,
    GeneratorDomainError | GeneratorIoError | GeneratorPromptError,
    GeneratorPrompt | GeneratorFileSystem
  > {
    const values: string[] = [];
    do {
      const value = yield* state.textEffect(
        values.length ? "Additional prompt text" : "Prompt text",
      );
      if (value) values.push(value);
    } while (
      values.length > 0 &&
      (yield* state.confirmEffect("Add another prompt segment?", false))
    );
    yield* state.repeatedEffect("text", values);
  },
  (effect) => observeExecution("generator", "add.resolve.promptText", scaffoldErrors(effect)),
);

/**
 * Resolves ensure name through explicit prompt and filesystem authority.
 * @param state - Invocation-owned state or a read-only planning snapshot.
 * @returns Completion after a missing artifact name is resolved and recorded.
 */
export const ensureNameEffect = Effect.fn("AddResolution.ensureName")(
  function* (
    state: AddResolutionState,
  ): Effect.fn.Return<
    void,
    GeneratorDomainError | GeneratorIoError | GeneratorPromptError,
    GeneratorPrompt | GeneratorFileSystem
  > {
    if (state.parsed.positional) return;
    const name = yield* state.textEffect(
      `${state.parsed.kind.replaceAll("-", " ")} name`,
      undefined,
      true,
    );
    if (name) yield* state.positionalEffect(name);
  },
  (effect) => observeExecution("generator", "add.resolve.ensureName", scaffoldErrors(effect)),
);

/**
 * Resolves service options through explicit prompt and filesystem authority.
 * @param state - Invocation-owned state or a read-only planning snapshot.
 * @returns Completion after the service preset or explicit includes are resolved.
 */
export const serviceOptionsEffect = Effect.fn("AddResolution.serviceOptions")(
  function* (
    state: AddResolutionState,
  ): Effect.fn.Return<
    void,
    GeneratorDomainError | GeneratorIoError | GeneratorPromptError,
    GeneratorPrompt | GeneratorFileSystem
  > {
    if (state.has("full") || state.has("include")) return;
    const mode = yield* state.selectEffect(
      "Service contents",
      [
        { value: "simple", label: "Simple", hint: "service.ts and one public function" },
        { value: "custom", label: "Custom", hint: "choose domain artifacts" },
        { value: "full", label: "Full", hint: "complete coherent domain example" },
      ],
      "simple",
    );
    if (mode === "full") yield* state.flagEffect("full");
    if (mode === "custom") {
      const selected = yield* state.multiselectEffect(
        "Select service artifacts",
        choices(INCLUDES),
        true,
      );
      if (selected) yield* state.repeatedEffect("include", selected);
    }
  },
  (effect) => observeExecution("generator", "add.resolve.serviceOptions", scaffoldErrors(effect)),
);

/**
 * Resolves visibility through explicit prompt and filesystem authority.
 * @param state - Invocation-owned state or a read-only planning snapshot.
 * @returns Completion after the artifact's public/internal choice is recorded.
 */
export const visibilityEffect = Effect.fn("AddResolution.visibility")(
  function* (
    state: AddResolutionState,
  ): Effect.fn.Return<
    void,
    GeneratorDomainError | GeneratorIoError | GeneratorPromptError,
    GeneratorPrompt | GeneratorFileSystem
  > {
    if (state.has("internal")) return;
    const exposed = yield* state.confirmEffect("Expose this artifact through the service?", true);
    if (exposed === false) yield* state.flagEffect("internal");
  },
  (effect) => observeExecution("generator", "add.resolve.visibility", scaffoldErrors(effect)),
);
