/**
 * Restricts the prepared generated backend's source aliases to the inventory we
 * actually audit. Root discovery selects only inventoried authored files and the
 * explicit checked generated assertion. Other compiler settings remain fingerprinted;
 * external inheritance/references are rejected by the eligibility adapter.
 */
import { Schema } from "effect";

/** Generated backend aliases resolve entirely inside src, including after relocation. */
export const SnapshotEligibleTsConfig = Schema.Struct({
  compilerOptions: Schema.Struct({
    baseUrl: Schema.Literal("."),
    paths: Schema.Struct({ "@app/*": Schema.Tuple([Schema.Literal("src/*")]) }),
  }),
  files: Schema.Tuple([Schema.Literal(".relkit/generated/route-module-checks.ts")]),
  include: Schema.Tuple([
    Schema.Literal("src/**/*.ts"),
    Schema.Literal("tests/**/*.ts"),
    Schema.Literal("relkit.config.ts"),
  ]),
  exclude: Schema.Union([
    Schema.Tuple([Schema.Literal("node_modules"), Schema.Literal(".relkit")]),
    Schema.Tuple([
      Schema.Literal("node_modules"),
      Schema.Literal(".relkit"),
      Schema.Literal("web"),
    ]),
  ]),
});
