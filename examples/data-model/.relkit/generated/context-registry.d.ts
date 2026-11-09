type RelkitApplicationEnv = import("relkit/config").ResolvedEnv<typeof import("../../relkit.config.js")["default"]["env"]["shape"]>;

declare global {
  namespace Relkit {
    interface ApplicationEnv extends RelkitApplicationEnv {}
    interface ApplicationContextRegistry {
    readonly database: import("@relkit/drizzle").DatabaseContext<typeof import("../../src/services/database/service.js")["default"]>;
    }
    interface TaskRegistry {
    }
    interface JobRegistry {
    }
    interface HandleServices {
    readonly "database": typeof import("../../src/services/database/service.js")["default"];
    readonly "users": typeof import("../../src/services/users/service.js")["default"];
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
