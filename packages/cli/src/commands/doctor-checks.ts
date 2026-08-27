import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { LoadedToolingConfig } from "@relkit/compiler";
import type { DoctorCheck, DoctorOptions } from "./doctor-support.js";
import { resolveApplicationPort, resolveInspectorPort } from "./ports.js";

export async function checkPulumi(
  enabled: boolean,
  root: string,
  runner = runCommand,
): Promise<DoctorCheck> {
  if (!enabled)
    return { name: "pulumi", ok: true, message: "Pulumi check skipped; deployment is disabled." };
  const executable = Bun.which("pulumi");
  if (executable === null)
    return { name: "pulumi", ok: false, message: "Pulumi CLI is not available." };
  const result = await runner([executable, "version", "--client-only"], root);
  return {
    name: "pulumi",
    ok: result.exitCode === 0,
    message:
      result.exitCode === 0 ? "Pulumi CLI is available." : "Pulumi CLI could not be invoked.",
  };
}

export function checkAws(
  enabled: boolean,
  source: Readonly<Record<string, string | undefined>>,
): DoctorCheck {
  if (!enabled)
    return {
      name: "aws-credentials",
      ok: true,
      message: "AWS credential check skipped; deployment is disabled.",
    };
  const groups = [
    ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"],
    ["AWS_PROFILE"],
    ["AWS_WEB_IDENTITY_TOKEN_FILE", "AWS_ROLE_ARN"],
    ["AWS_CONTAINER_CREDENTIALS_RELATIVE_URI"],
    ["AWS_CONTAINER_CREDENTIALS_FULL_URI"],
  ];
  const visible = groups.find((group) => group.every((name) => Boolean(source[name])));
  return {
    name: "aws-credentials",
    ok: visible !== undefined,
    message:
      visible === undefined ? "AWS credentials are not visible." : "AWS credentials are visible.",
    details: { sources: visible ?? [] },
  };
}

export async function checkRoots(root: string): Promise<DoctorCheck> {
  const paths = [
    ".relkit",
    ".relkit/generated",
    ".relkit/build",
    ".relkit/state",
    ".relkit/observability",
  ].map((path) => join(root, path));
  const failures: string[] = [];
  for (const path of paths) {
    const marker = join(path, `.doctor-${crypto.randomUUID()}`);
    try {
      await mkdir(path, { recursive: true });
      await writeFile(marker, "");
    } catch {
      failures.push(path);
    } finally {
      await rm(marker, { force: true }).catch(() => undefined);
    }
  }
  return {
    name: "relkit-roots",
    ok: failures.length === 0,
    message:
      failures.length === 0
        ? ".relkit roots are writable."
        : "One or more .relkit roots are not writable.",
    ...(failures.length === 0 ? {} : { details: { failed: failures } }),
  };
}

export async function checkPorts(
  config: LoadedToolingConfig | undefined,
  options: DoctorOptions,
  probe: (port: number) => Promise<boolean>,
): Promise<DoctorCheck> {
  let backend: number;
  let inspector: number;
  try {
    const source = options.source ?? process.env;
    backend = resolveApplicationPort({
      ...(options.backendPort === undefined ? {} : { flag: options.backendPort }),
      source,
      ...(config === undefined ? {} : { configured: config.server.port }),
    });
    inspector = resolveInspectorPort({
      ...(options.inspectorPort === undefined ? {} : { flag: options.inspectorPort }),
      source,
      ...(config === undefined ? {} : { configured: config.inspector.port }),
    });
  } catch (error) {
    return {
      name: "ports",
      ok: false,
      message: error instanceof Error ? error.message : "Configured ports are invalid.",
    };
  }
  if (backend === inspector)
    return {
      name: "ports",
      ok: false,
      message: "Configured backend and inspector ports collide.",
      details: { backend, inspector },
    };
  const ok = (await probe(backend)) && (await probe(inspector));
  return {
    name: "ports",
    ok,
    message: ok ? "Configured ports are available." : "A configured port is unavailable.",
    details: { backend, inspector },
  };
}

export async function checkLockfile(root: string, runner = runCommand): Promise<DoctorCheck> {
  const result = await runner(
    [process.execPath, "install", "--frozen-lockfile", "--dry-run"],
    root,
  );
  return {
    name: "lockfile",
    ok: result.exitCode === 0,
    message:
      result.exitCode === 0
        ? "Frozen lockfile is consistent."
        : "Frozen lockfile consistency check failed.",
  };
}

export async function availablePort(port: number): Promise<boolean> {
  try {
    const server = Bun.serve({ hostname: "127.0.0.1", port, fetch: () => new Response() });
    await server.stop(true);
    return true;
  } catch {
    return false;
  }
}
async function runCommand(
  command: readonly string[],
  cwd: string,
): Promise<{ readonly exitCode: number }> {
  const child = Bun.spawn([...command], { cwd, stdout: "ignore", stderr: "ignore" });
  return { exitCode: await child.exited };
}
