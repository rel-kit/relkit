import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  LocalWorkspace,
  Stack,
  type ConfigMap,
  type LocalWorkspaceOptions,
  type PulumiCommand,
  type PulumiFn,
} from "@pulumi/pulumi/automation";

export const PULUMI_CLOUD_BACKEND_URL = "https://api.pulumi.com" as const;
export type PulumiBackendKind = "cloud" | "object-storage" | "local";
export type PulumiStackMode = "create" | "select" | "create-or-select";

export interface PulumiBackend {
  readonly kind: PulumiBackendKind;
  readonly url?: string;
  readonly directory?: string;
}

export type ResolvedPulumiBackend = { readonly kind: PulumiBackendKind; readonly url: string };

export interface PulumiWorkspaceOptions {
  readonly projectName: string;
  readonly stackName: string;
  readonly workDir?: string;
  readonly backend?: PulumiBackend;
  readonly mode?: PulumiStackMode;
  readonly config?: ConfigMap;
  readonly envVars?: Readonly<Record<string, string>>;
  readonly pulumiHome?: string;
  readonly pulumiCommand?: PulumiCommand;
  readonly program?: PulumiFn;
  readonly secretsProvider?: string;
}

export interface PulumiWorkspaceHandle {
  readonly workspace: LocalWorkspace;
  readonly stack: Stack;
  readonly projectName: string;
  readonly stackName: string;
  readonly workDir: string;
  readonly backend: ResolvedPulumiBackend;
}

export class PulumiWorkspaceConfigurationError extends Error {
  readonly code = "ZSYS_PULUMI_WORKSPACE_INVALID" as const;

  constructor(message: string) {
    super(message);
    this.name = "PulumiWorkspaceConfigurationError";
  }
}

/** Resolves a supported Pulumi backend without creating a second state store. */
export function resolvePulumiBackend(
  backend: PulumiBackend = { kind: "cloud" },
  workDir = process.cwd(),
): ResolvedPulumiBackend {
  const root = resolve(workDir);
  if (backend.kind === "cloud")
    return { kind: "cloud", url: cloudUrl(backend.url ?? PULUMI_CLOUD_BACKEND_URL) };
  if (backend.kind === "object-storage")
    return { kind: "object-storage", url: objectStorageUrl(backend.url) };
  if (backend.kind === "local") {
    const directory =
      backend.directory === undefined
        ? join(root, ".pulumi")
        : resolve(root, nonEmpty(backend.directory, "local backend directory"));
    return { kind: "local", url: pathToFileURL(directory).href };
  }
  throw new PulumiWorkspaceConfigurationError("Unsupported Pulumi backend kind.");
}

/** Creates/selects one explicit Pulumi stack and delegates persistence to Pulumi. */
export async function createPulumiWorkspace(
  options: PulumiWorkspaceOptions,
): Promise<PulumiWorkspaceHandle> {
  const projectName = projectId(options.projectName);
  const stackName = stackId(options.stackName);
  const workDir = await workspaceDirectory(options.workDir);
  const backend = resolvePulumiBackend(options.backend, workDir);
  const mode = options.mode ?? "create-or-select";
  const projectSettings = {
    name: projectName,
    runtime: "nodejs" as const,
    main: ".",
    backend: { url: backend.url },
  };
  const workspaceOptions: LocalWorkspaceOptions = {
    workDir,
    ...(mode === "select" ? {} : { projectSettings }),
    ...(options.program === undefined ? {} : { program: options.program }),
    ...(options.pulumiCommand === undefined ? {} : { pulumiCommand: options.pulumiCommand }),
    ...(options.secretsProvider === undefined ? {} : { secretsProvider: options.secretsProvider }),
    ...(options.pulumiHome === undefined
      ? backend.kind === "local"
        ? { pulumiHome: join(workDir, ".pulumi-home") }
        : {}
      : { pulumiHome: resolve(workDir, options.pulumiHome) }),
    ...(options.envVars === undefined ? {} : { envVars: { ...options.envVars } }),
  };
  const workspace = await LocalWorkspace.create(workspaceOptions);
  if (mode === "select") await assertProject(workspace, projectName, backend);
  const stack =
    mode === "create"
      ? await Stack.create(stackName, workspace)
      : mode === "select"
        ? await Stack.select(stackName, workspace)
        : await Stack.createOrSelect(stackName, workspace);
  if (options.config !== undefined && Object.keys(options.config).length > 0)
    await stack.setAllConfig(options.config);
  return Object.freeze({ workspace, stack, projectName, stackName, workDir, backend });
}

async function workspaceDirectory(directory: string | undefined): Promise<string> {
  if (directory !== undefined && directory.trim() === "")
    throw new PulumiWorkspaceConfigurationError("Pulumi workDir must not be empty.");
  const path =
    directory === undefined ? await mkdtemp(join(tmpdir(), "zsys-pulumi-")) : resolve(directory);
  await mkdir(path, { recursive: true });
  return path;
}

async function assertProject(
  workspace: LocalWorkspace,
  projectName: string,
  backend: ResolvedPulumiBackend,
): Promise<void> {
  const settings = await workspace.projectSettings();
  if (settings.name !== projectName)
    throw new PulumiWorkspaceConfigurationError(
      "Pulumi project name does not match the requested project.",
    );
  const configured = settings.backend?.url ?? PULUMI_CLOUD_BACKEND_URL;
  if (configured.replace(/\/$/, "") !== backend.url)
    throw new PulumiWorkspaceConfigurationError(
      "Pulumi project backend does not match the requested backend.",
    );
}

function projectId(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return nonEmpty(normalized, "projectName");
}

function stackId(value: string): string {
  const normalized = nonEmpty(value.trim(), "stackName");
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(normalized) || normalized.includes("\\"))
    throw new PulumiWorkspaceConfigurationError("stackName contains unsupported characters.");
  return normalized;
}

function cloudUrl(value: string): string {
  const url = parseUrl(value, "https:", "Pulumi Cloud");
  if (url.hostname !== "api.pulumi.com" || url.pathname !== "/" || url.search || url.hash)
    throw new PulumiWorkspaceConfigurationError("Pulumi Cloud backend must use api.pulumi.com.");
  return url.origin;
}

function objectStorageUrl(value: string | undefined): string {
  const url = parseUrl(value, ["s3:", "azblob:", "gs:"], "object-storage");
  if (url.username || url.password || !url.hostname)
    throw new PulumiWorkspaceConfigurationError(
      "Object-storage backend URLs must not contain credentials.",
    );
  return url.toString().replace(/\/$/, "");
}

function parseUrl(
  value: string | undefined,
  protocols: string | readonly string[],
  label: string,
): URL {
  const input = nonEmpty(value ?? "", `${label} backend URL`);
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new PulumiWorkspaceConfigurationError(`Invalid ${label} backend URL.`);
  }
  const allowed = Array.isArray(protocols) ? protocols : [protocols];
  if (!allowed.includes(url.protocol))
    throw new PulumiWorkspaceConfigurationError(`Unsupported ${label} backend URL scheme.`);
  return url;
}

function nonEmpty(value: string, label: string): string {
  if (value.length === 0)
    throw new PulumiWorkspaceConfigurationError(`${label} must not be empty.`);
  return value;
}
