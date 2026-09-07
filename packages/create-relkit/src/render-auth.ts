import { dirname, posix } from "node:path";
import { routePathToFilePath } from "@relkit/compiler";
import { ADD_FAILURE_CODES, AddScaffoldError, type AddRequest } from "./add-types.js";
import { PlanBuilder } from "./plan-builder.js";
import type { DiscoveredService } from "./project-discovery-types.js";
import { ensureEnvironment } from "./provider-planning.js";
import { authSchemaSource } from "./render-auth-schema.js";
import { authRouteSource, authServiceSource } from "./render-auth-sources.js";
import { renderDatabase, type RenderedDatabase } from "./render-database.js";
import { addSourceExport } from "./source-edit.js";

const AUTH_TABLES = ["user", "session", "account", "verification"] as const;

export async function renderAuth(
  builder: PlanBuilder,
  request: Extract<AddRequest, { kind: "auth" }>,
): Promise<void> {
  if (builder.discovery.services.some((service) => service.capability === "auth")) {
    collision("An auth service already exists.");
  }
  validateBasePath(request.basePath);
  const existing = builder.discovery.services.filter(
    (service) => service.capability === "database",
  );
  if (existing.length > 1) collision("Multiple database services exist.");
  const database = existing[0]
    ? existingDatabase(existing[0], request.databaseDialect)
    : await renderDatabase(builder, {
        kind: "database",
        projectRoot: builder.discovery.projectRoot,
        install: request.install,
        orm: "drizzle",
        dialect: request.databaseDialect,
        authSchema: true,
      });
  if (existing[0]) await addAuthSchema(builder, database);
  await builder.create("src/auth/service.ts", authServiceSource());
  await builder.create(routePathToFilePath(`${request.basePath}/*auth?`), authRouteSource());
  builder.dependency("@relkit/better-auth");
  builder.dependency("better-auth");
  await ensureEnvironment(builder, "BETTER_AUTH_SECRET", "env.secret()");
  await ensureEnvironment(
    builder,
    "BETTER_AUTH_URL",
    `env.url().default(new URL("http://127.0.0.1:3000"))`,
    "http://127.0.0.1:3000",
  );
  builder.warning(
    "auth-secret-required",
    "Populate BETTER_AUTH_SECRET with a strong secret before starting auth.",
  );
  builder.nextStep("Set BETTER_AUTH_SECRET in your environment.");
  builder.registerArtifact("service", {
    domain: "auth",
    path: "src/auth/service.ts",
    binding: "auth",
    id: "auth",
  });
}

async function addAuthSchema(builder: PlanBuilder, database: RenderedDatabase): Promise<void> {
  const directory = dirname(database.schemaPath).replaceAll("\\", "/");
  await assertNoAuthTables(builder.discovery.projectRoot, directory);
  await builder.create(`${directory}/auth.ts`, authSchemaSource(database.dialect));
  await builder.update(database.schemaPath, (source) =>
    addSourceExport(source, database.schemaPath, `export * from "./auth.js";`),
  );
}

async function assertNoAuthTables(root: string, directory: string): Promise<void> {
  const files = await Array.fromAsync(
    new Bun.Glob("**/*.ts").scan({ cwd: posix.join(root, directory) }),
  );
  for (const file of files) {
    const source = await Bun.file(posix.join(root, directory, file)).text();
    if (AUTH_TABLES.some((name) => new RegExp(`\\bexport\\s+const\\s+${name}\\b`).test(source))) {
      collision(`The database schema already exports Better Auth table names (${file}).`);
    }
  }
}

function existingDatabase(
  service: DiscoveredService,
  requested: RenderedDatabase["dialect"],
): RenderedDatabase {
  if (!service.dialect || !service.schemaPath) {
    unsupported(
      "The existing database service has no statically discoverable dialect or schema import.",
    );
  }
  if (service.dialect !== requested) {
    collision(`The existing database uses ${service.dialect}, not ${requested}.`);
  }
  return { dialect: service.dialect, servicePath: service.path, schemaPath: service.schemaPath };
}

function validateBasePath(value: string): void {
  if (!/^\/(?:[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*)?$/.test(value) || value === "/") {
    usage(`Invalid auth base path: ${value}`);
  }
}

function collision(message: string): never {
  throw new AddScaffoldError(ADD_FAILURE_CODES.collision, message);
}
function unsupported(message: string): never {
  throw new AddScaffoldError(ADD_FAILURE_CODES.unsupportedSourceShape, message);
}
function usage(message: string): never {
  throw new AddScaffoldError(ADD_FAILURE_CODES.usage, message);
}
