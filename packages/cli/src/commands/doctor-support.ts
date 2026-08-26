import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ConfigValidationError, loadConfig, type LoadedToolingConfig } from "@zsys/compiler";
import {
  checkAws,
  checkLockfile,
  checkPorts,
  checkPulumi,
  checkRoots,
  availablePort,
} from "./doctor-checks.js";
import { detectDeployment, isAppDescriptor, readJson, versionChecks } from "./doctor-compat.js";

export interface DoctorCheck {
  readonly name: string;
  readonly ok: boolean;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}
export interface DoctorResult {
  readonly ok: boolean;
  readonly command: "doctor";
  readonly projectRoot: string;
  readonly checks: readonly DoctorCheck[];
}
export interface DoctorOptions {
  readonly projectRoot?: string;
  readonly source?: Readonly<Record<string, string | undefined>>;
  readonly backendPort?: number;
  readonly inspectorPort?: number;
  readonly deploymentEnabled?: boolean;
  readonly commandRunner?: DoctorCommandRunner;
  readonly portProbe?: (port: number) => Promise<boolean>;
}
export type DoctorCommandRunner = (
  command: readonly string[],
  cwd: string,
) => Promise<{ readonly exitCode: number }>;

export class DoctorCommandError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "DoctorCommandError";
    this.code = code;
  }
}

type ParsedDoctorArgs = Pick<DoctorOptions, "projectRoot" | "backendPort" | "inspectorPort"> & {
  readonly deploymentEnabled?: boolean;
};

export async function doctorProject(options: DoctorOptions = {}): Promise<DoctorResult> {
  const root = resolve(options.projectRoot ?? process.cwd());
  const checks: DoctorCheck[] = [];
  const manifest = await readJson(join(root, "package.json"));
  checks.push(...(await versionChecks(manifest, root)));
  const config = await checkConfig(root, checks);
  const app = await checkApp(root, config, checks);
  const enabled = options.deploymentEnabled ?? detectDeployment(manifest, config);
  checks.push(await checkPulumi(enabled, root, options.commandRunner));
  checks.push(checkAws(enabled, options.source ?? process.env));
  checks.push(await checkRoots(root));
  checks.push(await checkPorts(config, options, options.portProbe ?? availablePort));
  checks.push(await checkLockfile(root, options.commandRunner));
  return Object.freeze({
    ok: checks.every((check) => check.ok),
    command: "doctor",
    projectRoot: root,
    checks: Object.freeze(checks.map((check) => Object.freeze(check))),
  });
}

export function parseDoctorArgs(args: readonly string[]): ParsedDoctorArgs {
  let projectRoot: string | undefined;
  let backendPort: number | undefined;
  let inspectorPort: number | undefined;
  let deploymentEnabled: boolean | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--project-root") projectRoot = requiredValue(args, ++index, arg);
    else if (arg === "--port")
      backendPort = parsePort(requiredValue(args, ++index, arg), arg, true);
    else if (arg === "--inspector-port")
      inspectorPort = parsePort(requiredValue(args, ++index, arg), arg, false);
    else if (arg === "--pulumi") deploymentEnabled = true;
    else if (arg === "--no-pulumi") deploymentEnabled = false;
    else throw new DoctorCommandError("ZSYS_DOCTOR_USAGE", `Unknown doctor option: ${arg}`);
  }
  return {
    ...(projectRoot === undefined ? {} : { projectRoot }),
    ...(backendPort === undefined ? {} : { backendPort }),
    ...(inspectorPort === undefined ? {} : { inspectorPort }),
    ...(deploymentEnabled === undefined ? {} : { deploymentEnabled }),
  };
}

async function checkConfig(
  root: string,
  checks: DoctorCheck[],
): Promise<LoadedToolingConfig | undefined> {
  try {
    const loaded = await import(
      `${pathToFileURL(join(root, "zsys.config.ts")).href}?zsys_doctor=1`
    );
    const config = loadConfig((loaded as { readonly default?: unknown }).default ?? loaded, root);
    checks.push({ name: "config", ok: true, message: "zsys.config.ts is valid." });
    return config;
  } catch (error) {
    const detail =
      error instanceof ConfigValidationError
        ? error.issues.map((issue) => `${issue.path}:${issue.code}`).join(", ")
        : "file is missing or could not be loaded";
    checks.push({ name: "config", ok: false, message: `Invalid zsys.config.ts (${detail}).` });
    return undefined;
  }
}

async function checkApp(
  root: string,
  config: LoadedToolingConfig | undefined,
  checks: DoctorCheck[],
): Promise<unknown> {
  if (config === undefined) {
    checks.push({
      name: "app",
      ok: false,
      message: "App cannot be checked because config is invalid.",
    });
    return undefined;
  }
  try {
    const file = "zsys.config.ts";
    const loaded = await import(`${pathToFileURL(resolve(root, file)).href}?zsys_doctor_app=1`);
    const app = (loaded as { readonly default?: unknown }).default;
    const ok = isAppDescriptor(app);
    checks.push({
      name: "app",
      ok,
      message: ok ? `${file} defines the application.` : `${file} is not a valid app config.`,
    });
    return app;
  } catch {
    checks.push({ name: "app", ok: false, message: "zsys.config.ts could not be loaded." });
    return undefined;
  }
}

function validPort(value: number, dynamic: boolean): boolean {
  return Number.isInteger(value) && value >= (dynamic ? 0 : 1) && value <= 65535;
}
function parsePort(value: string, option: string, dynamic: boolean): number {
  const port = Number(value);
  if (!validPort(port, dynamic))
    throw new DoctorCommandError("ZSYS_DOCTOR_USAGE", `${option} must be a valid port.`);
  return port;
}
function requiredValue(args: readonly string[], index: number, option: string): string {
  const value = args[index];
  if (value === undefined || value.startsWith("-"))
    throw new DoctorCommandError("ZSYS_DOCTOR_USAGE", `${option} requires a value.`);
  return value;
}
export function formatDoctor(result: DoctorResult): string {
  return [
    ...result.checks.map((check) => `${check.ok ? "✓" : "✗"} ${check.name}: ${check.message}`),
    result.ok ? "Doctor passed." : "Doctor found prerequisite failures.",
  ].join("\n");
}
