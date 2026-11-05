/**
 * Bundles the CLI's private TypeScript 5.9 compiler API into `dist/typescript-parser.js`,
 * replacing the module `tsc` emitted, which still imports the private `relkit-typescript`
 * workspace package. The
 * published CLI therefore carries the parser itself and installs no second `typescript` package
 * (or `tsc` executable) beside the application's own TypeScript, which may be 5.9 or 7.
 */
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const result = await Bun.build({
  entrypoints: [resolve(root, "packages/cli/src/typescript-parser.ts")],
  // The CLI runs on Bun and Node; a Node-target bundle runs on both.
  target: "node",
  format: "esm",
});
if (!result.success || result.outputs.length !== 1)
  throw new AggregateError(result.logs, "TypeScript parser bundle failed.");
await Bun.write(
  resolve(root, "packages/cli/dist/typescript-parser.js"),
  await result.outputs[0]!.text(),
);
