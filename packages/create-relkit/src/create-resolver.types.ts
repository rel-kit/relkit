import type { CreateOptions } from "./options.js";
import type { PromptDriver } from "./prompt-driver.types.js";

/** Existing create-resolution settings; noninteractive input never needs prompt authority. */
export interface ResolveCreateContext {
  readonly json?: boolean;
  readonly interactive?: boolean;
  readonly promptDriver?: PromptDriver;
  readonly signal?: AbortSignal;
}

/** Existing resolver result; prompted records whether a missing name was requested. */
export interface ResolvedCreateOptions {
  readonly options: CreateOptions;
  readonly prompted: boolean;
}
