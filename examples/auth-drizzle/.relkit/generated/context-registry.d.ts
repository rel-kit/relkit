type RelkitApplicationEnv = import("@relkit/config").ResolvedEnv<typeof import("../../relkit.config.js")["default"]["env"]["shape"]>;

declare global {
  namespace Relkit {
    interface ApplicationEnv extends RelkitApplicationEnv {}
    interface ApplicationContextRegistry {
    readonly database: import("@relkit/drizzle").DatabaseContext<typeof import("../../src/services/database/service.js")["default"]>;
    readonly auth: import("@relkit/functions").AuthContext<import("@relkit/better-auth").InferBetterAuthSession<typeof import("../../src/services/auth/service.js")["default"]["handler"]>>;
    }
    interface TaskRegistry {
    }
    interface JobRegistry {
    }
  }
}

export {};
