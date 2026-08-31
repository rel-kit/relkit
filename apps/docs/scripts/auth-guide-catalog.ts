import { feature, type ApiPackage } from "./documentation-catalog.js";

export const authFeature = feature(
  "auth",
  "Authentication",
  "Configure authentication, read request sessions, and protect application entry points.",
  "auth/index",
  "better-auth",
  [["packages/better-auth/src/index.ts", "defineBetterAuthService"]],
  ["examples/auth-drizzle/src/auth/service.ts"],
);

export const authGuideGroup = {
  directory: "auth",
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
    "first-auth",
  ],
} as const;

export const authGuideRelations = [
  {
    path: "auth/index",
    api: ["better-auth", "services"],
    examples: ["examples/auth-drizzle/src/auth/service.ts"],
  },
  {
    path: "auth/better-auth",
    api: ["better-auth", "drizzle", "config"],
    examples: ["examples/auth-drizzle/src/auth/service.ts"],
  },
  {
    path: "auth/sessions",
    api: ["better-auth", "functions"],
    examples: ["examples/auth-drizzle/src/account/functions/session.function.ts"],
  },
  {
    path: "auth/protect-routes",
    api: ["better-auth", "routes"],
    examples: ["examples/auth-drizzle/src/routes/api/auth/[[...auth]]/route.ts"],
  },
  {
    path: "auth/clients",
    api: ["better-auth", "client"],
    examples: [
      "examples/auth-drizzle/src/platform/auth-client.ts",
      "examples/auth-drizzle/public/index.html",
    ],
  },
  {
    path: "auth/customization",
    api: ["better-auth", "drizzle"],
    examples: [
      "examples/auth-drizzle/src/auth/service.ts",
      "examples/auth-drizzle/src/database/schema/index.ts",
    ],
  },
  {
    path: "auth/testing",
    api: ["testing", "better-auth"],
    examples: ["examples/auth-drizzle/tests/auth.test.ts"],
  },
  {
    path: "auth/first-auth",
    api: ["better-auth", "drizzle", "routes"],
    examples: ["examples/auth-drizzle/README.md"],
  },
] satisfies readonly { path: string; api: readonly ApiPackage[]; examples: readonly string[] }[];
