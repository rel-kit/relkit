import { normalizeArtifactName } from "./add-name.js";
import type { AddKind } from "./add-types.js";
import { AddResolutionState, label } from "./add-resolution-state.js";
import type {
  DiscoveredArtifact,
  DiscoveredProfile,
  ProjectDiscovery,
} from "./project-discovery-types.js";

const SERVICE_KINDS = new Set<AddKind>([
  "function",
  "error",
  "event",
  "event-function",
  "job",
  "cache",
  "bucket",
  "tool",
  "prompt",
  "agent",
  "constants",
]);

export async function resolveService(
  state: AddResolutionState,
  discovery: ProjectDiscovery,
): Promise<void> {
  if (state.parsed.service || state.parsed.createService) return;
  const services = discovery.services.filter((service) => service.capability === "generic");
  if (!state.interactive) {
    if (services.length === 1) state.option("service", services[0]!.domain);
    return;
  }
  const create = "__create_service__";
  const selected = await state.select("Choose a service", [
    ...services.map((service) => ({
      value: service.domain,
      label: label(service.domain),
      hint: service.path,
    })),
    { value: create, label: "Create a new service" },
  ]);
  if (selected === create) {
    const name = await state.text("New service name", undefined, true);
    if (name) state.option("create-service", name);
  } else if (selected) state.option("service", selected);
}

export async function resolveServiceForKind(
  state: AddResolutionState,
  discovery: ProjectDiscovery,
): Promise<void> {
  if (SERVICE_KINDS.has(state.parsed.kind)) await resolveService(state, discovery);
}

export function selectedDomain(
  state: AddResolutionState,
  discovery: ProjectDiscovery,
): string | undefined {
  const parsed = state.parsed;
  if (parsed.createService) return normalizeArtifactName(parsed.createService).fileStem;
  if (!parsed.service) return undefined;
  const normalized = normalizeArtifactName(parsed.service).fileStem;
  return (
    discovery.services.find(
      (service) =>
        service.capability === "generic" &&
        [service.domain, normalizeArtifactName(service.binding).fileStem].includes(normalized),
    )?.domain ?? normalized
  );
}

export function artifacts(
  discovery: ProjectDiscovery,
  domain: string | undefined,
  kind: DiscoveredArtifact["kind"],
): readonly DiscoveredArtifact[] {
  return discovery.artifacts.filter(
    (artifact) => artifact.domain === domain && artifact.kind === kind && artifact.exported,
  );
}

export function artifactOptions(values: readonly DiscoveredArtifact[]) {
  return values.map((artifact) => ({
    value: artifact.id ?? artifact.binding,
    label: label(artifact.binding),
    hint: artifact.path,
  }));
}

export function profiles(
  discovery: ProjectDiscovery,
  capability: DiscoveredProfile["capability"],
): readonly DiscoveredProfile[] {
  return discovery.profiles.filter((profile) => profile.capability === capability);
}
