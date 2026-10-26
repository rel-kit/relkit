/** Defines database navigation and grouped native Drizzle/auth example relations without acquiring persistence resources. */
import { feature, type ApiPackage } from "./documentation-catalog.js";

export const databaseFeature = feature(
  "database",
  "Database",
  "Organize application data, choose a database service, and customize persistence.",
  "docs/modules/database/index",
  "drizzle",
  [
    ["packages/drizzle/src/service.ts", "defineDrizzleService"],
    ["packages/drizzle/src/model.ts", "defineModel"],
    ["packages/drizzle/src/activation.ts", "activateDrizzleService"],
  ],
  ["examples/data-model/src/services/database/service.ts"],
);

export const databaseGuideGroup = {
  directory: "docs/modules/database",
  title: "Database",
  icon: "Database",
  pages: [
    "index",
    "local-docker",
    "drizzle",
    "define",
    "schema",
    "migrations",
    "generated-schemas",
    "queries",
    "models",
    "overrides",
    "transactions",
    "better-auth",
    "testing",
  ],
} as const;

export const databaseGuideRelations = [
  {
    path: "docs/modules/database/local-docker",
    api: ["drizzle", "config", "app"],
    examples: ["apps/docs/examples/setup/postgresql.ts", "apps/docs/examples/setup/compose.yaml"],
  },
  {
    path: "docs/modules/database/index",
    api: ["services"],
    examples: ["examples/data-model/src/services/users/service.ts"],
  },
  {
    path: "docs/modules/database/drizzle",
    api: ["drizzle", "services"],
    examples: ["examples/data-model/src/services/database/service.ts"],
  },
  {
    path: "docs/modules/database/define",
    api: ["drizzle", "config"],
    examples: ["examples/data-model/src/services/database/service.ts"],
  },
  {
    path: "docs/modules/database/schema",
    api: ["drizzle", "schema"],
    examples: ["examples/data-model/src/services/database/schema/index.ts"],
  },
  {
    path: "docs/modules/database/queries",
    api: ["drizzle", "functions"],
    examples: ["examples/data-model/src/services/users/functions/update-user-email.function.ts"],
  },
  {
    path: "docs/modules/database/generated-schemas",
    api: ["drizzle", "schema"],
    examples: ["examples/data-model/src/services/users/functions/register-member.function.ts"],
  },
  {
    path: "docs/modules/database/models",
    api: ["drizzle"],
    examples: ["examples/data-model/src/services/database/models/users.model.ts"],
  },
  {
    path: "docs/modules/database/overrides",
    api: ["drizzle"],
    examples: ["examples/data-model/src/services/database/service.ts"],
  },
  {
    path: "docs/modules/database/transactions",
    api: ["drizzle"],
    examples: ["examples/data-model/src/services/users/functions/register-member.function.ts"],
  },
  {
    path: "docs/modules/database/migrations",
    api: ["drizzle"],
    examples: ["examples/data-model/drizzle.config.ts"],
  },
  {
    path: "docs/modules/database/better-auth",
    api: ["drizzle", "routes"],
    examples: [
      "examples/auth-drizzle/src/services/auth/service.ts",
      "examples/auth-drizzle/src/services/database/schema/index.ts",
    ],
  },
  {
    path: "docs/modules/database/testing",
    api: ["drizzle", "testing"],
    examples: ["examples/data-model/tests/data-model.test.ts"],
  },
  {
    path: "guides/database/register-users-in-a-transaction",
    api: ["drizzle", "functions", "routes"],
    examples: ["examples/data-model/src/services/users/functions/register-member.function.ts"],
  },
] satisfies readonly { path: string; api: readonly ApiPackage[]; examples: readonly string[] }[];
