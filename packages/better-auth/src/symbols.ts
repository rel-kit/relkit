/** Brands a stable route handler with its owning auth declaration. */
export const BETTER_AUTH_HANDLER = Symbol.for("relkit.better-auth.handler");

/** Stores server-only lazy activation state without exposing it publicly. */
export const BETTER_AUTH_RUNTIME = Symbol.for("relkit.better-auth.runtime");
