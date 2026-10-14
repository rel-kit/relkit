/** Checks every actual compiler TSDoc consumer against the installed API under a bounded whole-program compiler lifetime. */
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import {
  compilerDocumentationExamples,
  compilerDocumentationDiagnostics,
} from "./jobs-documentation-fixture.js";

describe("compiler documentation examples", () => {
  it.effect(
    "typechecks the actual TSDoc snippets against the installed API",
    () =>
      Effect.sync(() => {
        const root = fileURLToPath(new URL("../src/", import.meta.url));
        const examples = compilerDocumentationExamples(root);
        expect(examples.size).toBeGreaterThan(0);
        const configPath = fileURLToPath(new URL("../../../tsconfig.base.json", import.meta.url));
        expect(compilerDocumentationDiagnostics(examples, configPath)).toBe("");
      }),
    30_000,
  );
});
