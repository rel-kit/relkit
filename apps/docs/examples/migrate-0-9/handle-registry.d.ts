/**
 * Stands in for the `.relkit/generated/context-registry.d.ts` that `relkit check` writes in a
 * real project, so `getRelkit().functions.orders` type-checks in the migrated example.
 */
declare global {
  namespace Relkit {
    interface HandleServices {
      readonly orders: (typeof import("./src/services/orders/service.js"))["default"];
    }
  }
}

export {};
