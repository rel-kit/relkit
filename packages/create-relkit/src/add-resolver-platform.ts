import { ADD_FAILURE_CODES, AddScaffoldError, type RouteMethod } from "./add-types.js";
import { resolveService, selectedDomain } from "./add-resolution-discovery.js";
import { AddResolutionState, choices, label } from "./add-resolution-state.js";
import type { ProjectDiscovery } from "./project-discovery-types.js";

const METHODS: readonly RouteMethod[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
];

export async function resolvePlatformOptions(
  state: AddResolutionState,
  discovery: ProjectDiscovery,
): Promise<void> {
  const kind = state.parsed.kind;
  if (kind === "route") await routeOptions(state, discovery);
  else if (kind === "middleware" && !state.has("path")) {
    const path = await state.text("Middleware route scope", "*");
    if (path) state.option("path", path);
  } else if (kind === "database") await databaseOptions(state);
  else if (kind === "auth") await authOptions(state, discovery);
}

async function routeOptions(state: AddResolutionState, discovery: ProjectDiscovery): Promise<void> {
  if (!state.parsed.positional) {
    const path = await state.text("Route path", "/");
    if (path) state.positional(path);
  }
  if (!state.has("mode")) {
    const mode = await state.select(
      "Route type",
      [
        { value: "route", label: "Route", hint: "standalone GET handler" },
        { value: "service-route", label: "Service route", hint: "map methods to public members" },
      ],
      "route",
    );
    if (mode) state.option("mode", mode);
  }
  if (state.parsed.values.get("mode")?.[0] !== "service-route") return;
  await resolveService(state, discovery);
  if (state.has("map") || !state.interactive) return;
  const methods = await state.multiselect("HTTP methods", choices(METHODS), true);
  if (!methods) return;
  const domain = selectedDomain(state, discovery);
  const service = discovery.services.find(
    (item) => item.capability === "generic" && item.domain === domain,
  );
  for (const method of methods) {
    if (service?.members.length) {
      const member = await state.select(
        `${method} public member`,
        service.members.map((item) => ({
          value: item.name,
          label: label(item.name),
        })),
      );
      if (member) state.args.push("--map", `${method}=${member}`);
    } else {
      const member = await state.text(`${method} function to create`, "Example", true);
      if (member) state.args.push("--map", `${method}=${member}`);
    }
  }
}

async function databaseOptions(state: AddResolutionState): Promise<void> {
  if (!state.has("orm")) {
    const accepted = await state.confirm("Use Drizzle ORM?", true);
    if (accepted === false) cancelled("Database scaffolding requires Drizzle ORM.");
    if (accepted) state.option("orm", "drizzle");
  }
  if (!state.has("dialect")) {
    const dialect = await state.select(
      "Database dialect",
      choices(["sqlite", "postgresql", "mysql"]),
      "sqlite",
    );
    if (dialect) state.option("dialect", dialect);
  }
}

async function authOptions(state: AddResolutionState, discovery: ProjectDiscovery): Promise<void> {
  if (!state.has("adapter")) {
    const accepted = await state.confirm("Use Better Auth?", true);
    if (accepted === false) cancelled("Auth scaffolding requires Better Auth.");
    if (accepted) state.option("adapter", "better-auth");
  }
  const databases = discovery.services.filter((service) => service.capability === "database");
  if (!state.has("database-dialect") && databases.length === 1 && databases[0]!.dialect) {
    state.option("database-dialect", databases[0]!.dialect!);
  } else if (!state.has("database-dialect") && state.interactive) {
    if (databases.length === 0) {
      const accepted = await state.confirm(
        "No database exists. Create a Drizzle database first?",
        true,
      );
      if (accepted === false) cancelled("Auth requires a database service.");
    }
    const dialect = await state.select(
      "Database dialect",
      choices(["sqlite", "postgresql", "mysql"]),
      "sqlite",
    );
    if (dialect) state.option("database-dialect", dialect);
  }
  if (!state.has("base-path")) {
    const path = await state.text("Auth base path", "/api/auth");
    if (path) state.option("base-path", path);
  }
}

function cancelled(message: string): never {
  throw new AddScaffoldError(ADD_FAILURE_CODES.cancellation, message);
}
