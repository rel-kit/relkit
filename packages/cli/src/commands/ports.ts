export interface PortResolutionOptions {
  readonly flag?: number;
  readonly source?: Readonly<Record<string, string | undefined>>;
  readonly configured?: number;
}

export function resolveApplicationPort(options: PortResolutionOptions = {}): number {
  return resolvePort(options, "PORT", 3000, true);
}

export function resolveInspectorPort(options: PortResolutionOptions = {}): number {
  return resolvePort(options, "ZSYS_INSPECTOR_PORT", 3210, false);
}

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

function valid(value: number, name: string, allowZero: boolean): number {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1) || value > 65_535) {
    throw new RangeError(`${name} must be from ${allowZero ? 0 : 1} through 65535.`);
  }
  return value;
}

function flagName(environmentName: string): string {
  return environmentName === "PORT" ? "port" : "inspector-port";
}

function configName(environmentName: string): string {
  return environmentName === "PORT" ? "server" : "inspector";
}
