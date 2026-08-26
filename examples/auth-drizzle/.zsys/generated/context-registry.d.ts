declare global {
  namespace Zsys {
    interface ApplicationContextRegistry {
    readonly database: import("@zsys/drizzle").DatabaseContext<typeof import("../../src/data/auth.data-model.js")["default"]>;
    readonly auth: import("@zsys/functions").AuthContext<import("@zsys/better-auth").InferBetterAuthSession<typeof import("../../src/routes/api/auth/[[...auth]]/route.js")["ALL"]["handler"]>>;
    }
  }
}

export {};
