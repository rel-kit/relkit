import { Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { GeneratorFileSystem } from "./generator-filesystem.js";
import {
  scaffoldErrors,
  type GeneratorDomainError,
  type GeneratorIoError,
} from "./generator-errors.js";
import { runGeneratorPromise } from "./generator-runtime.js";
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

/**
 * Plans route through the owning request and typed filesystem authority.
 * @param builder - Per-request planning owner.
 * @param request - Normalized scaffold request.
 * @param target - Discovered domain or artifact target.
 * @returns Completion after the route source and required service mappings are planned.
 */
export const renderRouteEffect = Effect.fn("Scaffold.renderRoute")(
  function* (
    builder: PlanBuilder,
    request: Extract<AddRequest, { kind: "route" }>,
    target?: DomainTarget,
  ): Effect.fn.Return<void, GeneratorDomainError | GeneratorIoError, GeneratorFileSystem> {
    const path = routePathToFilePath(request.path);
    if (request.mode === "route") {
      yield* builder.createEffect(path, routeSource());
      return;
    }
    if (!target) usage("A service route requires a service.");
    const members = target.service && new Set(target.service.members.map((member) => member.name));
    for (const member of Object.values(request.maps)) {
      if (members && !members.has(member))
        usage(`Service ${target.domain.fileStem} has no public member ${member}.`);
    }
    yield* builder.createEffect(path, serviceRouteSource(target.domain.fileStem, request.maps));
  },
  (effect) => observeExecution("generator", "planning.renderRoute", scaffoldErrors(effect)),
);

/**
 * Plans middleware through the owning request and typed filesystem authority.
 * @param builder - Per-request planning owner.
 * @param request - Normalized scaffold request.
 * @returns Completion after validated middleware source is added to the request plan.
 */
export const renderMiddlewareEffect = Effect.fn("Scaffold.renderMiddleware")(
  function* (
    builder: PlanBuilder,
    request: Extract<AddRequest, { kind: "middleware" }>,
  ): Effect.fn.Return<void, GeneratorDomainError | GeneratorIoError, GeneratorFileSystem> {
    if (!middlewarePath(request.path)) usage(`Invalid middleware path: ${request.path}`);
    const name = normalizeArtifactName(request.name);
    yield* builder.createEffect(
      `src/routes/middleware/${name.fileStem}.middleware.ts`,
      middlewareSource(request.path),
    );
  },
  (effect) => observeExecution("generator", "planning.renderMiddleware", scaffoldErrors(effect)),
);

/**
 * Plans transform through the owning request and typed filesystem authority.
 * @param builder - Per-request planning owner.
 * @param request - Normalized scaffold request.
 * @returns Completion after transform source is added to the request plan.
 */
export const renderTransformEffect = Effect.fn("Scaffold.renderTransform")(
  function* (
    builder: PlanBuilder,
    request: Extract<AddRequest, { kind: "transform" }>,
  ): Effect.fn.Return<void, GeneratorDomainError | GeneratorIoError, GeneratorFileSystem> {
    const name = normalizeArtifactName(request.name);
    yield* builder.createEffect(
      `src/routes/transforms/${name.fileStem}.transform.ts`,
      transformSource(),
    );
  },
  (effect) => observeExecution("generator", "planning.renderTransform", scaffoldErrors(effect)),
);

/**
 * Checks middleware path syntax with an optional final wildcard.
 * @param value - Requested middleware match path.
 * @returns Whether static/parameter segments and a final wildcard form a supported path.
 */
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

/**
 * Rejects unsupported or incomplete scaffold arguments.
 * @param message - Diagnostic explaining the unsupported arguments.
 * @returns No value; throws AddScaffoldError with RELKIT_ADD_USAGE.
 */
function usage(message: string): never {
  throw new AddScaffoldError(ADD_FAILURE_CODES.usage, message);
}

/**
 * Preserves the renderRoute Promise compatibility API.
 * @param builder - Per-request planning owner.
 * @param request - Normalized scaffold request.
 * @param target - Discovered domain or artifact target.
 * @returns Completion after the existing contract has been applied.
 */
export function renderRoute(
  builder: PlanBuilder,
  request: Extract<AddRequest, { kind: "route" }>,
  target?: DomainTarget,
): Promise<void> {
  return runGeneratorPromise(renderRouteEffect(builder, request, target));
}

/**
 * Preserves the renderMiddleware Promise compatibility API.
 * @param builder - Per-request planning owner.
 * @param request - Normalized scaffold request.
 * @returns Completion after the existing contract has been applied.
 */
export function renderMiddleware(
  builder: PlanBuilder,
  request: Extract<AddRequest, { kind: "middleware" }>,
): Promise<void> {
  return runGeneratorPromise(renderMiddlewareEffect(builder, request));
}

/**
 * Preserves the renderTransform Promise compatibility API.
 * @param builder - Per-request planning owner.
 * @param request - Normalized scaffold request.
 * @returns Completion after the existing contract has been applied.
 */
export function renderTransform(
  builder: PlanBuilder,
  request: Extract<AddRequest, { kind: "transform" }>,
): Promise<void> {
  return runGeneratorPromise(renderTransformEffect(builder, request));
}
