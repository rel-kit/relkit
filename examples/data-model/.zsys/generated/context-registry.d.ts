declare global {
  namespace Zsys {
    interface ApplicationContextRegistry {
    readonly database: import("@zsys/drizzle").DatabaseContext<typeof import("../../src/data/application.data-model.js")["default"]>;
    }
  }
}

export {};
