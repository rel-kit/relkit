import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import {
  normalizeModelSelectorValue,
  parseModelProviderConfigurationValue,
  resolveModelSelectorValue,
} from "./model-selection-core.js";
import {
  modelSelectionEffectError,
  type ModelSelectionEffectError,
} from "./model-selection-error.js";
import type {
  ModelProviderConfiguration,
  ResolvedModelSelection,
} from "./model-selection.types.js";

export { ModelSelectionError, ModelSelectionEffectError } from "./model-selection-error.js";
export type * from "./model-selection.types.js";

/** Normalizes an optional provider or provider:model selector.
 * @param value - Unknown selector input.
 * @returns An Effect with the selector or ModelSelectionEffectError.
 * @example Effect.runSync(normalizeModelSelectorEffect("openai:gpt"));
 */
export const normalizeModelSelectorEffect = Effect.fn("Agents.modelSelector.normalize")(
  (value: unknown) =>
    Effect.try({ try: () => normalizeModelSelectorValue(value), catch: modelSelectionEffectError }),
  (effect) => observeAgent("model-selector.normalize", effect),
);

/** Normalizes an optional provider or provider:model selector.
 * @param value - Unknown selector input.
 * @returns The canonical selector or undefined.
 * @throws ModelSelectionError for an invalid selector.
 * @example normalizeModelSelector("openai:gpt");
 */
export function normalizeModelSelector(value: unknown): string | undefined {
  return runModelSelection(normalizeModelSelectorEffect(value));
}

/** Parses and validates configured model providers.
 * @param value - Unknown provider configuration.
 * @returns An Effect with frozen configuration or ModelSelectionEffectError.
 * @example Effect.runSync(parseModelProviderConfigurationEffect(config));
 */
export const parseModelProviderConfigurationEffect = Effect.fn("Agents.modelSelector.parse")(
  (value: unknown) =>
    Effect.try({
      try: () => parseModelProviderConfigurationValue(value),
      catch: modelSelectionEffectError,
    }),
  (effect) => observeAgent("model-selector.parse", effect),
);

/** Parses and validates configured model providers.
 * @param value - Unknown provider configuration.
 * @returns Frozen, canonical provider defaults.
 * @throws ModelSelectionError for missing or invalid settings.
 * @example parseModelProviderConfiguration(config);
 */
export function parseModelProviderConfiguration(value: unknown): ModelProviderConfiguration {
  return runModelSelection(parseModelProviderConfigurationEffect(value));
}

/** Resolves a selector against provider defaults.
 * @param selector - Optional provider or provider:model selector.
 * @param configuration - Validated provider configuration.
 * @returns An Effect with a resolved model or ModelSelectionEffectError.
 * @example Effect.runSync(resolveModelSelectorEffect("openai", config));
 */
export const resolveModelSelectorEffect = Effect.fn("Agents.modelSelector.resolve")(
  (selector: unknown, configuration: ModelProviderConfiguration) =>
    Effect.try({
      try: () => resolveModelSelectorValue(selector, configuration),
      catch: modelSelectionEffectError,
    }),
  (effect) => observeAgent("model-selector.resolve", effect),
);

/** Resolves a selector against provider defaults.
 * @param selector - Optional provider or provider:model selector.
 * @param configuration - Validated provider configuration.
 * @returns Provider, model, and combined stable identifier.
 * @throws ModelSelectionError for missing providers or defaults.
 * @example resolveModelSelector("openai", config);
 */
export function resolveModelSelector(
  selector: unknown,
  configuration: ModelProviderConfiguration,
): ResolvedModelSelection {
  return runModelSelection(resolveModelSelectorEffect(selector, configuration));
}

function runModelSelection<A>(effect: Effect.Effect<A, ModelSelectionEffectError>): A {
  return Effect.runSync(
    effect.pipe(Effect.catchTag("ModelSelectionEffectError", (error) => Effect.fail(error.cause))),
  );
}
