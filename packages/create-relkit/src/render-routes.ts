import { routePathToFilePath } from "@relkit/compiler";
import { ADD_FAILURE_CODES, AddScaffoldError, type AddRequest } from "./add-types.js";
import { normalizeArtifactName } from "./add-name.js";
import type { DomainTarget } from "./domain-planning.js";
import { PlanBuilder } from "./plan-builder.js";
import {
  middlewareSource,
  routeSource,
  serviceRouteSource,
  transformSource,
} from "./render-route-sources.js";

export async function renderRoute(
  builder: PlanBuilder,
  request: Extract<AddRequest, { kind: "route" }>,
  target?: DomainTarget,
): Promise<void> {
  const path = routePathToFilePath(request.path);
  if (request.mode === "route") {
    await builder.create(path, routeSource());
    return;
  }
  if (!target) usage("A service route requires a service.");
  const members = target.service && new Set(target.service.members.map((member) => member.name));
  for (const member of Object.values(request.maps)) {
    if (members && !members.has(member))
      usage(`Service ${target.domain.fileStem} has no public member ${member}.`);
  }
  await builder.create(path, serviceRouteSource(target.domain.fileStem, request.maps));
}

export async function renderMiddleware(
  builder: PlanBuilder,
  request: Extract<AddRequest, { kind: "middleware" }>,
): Promise<void> {
  if (!middlewarePath(request.path)) usage(`Invalid middleware path: ${request.path}`);
  const name = normalizeArtifactName(request.name);
  await builder.create(
    `src/routes/middleware/${name.fileStem}.middleware.ts`,
    middlewareSource(request.path),
  );
}

export async function renderTransform(
  builder: PlanBuilder,
  request: Extract<AddRequest, { kind: "transform" }>,
): Promise<void> {
  const name = normalizeArtifactName(request.name);
  await builder.create(`src/routes/transforms/${name.fileStem}.transform.ts`, transformSource());
}

function middlewarePath(value: string): boolean {
  if (value === "*" || value === "/") return true;
  if (!value.startsWith("/") || value.endsWith("/")) return false;
  return value
    .slice(1)
    .split("/")
    .every((segment, index, values) => {
      if (segment === "*") return index === values.length - 1;
      return /^:[A-Za-z_][A-Za-z0-9_]*$/.test(segment) || !/[*:?{}]/.test(segment);
    });
}

function usage(message: string): never {
  throw new AddScaffoldError(ADD_FAILURE_CODES.usage, message);
}
