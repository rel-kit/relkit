declare global {
  namespace Relkit {
    interface ApplicationContextRegistry {
    readonly database: import("@relkit/drizzle").DatabaseContext<typeof import("../../src/data/application.data-model.js")["default"]>;
    }
  }
}

export {};
