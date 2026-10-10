/**
 * Verifies packaged inspector discovery under the Node test runtime.
 * Contributor source remains an explicit override; the generated command's
 * default resolves the shipped inspector independently from compiler imports.
 */
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveInspectorInstallation } from "../../src/commands/dev-inspector-installation.js";

it.effect("default inspector discovery resolves the packaged installation under Node", () =>
  Effect.sync(() => {
    const expected = fileURLToPath(new URL("../../dist/inspector", import.meta.url));
    expect(resolveInspectorInstallation(undefined, {}).root).toBe(resolve(expected));
  }),
);
