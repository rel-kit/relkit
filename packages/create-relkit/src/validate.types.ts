import type { CreateOptions } from "./options.js";

/** Existing read-only creation-validation context. */
export interface CreateValidationContext {
  readonly cwd?: string;
  readonly homeDirectory?: string;
  readonly temporaryDirectory?: string;
}

/** Existing validated creation result with inspected destination state. */
export interface ValidatedCreateOptions extends CreateOptions {
  readonly destination: string;
  readonly destinationExists: boolean;
  readonly destinationEmpty: boolean;
}

/** Destination facts obtained before any generation mutation. */
export interface DestinationState {
  readonly exists: boolean;
  readonly empty: boolean;
}
