/**
 * Recognizes generated onboarding values at the terminal formatting boundary.
 * Literal commands and endpoints stay aligned with the published result type;
 * arbitrary results fall back to JSON presentation and gain no command authority.
 */

import { Schema } from "effect";

/**
 * Accepts one script run by any supported package manager.
 * @param script - Script name.
 * @returns The literal union for Bun, npm and pnpm.
 */
function runScript<const Script extends string>(script: Script) {
  return Schema.Literals([`bun run ${script}`, `npm run ${script}`, `pnpm run ${script}`] as const);
}

/** Local commands reflect whether installation and preparation already ran. */
const Commands = Schema.Struct({
  cd: Schema.String,
  install: Schema.optionalKey(Schema.Literals(["bun install", "npm install", "pnpm install"])),
  prepare: Schema.optionalKey(
    Schema.Literals([
      "bunx --no-install relkit dev --prepare",
      "npx --no-install relkit dev --prepare",
      "pnpm exec relkit dev --prepare",
    ]),
  ),
  dev: runScript("dev"),
  test: runScript("test"),
  check: runScript("check"),
  build: runScript("build"),
});

/** Only an example-bearing project advertises the generated hello route. */
const Endpoints = Schema.Struct({
  backend: Schema.Literals([
    "http://localhost:3000/hello?name=RelKit",
    "http://localhost:3000/_relkit/v1/api-reference",
  ]),
  inspector: Schema.Literal("http://localhost:3210"),
  openapi: Schema.Literal("http://localhost:3000/_relkit/v1/openapi.json"),
  apiReference: Schema.optionalKey(
    Schema.Literal("http://localhost:3000/_relkit/v1/api-reference"),
  ),
  route: Schema.optionalKey(Schema.Literal("GET http://localhost:3000/hello?name=RelKit")),
});

/** Checked presentation subset; unrelated metadata is not used by rendering. */
export const GeneratePresentation = Schema.Struct({
  name: Schema.optionalKey(Schema.String),
  destination: Schema.optionalKey(Schema.String),
  nextSteps: Schema.Struct({ commands: Commands, endpoints: Endpoints }),
  additions: Schema.optionalKey(Schema.Array(Schema.Json)),
  warnings: Schema.optionalKey(Schema.Array(Schema.Struct({ message: Schema.String }))),
});
