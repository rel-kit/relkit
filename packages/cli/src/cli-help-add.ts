import { argument, command, option, title } from "./cli-help-builders.js";

const projectRoot = option("project-root", "string", "Application directory (defaults to cwd)");
const common = [
  projectRoot,
  option(
    "service",
    "string",
    "Existing generic service for domain artifacts or service routes; exclusive with --create-service",
  ),
  option(
    "create-service",
    "string",
    "Create and use a new generic service for a domain artifact or service route",
  ),
  option("no-install", "boolean", "Do not install newly required packages"),
] as const;

const profile = option(
  "profile",
  "string",
  "Compatible profile name; otherwise reuse a default/unique profile or scaffold a local profile",
);
const internal = option("internal", "boolean", "Keep the artifact out of the public service API");
const named = (
  name: string,
  description: string,
  options: readonly ReturnType<typeof option>[] = [],
) =>
  command(name, description, `relkit add ${name} [name]`, {
    arguments: [argument("name", false, `${title(name)} name`)],
    options: [...common, ...options],
  });

export const addHelp = command("add", "Add a compile-ready artifact", "relkit add <kind>", {
  commands: [
    named("service", "Create a domain service", [
      option(
        "full",
        "boolean",
        "Create the complete deterministic domain bundle; exclusive with --include",
      ),
      option(
        "include",
        "choice",
        "Artifact kind to include; repeatable",
        [],
        [
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
          "route",
        ],
        true,
      ),
    ]),
    named("function", "Create a callable function", [internal]),
    named("error", "Create an internal typed error"),
    named("event", "Create an event contract", [internal, profile]),
    named("event-function", "Create an event-only function", [
      option("event", "string", "Event ID, binding, or filename"),
      option(
        "delivery",
        "choice",
        "Delivery mode (default: durable)",
        [],
        ["transient", "durable"],
      ),
      profile,
    ]),
    named("job", "Create an unscheduled single-attempt job", [
      option("target", "string", "Callable function target"),
      profile,
    ]),
    named("cache", "Create a cache descriptor and compatible profile", [
      profile,
      option("provider", "choice", "Cache provider", [], ["redis", "cloudflare-kv"]),
      option("source", "choice", "Provider source", [], ["docker", "connected", "aws"]),
    ]),
    named("bucket", "Create a bucket descriptor and compatible profile", [
      profile,
      option("provider", "choice", "Bucket provider", [], ["s3", "cloudflare-r2"]),
      option("source", "choice", "Provider source", [], ["docker", "connected", "aws"]),
    ]),
    named("tool", "Expose a callable function as an agent tool", [
      option("target", "string", "Callable function target"),
      option(
        "side-effect",
        "choice",
        "Tool side-effect class (default: read)",
        [],
        ["none", "read", "write", "external"],
      ),
      option(
        "approval",
        "choice",
        "Tool approval policy (default: never)",
        [],
        ["never", "on-write", "always"],
      ),
    ]),
    named("prompt", "Create a reusable prompt", [
      option("text", "string", "Prompt text; repeatable", [], undefined, true),
    ]),
    named("agent", "Create an agent with a model, tools, and instructions", [
      option("model", "string", "Model selector such as openai:gpt-5-mini"),
      option("tool", "string", "Tool ID, binding, or filename; repeatable", [], undefined, true),
      option(
        "prompt",
        "string",
        "Service prompt ID, binding, or filename; exclusive with --instructions",
      ),
      option(
        "instructions",
        "string",
        "Inline instructions; exactly one of --prompt or --instructions is required",
      ),
      option(
        "model-provider",
        "choice",
        "Provider for a new model profile; requires --model-id",
        [],
        ["openai", "anthropic"],
      ),
      option("model-id", "string", "Default model ID for a new profile; requires --model-provider"),
    ]),
    named("constants", "Create a constants descriptor"),
    command("route", "Create a route or service route", "relkit add route [path]", {
      arguments: [argument("path", false, "URL route path")],
      options: [
        ...common,
        option(
          "mode",
          "choice",
          "Required headlessly: raw GET route or public service-member mappings",
          [],
          ["route", "service-route"],
        ),
        option("map", "key=value", "METHOD=member mapping; repeatable", [], undefined, true),
      ],
    }),
    named("middleware", "Create pass-through route middleware", [
      option("path", "string", "Validated middleware route scope"),
    ]),
    named("transform", "Create a string request transform"),
    command("database", "Create the singleton Drizzle database service", "relkit add database", {
      options: [
        ...common,
        option("orm", "choice", "Database ORM", [], ["drizzle"]),
        option(
          "dialect",
          "choice",
          "Database dialect (default: sqlite)",
          [],
          ["sqlite", "postgresql", "mysql"],
        ),
      ],
    }),
    command("auth", "Create Better Auth and its catch-all route", "relkit add auth", {
      options: [
        ...common,
        option("adapter", "choice", "Authentication adapter", [], ["better-auth"]),
        option(
          "database-dialect",
          "choice",
          "Database dialect when one must be created (default: sqlite)",
          [],
          ["sqlite", "postgresql", "mysql"],
        ),
        option("base-path", "string", "Auth base path (default: /api/auth)"),
      ],
    }),
  ],
});
