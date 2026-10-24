/** Borrows database admission and resolves its existing native declaration brand. */
import { drizzleRuntimeOf, withDrizzleSqliteWork, withDrizzleWork } from "@relkit/drizzle/internal";
import type { Effect } from "effect";
import type { AuthDatabase } from "./auth.types.js";

/** Keeps SQLite serialization and owner drain admission around the complete SDK call. */
export function withAuthWork<A, E, R>(database: AuthDatabase, effect: Effect.Effect<A, E, R>) {
  return withDrizzleWork(database, withDrizzleSqliteWork(database, effect));
}

/** Reads the established native brand; auth never acquires another database owner. */
export function databaseServiceOf(activation: AuthDatabase) {
  const service: unknown = Reflect.get(activation, Symbol.for("relkit.drizzle.service"));
  if (service === null || typeof service !== "object")
    throw new TypeError("Drizzle activation is missing its service");
  return service as Parameters<typeof drizzleRuntimeOf>[0];
}
