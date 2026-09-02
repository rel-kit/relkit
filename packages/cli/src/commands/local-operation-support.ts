import { resolve } from "node:path";
import { isStableId, type RuntimeIntegrationPlan } from "@relkit/contracts";
import type { LocalServiceRecipe } from "@relkit/local-service";
import { checkProject } from "./check.js";
import { checkedLocalArtifacts } from "./dev-local.js";
import { loadLocalRecipe } from "./local-runtime-modules.js";

export class LocalCommandError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "LocalCommandError";
  }
}

export async function loadLocalProject(projectRoot: string, signal: AbortSignal) {
  const root = resolve(projectRoot);
  const checked = await checkProject({ projectRoot: root, mode: "development", signal });
  if (!checked.ok)
    throw new LocalCommandError(
      "RELKIT_LOCAL_CHECK_FAILED",
      checked.diagnostics.map((entry) => entry.message).join("\n") || "Project check failed.",
    );
  const artifacts = checkedLocalArtifacts(root, checked);
  const applicationId = artifacts.graph.appId;
  if (!isStableId(applicationId))
    throw new LocalCommandError("RELKIT_LOCAL_INVALID", "Local application identity is invalid.");
  return { root, checked, applicationId, ...artifacts };
}

export async function loadLocalRecipes(
  projectRoot: string,
  plan: RuntimeIntegrationPlan,
  integrationIds: readonly string[],
): Promise<Readonly<Record<string, LocalServiceRecipe>>> {
  const entries = await Promise.all(
    [...new Set(integrationIds)].map(
      async (id) => [id, await loadLocalRecipe(projectRoot, plan, id)] as const,
    ),
  );
  return Object.freeze(Object.fromEntries(entries));
}

export function oneMaterializer(values: readonly string[]): string {
  const unique = [...new Set(values)];
  if (unique.length > 1)
    throw new LocalCommandError(
      "RELKIT_LOCAL_INVALID",
      "Local bindings require multiple materializers.",
    );
  return unique[0] ?? "docker";
}

export function waitForAbort(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolveWait) =>
    signal.addEventListener("abort", () => resolveWait(), { once: true }),
  );
}

export function processAlive(pid: number | undefined): boolean {
  if (!Number.isSafeInteger(pid) || pid! < 1) return false;
  try {
    process.kill(pid!, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

export function formatServices(
  services: readonly { readonly bindingId: string; readonly phase: string }[],
): string {
  return services.length === 0
    ? "No local services."
    : services.map((service) => `${service.bindingId}: ${service.phase}`).join("\n");
}
