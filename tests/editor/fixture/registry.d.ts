/** The registries `relkit dev` and `relkit check` generate, written by hand in the generator's form. */
type RelkitApplicationEnv = import("relkit/config").ResolvedEnv<
  (typeof import("./relkit.config.js"))["default"]["env"]["shape"]
>;

declare global {
  namespace Relkit {
    interface ApplicationEnv extends RelkitApplicationEnv {}
    interface ApplicationContextRegistry {
      readonly database: import("@relkit/drizzle").DatabaseContext<
        (typeof import("./database.js"))["default"]
      >;
      readonly auth: import("relkit/functions").AuthContext<
        import("@relkit/better-auth").InferBetterAuthSession<
          (typeof import("./auth.js"))["default"]["handler"]
        >
      >;
    }
    interface TaskRegistry {
      readonly "orders.export": (typeof import("./export.task.js"))["default"];
    }
    interface JobRegistry {
      readonly "orders.export": (typeof import("./export.job.js"))["default"];
    }
    interface HandleServices {
      readonly auth: (typeof import("./auth.js"))["default"];
      readonly database: (typeof import("./database.js"))["default"];
      readonly orders: (typeof import("./service.js"))["default"];
    }
    interface HandleDatabases {
      readonly database: (typeof import("./database.js"))["default"];
    }
    interface HandleCaches {
      readonly "orders.prices": (typeof import("./prices.cache.js"))["default"];
    }
    interface HandleBuckets {
      readonly "orders.uploads": (typeof import("./uploads.bucket.js"))["default"];
    }
    interface HandleChannels {
      readonly "orders.updates": (typeof import("./order-updates.channel.js"))["default"];
    }
    interface HandleAgents {}
    interface EventRegistry {
      readonly "orders.placed": (typeof import("./order-placed.event.js"))["default"];
    }
  }
}

declare module "@relkit/client" {
  interface ClientApi {
    readonly orders: {
      readonly createOrder: import("@relkit/client").ApiRoute<
        import("@relkit/client").ClientRouteContract<
          { orderId: string; quantity: number; sku: string },
          { orderId: string; totalCents: number },
          | import("@relkit/client").RelkitDeclaredError<
              "orders.not-found",
              404,
              { orderId: string }
            >
          | import("@relkit/client").RelkitUndeclaredError
        > & { readonly operation: "mutation" }
      >;
    };
  }
}

export {};
