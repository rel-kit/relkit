import type { CreateCapabilityWarning } from "./create-capabilities.types.js";
import type { CreateOptions } from "./options.js";
import type { PromptDriver } from "./prompt-driver.types.js";

/** Existing create-resolution settings; noninteractive input never needs prompt authority. */
export interface ResolveCreateContext {
  readonly json?: boolean;
  readonly interactive?: boolean;
  readonly promptDriver?: PromptDriver;
  readonly signal?: AbortSignal;
}

/** Existing resolver result; prompted records whether any creation choice was requested. */
export interface ResolvedCreateOptions {
  readonly options: CreateOptions;
  readonly prompted: boolean;
  /** Coded notices to print before creation, such as an untested combination. */
  readonly warnings: readonly CreateCapabilityWarning[];
}
