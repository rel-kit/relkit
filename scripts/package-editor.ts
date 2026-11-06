import { resolve } from "node:path";

/** tsserver requires a CommonJS plugin factory, even when the CLI uses ESM. */
const result = await Bun.build({
  entrypoints: [resolve(import.meta.dir, "../packages/cli/src/editor.ts")],
  target: "node",
  format: "cjs",
  external: ["typescript"],
  plugins: [
    {
      // The plugin always receives the editor's own TypeScript; the CLI's private parser is
      // only a default argument, so the bundle reuses the `typescript` tsserver already loaded.
      name: "editor-typescript",
      setup(build) {
        build.onResolve({ filter: /^relkit-typescript$/ }, () => ({
          path: "relkit-typescript",
          namespace: "editor-typescript",
        }));
        build.onLoad({ filter: /.*/, namespace: "editor-typescript" }, () => ({
          contents: 'module.exports = require("typescript");',
          loader: "js",
        }));
      },
    },
  ],
});
if (!result.success || result.outputs.length !== 1)
  throw new AggregateError(result.logs, "Editor plugin build failed.");
await Bun.write(
  resolve(import.meta.dir, "../packages/cli/dist/editor.cjs"),
  `${await result.outputs[0]!.text()}\nmodule.exports = module.exports.default;\n`,
);
