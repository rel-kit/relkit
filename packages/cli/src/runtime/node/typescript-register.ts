/**
 * Registers the TypeScript module hooks for one Node process. The CLI starts every Node child
 * that evaluates application sources with `--import` pointing here.
 */
import { register } from "node:module";

register(
  new URL(
    import.meta.url.endsWith(".ts") ? "./typescript-hooks.ts" : "./typescript-hooks.js",
    import.meta.url,
  ),
);
