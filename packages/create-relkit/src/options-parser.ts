/** Parses finite create flags without importing compiler or application code. */

import {
  CREATE_OPTION_DEFAULTS,
  CreateOptionsError,
  type CreateOptionsContext,
} from "./options.js";
export function createParsingState(context: CreateOptionsContext) {
  return {
    ...CREATE_OPTION_DEFAULTS,
    name: undefined as string | undefined,
    directory: undefined as string | undefined,
    json: CREATE_OPTION_DEFAULTS.json || context.json === true,
  };
}
export function applyCreateBoolean(
  argument: string,
  state: ReturnType<typeof createParsingState>,
): boolean {
  if (argument === "--json") state.json = true;
  else if (argument === "--force-empty-directory") state.forceEmptyDirectory = true;
  else if (argument === "--install") state.install = true;
  else if (argument === "--no-install") state.install = false;
  else if (argument === "--git") state.git = true;
  else if (argument === "--no-git") state.git = false;
  else if (argument === "--examples") state.examples = true;
  else if (argument === "--no-examples") state.examples = false;
  else return false;
  return true;
}
/**
 * Reads an inline or following value for a creation flag.
 * @param args - Literal flag and positional arguments.
 * @param index - Index of the current flag.
 * @param argument - Current literal flag token.
 * @param option - Flag spelling used for inline matching and diagnostics.
 * @returns The nonempty flag value and last consumed argument index.
 */
export function readValue(
  args: readonly string[],
  index: number,
  argument: string,
  option: string,
): { readonly value: string; readonly index: number } {
  const prefix = `${option}=`;
  if (argument.startsWith(prefix)) {
    const value = argument.slice(prefix.length);
    if (value.length > 0) return { value, index };
  } else {
    const value = args[index + 1];
    if (value !== undefined && !value.startsWith("-")) return { value, index: index + 1 };
  }
  throw new CreateOptionsError(`${option} requires a value.`);
}
/**
 * Validates a finite command-line choice.
 * @typeParam T - Union of allowed option values.
 * @param value - Raw option value before finite-choice validation.
 * @param option - Flag spelling used in diagnostics.
 * @param allowed - Supported literal values.
 * @returns The supported literal value; unsupported input raises CreateOptionsError.
 */
export function choice<T extends string>(value: string, option: string, allowed: readonly T[]): T {
  if (allowed.includes(value as T)) return value as T;
  throw new CreateOptionsError(`${option} must be one of: ${allowed.join("|")}.`);
}
