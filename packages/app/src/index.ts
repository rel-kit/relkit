/**
 * The deprecated `@relkit/app` root keeps the surface the `relkit` root had before it became a
 * curated list, so applications keep working until `relkit migrate` rewrites their imports.
 */
import "./deprecated.js";

export * from "relkit/app";
