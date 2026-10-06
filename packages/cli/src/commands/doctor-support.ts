import type { DoctorResult, ParsedDoctorArgs } from "./doctor.types.js";
import { DoctorCommandError } from "./doctor-error.js";
export type {
  DoctorCheck,
  DoctorResult,
  DoctorOptions,
  DoctorCommandRunner,
} from "./doctor.types.js";
export { DoctorCommandError } from "./doctor-error.js";
export { doctorProject } from "./doctor-project.service.js";

/** Parses doctor flags in order, retaining the last explicit prerequisite override.
 * @param args - Literal command arguments.
 * @returns Defined options without manufacturing absent defaults.
 * @throws DoctorCommandError for unknown flags, missing values or invalid ports.
 */
export function parseDoctorArgs(args: readonly string[]): ParsedDoctorArgs {
  let projectRoot: string | undefined;
  let backendPort: number | undefined;
  let inspectorPort: number | undefined;
  let skipPorts: boolean | undefined;
  let deploymentEnabled: boolean | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--project-root") projectRoot = requiredValue(args, ++index, arg);
    else if (arg === "--port")
      backendPort = parsePort(requiredValue(args, ++index, arg), arg, true);
    else if (arg === "--inspector-port")
      inspectorPort = parsePort(requiredValue(args, ++index, arg), arg, false);
    else if (arg === "--no-ports") skipPorts = true;
    else if (arg === "--pulumi") deploymentEnabled = true;
    else if (arg === "--no-pulumi") deploymentEnabled = false;
    else throw new DoctorCommandError("RELKIT_DOCTOR_USAGE", `Unknown doctor option: ${arg}`);
  }
  return {
    ...(projectRoot === undefined ? {} : { projectRoot }),
    ...(backendPort === undefined ? {} : { backendPort }),
    ...(inspectorPort === undefined ? {} : { inspectorPort }),
    ...(skipPorts === undefined ? {} : { skipPorts }),
    ...(deploymentEnabled === undefined ? {} : { deploymentEnabled }),
  };
}

/** Checks the existing numeric port contract.
 * @param value - Parsed numeric input.
 * @param dynamic - Whether zero requests a dynamic backend listener.
 * @returns Whether the input is in the admitted integer range.
 */
function validPort(value: number, dynamic: boolean): boolean {
  return Number.isInteger(value) && value >= (dynamic ? 0 : 1) && value <= 65535;
}

/** Validates one explicit port without acquiring a listener.
 * @param value - Literal flag value.
 * @param option - Existing diagnostic flag name.
 * @param dynamic - Whether zero is admitted.
 * @returns Valid port.
 * @throws DoctorCommandError for invalid values.
 */
function parsePort(value: string, option: string, dynamic: boolean): number {
  const port = Number(value);
  if (!validPort(port, dynamic))
    throw new DoctorCommandError("RELKIT_DOCTOR_USAGE", `${option} must be a valid port.`);
  return port;
}

/** Requires a value before another flag can be interpreted as data.
 * @param args - Literal arguments.
 * @param index - Requested value position.
 * @param option - Existing diagnostic flag name.
 * @returns The selected value.
 * @throws DoctorCommandError when absent or flag-like.
 */
function requiredValue(args: readonly string[], index: number, option: string): string {
  const value = args[index];
  if (value === undefined || value.startsWith("-"))
    throw new DoctorCommandError("RELKIT_DOCTOR_USAGE", `${option} requires a value.`);
  return value;
}

/** Formats prerequisite checks using the established terminal rows.
 * @param result - Complete report.
 * @returns Existing human output without environment values.
 */
export function formatDoctor(result: DoctorResult): string {
  return [
    ...result.checks.map((check) => `${check.ok ? "✓" : "✗"} ${check.name}: ${check.message}`),
    result.ok ? "Doctor passed." : "Doctor found prerequisite failures.",
  ].join("\n");
}
