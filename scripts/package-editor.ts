import { resolve } from "node:path";

/** tsserver requires a CommonJS plugin factory, even when the CLI uses ESM. */
const result = await Bun.build({
  entrypoints: [resolve(import.meta.dir, "../packages/cli/src/editor.ts")],
  target: "node",
  format: "cjs",
  external: ["typescript"],
});
if (!result.success || result.outputs.length !== 1)
  throw new AggregateError(result.logs, "Editor plugin build failed.");
await Bun.write(
  resolve(import.meta.dir, "../packages/cli/dist/editor.cjs"),
  `${await result.outputs[0]!.text()}\nmodule.exports = module.exports.default;\n`,
);
