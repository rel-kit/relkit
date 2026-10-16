/** Arbitrary runtime functions must never acquire eager compilation authority. */
import { expect, test } from "bun:test";
import { Effect, Exit } from "effect";
import { verifyStaticSnapshotSource } from "../../src/dev-snapshot/snapshot-eligibility.js";

test("rejects an ambient function disguised as a local asTool constructor", async () => {
  const source = `import {defineApp, defineEnv} from "@relkit/app/config";
function readAmbient(_options: {}) { return process.env.REVIEW_VALUE ?? "fallback"; }
const builder = {asTool: readAmbient};
export default defineApp({id: builder.asTool({}), env: defineEnv({})});`;
  const result = await Effect.runPromiseExit(
    verifyStaticSnapshotSource(source, "relkit.config.ts"),
  );
  expect(Exit.isFailure(result)).toBe(true);
});

test("rejects eager computed destructuring keys while preserving static route bindings", async () => {
  for (const source of [
    'function key() {return process.env.VALUE ?? "id";} const {[key()]: value} = {id:"captured"}; export default value;',
    'const {[process.env.VALUE!]: value} = {id:"captured"}; export default value;',
  ])
    expect(
      Exit.isFailure(
        await Effect.runPromiseExit(verifyStaticSnapshotSource(source, "src/value.ts")),
      ),
    ).toBe(true);
  expect(
    Exit.isSuccess(
      await Effect.runPromiseExit(
        verifyStaticSnapshotSource(
          'const {id: value} = {id:"literal"}; export default value;',
          "src/value.ts",
        ),
      ),
    ),
  ).toBe(true);
});

const descriptor = `import {defineFunction as fn} from "@relkit/app/functions";
import {z} from "@relkit/app/schema";
const hello = fn({input:z.string(), output:z.string(), handler:async value => value});
export {hello as named}; export default hello;`;

test("accepts proven local and imported descriptors, including aliases", async () => {
  const sources = new Map([["src/hello.ts", descriptor]]);
  for (const source of [
    `${descriptor}\nexport const tool = hello.asTool({id:"hello.tool"});`,
    'import hello from "./hello.js"; const alias = hello; export default alias.asTool({id:"hello.tool"});',
    'import {named as hello} from "./hello.js"; export default hello.asTool({id:"hello.tool"});',
  ]) {
    const result = await Effect.runPromiseExit(
      verifyStaticSnapshotSource(source, "src/tool.ts", sources),
    );
    expect(Exit.isSuccess(result), source).toBe(true);
  }
});

test("rejects forged imported descriptors, namespaces, ambiguous resolution and cycles", async () => {
  const consumer =
    'import hello from "./hello.js"; export default hello.asTool({id:"hello.tool"});';
  for (const sources of [
    new Map([
      [
        "src/hello.ts",
        "function read() {return process.env.VALUE;} const hello={asTool:read}; export default hello;",
      ],
    ]),
    new Map([
      ["src/hello.ts", descriptor],
      ["src/hello.js", descriptor],
    ]),
    new Map([["src/hello.ts", 'import hello from "./hello.js"; export default hello;']]),
    new Map<string, string>(),
  ]) {
    expect(
      Exit.isFailure(
        await Effect.runPromiseExit(verifyStaticSnapshotSource(consumer, "src/tool.ts", sources)),
      ),
    ).toBe(true);
  }
  const namespace =
    'import * as hello from "./hello.js"; export default hello.asTool({id:"hello.tool"});';
  expect(
    Exit.isFailure(
      await Effect.runPromiseExit(
        verifyStaticSnapshotSource(
          namespace,
          "src/tool.ts",
          new Map([["src/hello.ts", descriptor]]),
        ),
      ),
    ),
  ).toBe(true);
});
