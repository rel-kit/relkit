/** Defines database navigation and grouped native Drizzle/auth example relations without acquiring persistence resources. */
import { feature, type ApiPackage } from "./documentation-catalog.js";

export const databaseFeature = feature(
  "database",
  "Database",
  "Organize application data, choose a database service, and customize persistence.",
  "database/index",
  "drizzle",
  [
    ["packages/drizzle/src/service.ts", "defineDrizzleService"],
    ["packages/drizzle/src/model.ts", "defineModel"],
    ["packages/drizzle/src/activation.ts", "activateDrizzleService"],
  ],
  ["examples/data-model/src/services/database/service.ts"],
);

export const databaseGuideGroup = {
  directory: "database",
  title: "Database",
  icon: "Database",
  pages: [
    "index",
    "drizzle",
    "define",
    "schema",
    "generated-schemas",
    "queries",
    "models",
    "overrides",
    "transactions",
    "migrations",
    "better-auth",
    "testing",
    "first-database",
  ],
} as const;

export const databaseGuideRelations = [
  {
    path: "database/index",
    api: ["services"],
    examples: ["examples/data-model/src/services/users/service.ts"],
  },
  {
    path: "database/drizzle",
    api: ["drizzle", "services"],
    examples: ["examples/data-model/src/services/database/service.ts"],
  },
  {
    path: "database/define",
    api: ["drizzle", "config"],
    examples: ["examples/data-model/src/services/database/service.ts"],
  },
  {
    path: "database/schema",
    api: ["drizzle", "schema"],
    examples: ["examples/data-model/src/services/database/schema/index.ts"],
  },
  {
    path: "database/queries",
    api: ["drizzle", "functions"],
    examples: ["examples/data-model/src/services/users/functions/update-user-email.function.ts"],
  },
  {
    path: "database/generated-schemas",
    api: ["drizzle", "schema"],
    examples: ["examples/data-model/src/services/users/functions/register-member.function.ts"],
  },
  {
    path: "database/models",
    api: ["drizzle"],
    examples: ["examples/data-model/src/services/database/models/users.model.ts"],
  },
  {
    path: "database/overrides",
    api: ["drizzle"],
    examples: ["examples/data-model/src/services/database/service.ts"],
  },
  {
    path: "database/transactions",
    api: ["drizzle"],
    examples: ["examples/data-model/src/services/users/functions/register-member.function.ts"],
  },
  {
    path: "database/migrations",
    api: ["drizzle"],
    examples: ["examples/data-model/drizzle.config.ts"],
  },
  {
    path: "database/better-auth",
    api: ["drizzle", "routes"],
    examples: [
      "examples/auth-drizzle/src/services/auth/service.ts",
      "examples/auth-drizzle/src/services/database/schema/index.ts",
    ],
  },
  {
    path: "database/testing",
    api: ["drizzle", "testing"],
    examples: ["examples/data-model/tests/data-model.test.ts"],
  },
  {
    path: "database/first-database",
    api: ["drizzle", "functions", "routes"],
    examples: ["examples/data-model/src/services/users/functions/register-member.function.ts"],
  },
] satisfies readonly { path: string; api: readonly ApiPackage[]; examples: readonly string[] }[];
