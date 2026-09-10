import { type AddRequest, type RouteMethod, type ServiceInclude } from "./add-types.js";
import {
  choice,
  many,
  one,
  optional,
  parseAddArguments,
  required,
  usage,
} from "./add-options-parser.js";
import { resourceRequest } from "./add-options-resource.js";

const DELIVERIES = ["transient", "durable"] as const;
const SIDE_EFFECTS = ["none", "read", "write", "external"] as const;
const APPROVALS = ["never", "on-write", "always"] as const;
const DIALECTS = ["sqlite", "postgresql", "mysql"] as const;
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

/** Parses one complete non-interactive `relkit add` request. */
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
  const name = (): string => required(parsed.positional, `${parsed.kind} requires a name.`);

  switch (parsed.kind) {
    case "service": {
      const include = many(values, "include").map(serviceInclude);
      if (parsed.flags.has("full") && include.length > 0)
        usage("--full and --include are exclusive.");
      return { ...common, kind: "service", name: name(), full: parsed.flags.has("full"), include };
    }
    case "function":
      return { ...common, kind: "function", name: name(), internal: parsed.flags.has("internal") };
    case "error":
      return { ...common, kind: "error", name: name() };
    case "event":
      return {
        ...common,
        kind: "event",
        name: name(),
        internal: parsed.flags.has("internal"),
        ...optional("profile", one(values, "profile")),
      };
    case "event-function":
      return {
        ...common,
        kind: "event-function",
        name: name(),
        event: required(one(values, "event"), "--event is required."),
        delivery: choice(one(values, "delivery"), "delivery", DELIVERIES, "durable")!,
        ...optional("profile", one(values, "profile")),
      };
    case "job":
      return {
        ...common,
        kind: "job",
        name: name(),
        target: required(one(values, "target"), "--target is required."),
        ...optional("profile", one(values, "profile")),
      };
    case "cache":
      return resourceRequest(common, "cache", name(), values);
    case "bucket":
      return resourceRequest(common, "bucket", name(), values);
    case "tool": {
      const target = one(values, "target");
      const createFunction = one(values, "create-function");
      if (target !== undefined && createFunction !== undefined)
        usage("--target and --create-function are exclusive.");
      return {
        ...common,
        kind: "tool",
        name: name(),
        target: required(target ?? createFunction, "--target or --create-function is required."),
        ...(createFunction === undefined ? {} : { createFunction: true }),
        sideEffect: choice(one(values, "side-effect"), "side-effect", SIDE_EFFECTS, "read")!,
        approval: choice(one(values, "approval"), "approval", APPROVALS, "never")!,
      };
    }
    case "prompt": {
      const text = many(values, "text").map((entry) => required(entry, "--text cannot be empty."));
      if (text.length === 0) usage("At least one --text is required.");
      return { ...common, kind: "prompt", name: name(), text };
    }
    case "agent":
      return agentRequest(common, name(), values);
    case "constants":
      return { ...common, kind: "constants", name: name() };
    case "route":
      return routeRequest(common, parsed.positional, values);
    case "middleware":
      return {
        ...common,
        kind: "middleware",
        name: name(),
        path: required(one(values, "path"), "--path is required."),
      };
    case "transform":
      return { ...common, kind: "transform", name: name() };
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

function routeMap(value: string): readonly [RouteMethod, string] {
  const separator = value.indexOf("=");
  const method = value.slice(0, separator).toUpperCase();
  const member = separator < 0 ? "" : value.slice(separator + 1).trim();
  if (!METHODS.includes(method as RouteMethod) || member === "")
    usage(`Invalid route map: ${value}`);
  return [method as RouteMethod, member];
}

function serviceInclude(value: string): ServiceInclude {
  const excluded = new Set(["service", "database", "auth", "middleware", "transform"]);
  if (excluded.has(value)) usage(`Unsupported service include: ${value}`);
  return value as ServiceInclude;
}
