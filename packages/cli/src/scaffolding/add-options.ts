/** Builds normalized existing-project add requests from CLI arguments and enforces headless requirements before interactive resolution. */

import { domainRequest, executionRequest } from "./add-options-domain.js";
import {
  type AddRequest,
  type AddRequestBase,
  type RouteMethod,
} from "create-relkit/internal/add-types";
import {
  choice,
  many,
  one,
  optional,
  parseAddArguments,
  type ParsedAddArguments,
  required,
  requiredName,
  usage,
} from "./add-options-parser.js";
import { resourceRequest } from "./add-options-resource.js";
/** Supported event delivery guarantees. */

/** Supported task execution guarantees. */
undefined;
/** Supported tool side-effect classifications. */
const SIDE_EFFECTS = ["none", "read", "write", "external"] as const;
/** Supported tool approval policies. */
const APPROVALS = ["never", "on-write", "always"] as const;
/** Supported database dialects. */
const DIALECTS = ["sqlite", "postgresql", "mysql"] as const;
/** Supported route methods. */
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
/**
 * Parses one complete non-interactive `relkit add` request.
 * @param args - Literal flag and positional arguments.
 * @param context - Optional working directory for resolving the project root.
 * @returns The validated discriminated artifact request, preserving omitted optional fields.
 */
export function normalizeAddRequest(
  args: readonly string[],
  context: { readonly cwd?: string } = {},
): AddRequest {
  const parsed = parseAddArguments(args, context.cwd);
  const values = parsed.values;
  const common = {
    projectRoot: parsed.projectRoot,
    ...optional("service", parsed.service),
    ...optional("createService", parsed.createService),
    install: parsed.install,
  };
  const request =
    domainRequest(parsed, common) ??
    executionRequest(parsed, common) ??
    resourceArtifactRequest(parsed, common) ??
    platformRequest(parsed, common);
  if (request === undefined) usage("Unsupported add kind.");
  return request;
}

function resourceArtifactRequest(
  parsed: ParsedAddArguments,
  common: AddRequestBase,
): AddRequest | undefined {
  const values = parsed.values;
  switch (parsed.kind) {
    case "cache":
      return resourceRequest(common, "cache", requiredName(parsed), values);
    case "bucket":
      return resourceRequest(common, "bucket", requiredName(parsed), values);
    case "tool": {
      const target = one(values, "target");
      const createFunction = one(values, "create-function");
      if (target !== undefined && createFunction !== undefined)
        usage("--target and --create-function are exclusive.");
      return {
        ...common,
        kind: "tool",
        name: requiredName(parsed),
        target: required(target ?? createFunction, "--target or --create-function is required."),
        ...(createFunction === undefined ? {} : { createFunction: true }),
        sideEffect: choice(one(values, "side-effect"), "side-effect", SIDE_EFFECTS, "read")!,
        approval: choice(one(values, "approval"), "approval", APPROVALS, "never")!,
      };
    }
    case "prompt": {
      const text = many(values, "text").map((entry) => required(entry, "--text cannot be empty."));
      if (text.length === 0) usage("At least one --text is required.");
      return { ...common, kind: "prompt", name: requiredName(parsed), text };
    }
    case "agent":
      return agentRequest(common, requiredName(parsed), values);
  }
}

function platformRequest(
  parsed: ParsedAddArguments,
  common: AddRequestBase,
): AddRequest | undefined {
  const values = parsed.values;
  switch (parsed.kind) {
    case "constants":
      return { ...common, kind: "constants", name: requiredName(parsed) };
    case "route":
      return routeRequest(common, parsed.positional, values);
    case "middleware":
      return {
        ...common,
        kind: "middleware",
        name: requiredName(parsed),
        path: required(one(values, "path"), "--path is required."),
      };
    case "transform":
      return { ...common, kind: "transform", name: requiredName(parsed) };
    case "database":
      return {
        ...common,
        kind: "database",
        orm: choice(one(values, "orm"), "orm", ["drizzle"], "drizzle")!,
        dialect: choice(one(values, "dialect"), "dialect", DIALECTS, "sqlite")!,
      };
    case "auth":
      return {
        ...common,
        kind: "auth",
        adapter: choice(one(values, "adapter"), "adapter", ["better-auth"], "better-auth")!,
        databaseDialect: choice(
          one(values, "database-dialect"),
          "database-dialect",
          DIALECTS,
          "sqlite",
        )!,
        basePath: one(values, "base-path") ?? "/api/auth",
      };
  }
}

/**
 * Builds an agent request requiring exactly one prompt source.
 * @param common - Shared project, service and installation fields.
 * @param name - Agent artifact name.
 * @param values - Parsed values grouped by flag name.
 * @returns The agent request with ordered tools and either a prompt or inline instructions.
 */
function agentRequest(
  common: Omit<AddRequest, "kind">,
  name: string,
  values: ReadonlyMap<string, readonly string[]>,
): AddRequest {
  const prompt = one(values, "prompt");
  const instructions = one(values, "instructions");
  if ((prompt === undefined) === (instructions === undefined)) {
    usage("Exactly one of --prompt or --instructions is required.");
  }
  return {
    ...common,
    kind: "agent",
    name,
    ...optional("model", one(values, "model")),
    tools: many(values, "tool"),
    ...optional("prompt", prompt),
    ...optional("instructions", instructions),
  } as AddRequest;
}
/**
 * Validates route mode and method-to-member mappings.
 * @param common - Shared project, service and installation fields.
 * @param path - Requested route path.
 * @param values - Parsed values grouped by flag name.
 * @returns The route request with a required path and mode-appropriate mappings.
 */
function routeRequest(
  common: Omit<AddRequest, "kind">,
  path: string | undefined,
  values: ReadonlyMap<string, readonly string[]>,
): AddRequest {
  const mode = choice(one(values, "mode"), "mode", ["route", "service-route"]);
  if (mode === undefined) usage("--mode is required.");
  const maps = Object.fromEntries(many(values, "map").map(routeMap));
  if (mode === "route" && Object.keys(maps).length > 0) {
    usage("--map is supported only with --mode service-route.");
  }
  if (mode === "service-route" && Object.keys(maps).length === 0) {
    usage("A service route requires at least one --map METHOD=member.");
  }
  return { ...common, kind: "route", path: required(path, "route requires a path."), mode, maps };
}
/**
 * Parses a METHOD=member service route mapping.
 * @param value - Raw METHOD=member mapping.
 * @returns The uppercase supported method and nonempty member name.
 */
function routeMap(value: string): readonly [RouteMethod, string] {
  const separator = value.indexOf("=");
  const method = value.slice(0, separator).toUpperCase();
  const member = separator < 0 ? "" : value.slice(separator + 1).trim();
  if (!METHODS.includes(method as RouteMethod) || member === "")
    usage(`Invalid route map: ${value}`);
  return [method as RouteMethod, member];
}
