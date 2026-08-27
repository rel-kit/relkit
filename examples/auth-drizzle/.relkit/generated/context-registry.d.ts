declare global {
  namespace Relkit {
    interface ApplicationContextRegistry {
    readonly database: import("@relkit/drizzle").DatabaseContext<typeof import("../../src/data/auth.data-model.js")["default"]>;
    readonly auth: import("@relkit/functions").AuthContext<import("@relkit/better-auth").InferBetterAuthSession<typeof import("../../src/routes/api/auth/[[...auth]]/route.js")["ALL"]["handler"]>>;
    }
  }
}

export {};
