/**
 * Recognizes generated onboarding values at the terminal formatting boundary.
 * Literal commands and endpoints stay aligned with the published result type;
 * arbitrary results fall back to JSON presentation and gain no command authority.
 */
import { Schema } from "effect";

/** Local commands reflect whether installation and preparation already ran. */
const Commands = Schema.Struct({
  cd: Schema.String,
  install: Schema.optionalKey(Schema.Literal("bun install")),
  prepare: Schema.optionalKey(Schema.Literal("bunx --no-install relkit dev --prepare")),
  dev: Schema.Literal("bun run dev"),
  test: Schema.Literal("bun run test"),
  check: Schema.Literal("bun run check"),
  build: Schema.Literal("bun run build"),
});

/** Only an example-bearing project advertises the generated hello route. */
const Endpoints = Schema.Struct({
  backend: Schema.Literal("http://localhost:3000"),
  inspector: Schema.Literal("http://localhost:3210"),
  openapi: Schema.Literal("http://localhost:3000/_relkit/v1/openapi.json"),
  apiReference: Schema.Literal("http://localhost:3000/_relkit/v1/api-reference"),
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
