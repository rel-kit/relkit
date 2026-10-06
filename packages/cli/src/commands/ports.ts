import type { PortResolutionOptions } from "./ports.types.js";
export type { PortResolutionOptions } from "./ports.types.js";

/**
 * Resolves the backend port with flag, source, configured, and default precedence.
 * @param options - Explicit values; no environment is read implicitly.
 * @returns Accepted backend port, including zero for an explicit ephemeral binding.
 * @throws RangeError for invalid input.
 */
export function resolveApplicationPort(options: PortResolutionOptions = {}): number {
  return resolvePort(options, "PORT", 3000, true);
}

/**
 * Resolves the inspector port with the existing precedence.
 * @param options - Explicit flag/source/configuration values.
 * @returns Accepted positive inspector port.
 * @throws RangeError for invalid input.
 */
export function resolveInspectorPort(options: PortResolutionOptions = {}): number {
  return resolvePort(options, "RELKIT_INSPECTOR_PORT", 3210, false);
}

/**
 * Applies the shared pure port precedence and validation rules.
 * @param options - Explicit input values.
 * @param environmentName - Selected source key.
 * @param fallback - Default port.
 * @param allowZero - Whether explicit zero is accepted.
 * @returns Selected valid port.
 * @throws RangeError for malformed values.
 */
function resolvePort(
  options: PortResolutionOptions,
  environmentName: string,
  fallback: number,
  allowZero: boolean,
): number {
  if (options.flag !== undefined)
    return valid(options.flag, `--${flagName(environmentName)}`, allowZero);
  const environment = options.source?.[environmentName];
  if (environment !== undefined) {
    if (!/^\d+$/.test(environment)) {
      throw new RangeError(`${environmentName} must be a valid port.`);
    }
    return valid(Number(environment), environmentName, allowZero);
  }
  return options.configured === undefined
    ? fallback
    : valid(options.configured, `${configName(environmentName)}.port`, false);
}

/**
 * Validates one selected port without changing error text.
 * @param value - Numeric port candidate.
 * @param name - Existing error label.
 * @param allowZero - Whether zero is allowed.
 * @returns The candidate when accepted.
 * @throws RangeError outside the supported range.
 */
function valid(value: number, name: string, allowZero: boolean): number {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1) || value > 65_535) {
    throw new RangeError(`${name} must be from ${allowZero ? 0 : 1} through 65535.`);
  }
  return value;
}

/**
 * Selects the existing CLI flag label.
 * @param environmentName - Selected source key.
 * @returns Backend or inspector flag name.
 */
function flagName(environmentName: string): string {
  return environmentName === "PORT" ? "port" : "inspector-port";
}

/**
 * Selects the existing configuration label.
 * @param environmentName - Selected source key.
 * @returns Server or inspector configuration name.
 */
function configName(environmentName: string): string {
  return environmentName === "PORT" ? "server" : "inspector";
}
