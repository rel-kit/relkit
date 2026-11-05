/** Covers the tsconfig reading behind the Node TypeScript hooks: comments, `extends` and `paths`. */
import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loaderConfig,
  pathCandidates,
  stripJsonComments,
} from "../../src/runtime/node/tsconfig-lookup.ts";

test("strips comments and trailing commas outside strings", () => {
  const text = '{ // note\n "a": "x // y", /* block */ "b": [1, 2,], }';
  expect(JSON.parse(stripJsonComments(text))).toEqual({ a: "x // y", b: [1, 2] });
});

test("maps paths aliases through the nearest configuration and its extends chain", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-tsconfig-lookup-"));
  try {
    await writeFile(
      join(root, "tsconfig.base.json"),
      '{ "compilerOptions": { "baseUrl": ".", "paths": { "@app/*": ["src/*"] }, "jsx": "react-jsx" } }',
    );
    await writeFile(
      join(root, "tsconfig.json"),
      '{ "extends": "./tsconfig.base", // inherited aliases\n "compilerOptions": { "strict": true, } }',
    );
    await mkdir(join(root, "src", "services"), { recursive: true });
    const config = loaderConfig(join(root, "src", "services"));
    expect(config?.transformOptions).toEqual({ jsx: "react-jsx" });
    expect(pathCandidates("@app/services/hello/service.js", config!)).toEqual([
      join(root, "src/services/hello/service.js"),
    ]);
    expect(pathCandidates("effect", config!)).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
