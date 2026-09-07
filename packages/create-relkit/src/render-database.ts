import { ADD_FAILURE_CODES, AddScaffoldError, type AddRequest } from "./add-types.js";
import { PlanBuilder } from "./plan-builder.js";
import { ensureEnvironment } from "./provider-planning.js";
import { authSchemaSource } from "./render-auth-schema.js";
import {
  databaseServiceSource,
  drizzleConfigSource,
  itemsSchemaSource,
} from "./render-database-sources.js";

export interface RenderedDatabase {
  readonly dialect: Extract<AddRequest, { kind: "database" }>["dialect"];
  readonly servicePath: string;
  readonly schemaPath: string;
}

export async function renderDatabase(
  builder: PlanBuilder,
  request: Extract<AddRequest, { kind: "database" }>,
): Promise<RenderedDatabase> {
  if (builder.discovery.services.some((service) => service.capability === "database")) {
    throw new AddScaffoldError(ADD_FAILURE_CODES.collision, "A database service already exists.");
  }
  const servicePath = "src/database/service.ts";
  const schemaPath = "src/database/schema/index.ts";
  await builder.create(servicePath, databaseServiceSource(request.dialect));
  await builder.create(
    schemaPath,
    request.authSchema ? authSchemaSource(request.dialect) : itemsSchemaSource(request.dialect),
  );
  await builder.create("drizzle.config.ts", drizzleConfigSource(request.dialect));
  for (const dependency of ["@relkit/drizzle", "drizzle-orm", "drizzle-kit"] as const) {
    builder.dependency(dependency);
  }
  builder.script("db:generate", "bun --bun drizzle-kit generate");
  builder.script("db:migrate", "bun --bun drizzle-kit migrate");
  await builder.gitignore("/drizzle/");
  if (request.dialect === "sqlite") {
    await ensureEnvironment(
      builder,
      "DATABASE_PATH",
      `env.string().default("./app.sqlite")`,
      "./app.sqlite",
    );
    await builder.gitignore("*.sqlite");
    await builder.gitignore("*.sqlite-*");
  } else {
    await ensureEnvironment(builder, "DATABASE_URL", "env.string()");
    builder.warning(
      "database-url-required",
      "Populate DATABASE_URL before starting the database service.",
    );
  }
  builder.nextStep("bun run db:generate");
  builder.nextStep("bun run db:migrate");
  builder.registerArtifact("service", {
    domain: "database",
    path: servicePath,
    binding: "database",
    id: "database",
  });
  return { dialect: request.dialect, servicePath, schemaPath };
}
