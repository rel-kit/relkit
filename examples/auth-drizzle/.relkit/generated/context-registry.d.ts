type RelkitApplicationEnv = import("relkit/config").ResolvedEnv<typeof import("../../relkit.config.js")["default"]["env"]["shape"]>;

declare global {
  namespace Relkit {
    interface ApplicationEnv extends RelkitApplicationEnv {}
    interface ApplicationContextRegistry {
    readonly database: import("@relkit/drizzle").DatabaseContext<typeof import("../../src/services/database/service.js")["default"]>;
    readonly auth: import("relkit/functions").AuthContext<import("@relkit/better-auth").InferBetterAuthSession<typeof import("../../src/services/auth/service.js")["default"]["handler"]>>;
    }
    interface TaskRegistry {
    }
    interface JobRegistry {
    }
    interface HandleServices {
    readonly "account": typeof import("../../src/services/account/service.js")["default"];
    readonly "auth": typeof import("../../src/services/auth/service.js")["default"];
    readonly "database": typeof import("../../src/services/database/service.js")["default"];
    }
    interface HandleDatabases {
    readonly "database": typeof import("../../src/services/database/service.js")["default"];
    }
    interface HandleCaches {
    }
    interface HandleBuckets {
    }
    interface HandleChannels {
    }
    interface HandleAgents {
    }
  }
}

export {};
