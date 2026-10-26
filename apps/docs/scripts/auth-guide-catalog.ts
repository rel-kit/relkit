/** Defines auth navigation and native Better Auth example relations; catalog construction acquires no auth or database client. */
import { feature, type ApiPackage } from "./documentation-catalog.js";

export const authFeature = feature(
  "auth",
  "Authentication",
  "Configure authentication, read request sessions, and protect application entry points.",
  "docs/modules/auth/index",
  "better-auth",
  [["packages/better-auth/src/index.ts", "defineBetterAuthService"]],
  ["examples/auth-drizzle/src/services/auth/service.ts"],
);

export const authGuideGroup = {
  directory: "docs/modules/auth",
  title: "Auth",
  icon: "ShieldCheck",
  pages: [
    "index",
    "better-auth",
    "sessions",
    "protect-routes",
    "clients",
    "customization",
    "testing",
  ],
} as const;

export const authGuideRelations = [
  {
    path: "docs/modules/auth/index",
    api: ["better-auth", "services"],
    examples: ["examples/auth-drizzle/src/services/auth/service.ts"],
  },
  {
    path: "docs/modules/auth/better-auth",
    api: ["better-auth", "drizzle", "config"],
    examples: ["examples/auth-drizzle/src/services/auth/service.ts"],
  },
  {
    path: "docs/modules/auth/sessions",
    api: ["better-auth", "functions"],
    examples: ["examples/auth-drizzle/src/services/account/functions/session.function.ts"],
  },
  {
    path: "docs/modules/auth/protect-routes",
    api: ["better-auth", "routes"],
    examples: ["examples/auth-drizzle/src/routes/api/auth/[[...auth]]/route.ts"],
  },
  {
    path: "docs/modules/auth/clients",
    api: ["better-auth", "client"],
    examples: [
      "examples/auth-drizzle/src/platform/auth-client.ts",
      "examples/auth-drizzle/public/index.html",
    ],
  },
  {
    path: "docs/modules/auth/customization",
    api: ["better-auth", "drizzle"],
    examples: [
      "examples/auth-drizzle/src/services/auth/service.ts",
      "examples/auth-drizzle/src/services/database/schema/index.ts",
    ],
  },
  {
    path: "docs/modules/auth/testing",
    api: ["testing", "better-auth"],
    examples: ["examples/auth-drizzle/tests/auth.test.ts"],
  },
  {
    path: "guides/auth/email-password-sign-in",
    api: ["better-auth", "drizzle", "routes"],
    examples: ["examples/auth-drizzle/README.md"],
  },
] satisfies readonly { path: string; api: readonly ApiPackage[]; examples: readonly string[] }[];
