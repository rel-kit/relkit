import { basename, dirname, resolve } from "node:path";
import type {
  LocalServiceBindMount,
  LocalServiceWorkerArtifact,
  NormalizedLocalServiceRecipe,
} from "@relkit/local-service";

export interface WorkerStartOptions {
  readonly bindMounts?: Readonly<Record<string, readonly LocalServiceBindMount[]>>;
  readonly environmentVariablesByUnit?: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

export function workerStartOptions(
  recipe: NormalizedLocalServiceRecipe,
  artifact: LocalServiceWorkerArtifact | undefined,
): WorkerStartOptions {
  const workers = recipe.units.filter((unit) => unit.kind === "worker");
  if (workers.length === 0 || artifact === undefined) return {};
  const entrypoint = absoluteFile(artifact.entrypoint, "worker entrypoint");
  const providerOverridesFile = absoluteFile(
    artifact.providerOverridesFile,
    "worker provider overrides",
  );
  const bindMounts: LocalServiceBindMount[] = [
    Object.freeze({
      source: dirname(dirname(entrypoint)),
      target: "/relkit-worker",
      readOnly: true,
    }),
    Object.freeze({
      source: dirname(providerOverridesFile),
      target: "/relkit-state",
      readOnly: true,
    }),
  ];
  const nodeModulesDirectory =
    artifact.nodeModulesDirectory === undefined
      ? undefined
      : absoluteDirectory(artifact.nodeModulesDirectory, "worker node_modules directory");
  if (nodeModulesDirectory !== undefined) {
    bindMounts.push(
      Object.freeze({
        source: nodeModulesDirectory,
        target: "/relkit-node-modules",
        readOnly: true,
      }),
    );
  }
  const environment = Object.freeze({
    RELKIT_PROVIDER_OVERRIDES_FILE: "/relkit-state/" + basename(providerOverridesFile),
    RELKIT_WORKER_ROLE: "worker",
    ...(nodeModulesDirectory === undefined ? {} : { NODE_PATH: "/relkit-node-modules" }),
    ...(artifact.environment ?? {}),
  });
  return Object.freeze({
    bindMounts: Object.freeze(Object.fromEntries(workers.map((unit) => [unit.id, bindMounts]))),
    environmentVariablesByUnit: Object.freeze(
      Object.fromEntries(workers.map((unit) => [unit.id, environment])),
    ),
  });
}

function absoluteFile(value: string, label: string): string {
  const path = resolve(value);
  if (path !== value || !path.startsWith("/")) {
    throw new TypeError(label + " must be an absolute path.");
  }
  return path;
}

function absoluteDirectory(value: string, label: string): string {
  return absoluteFile(value, label);
}
