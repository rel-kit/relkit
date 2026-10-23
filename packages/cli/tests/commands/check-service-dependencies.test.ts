/**
 * Verifies graph-selected native dependency checks without evaluating services.
 * A captured test Layer records phase, dialect and source provenance, including
 * the upstream MySQL declaration requirement without activating other dialects.
 */
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import {
  SelectedDependencies,
  type DependencySelection,
} from "@relkit/provider/internal/dependencies";
import { checkSelectedServiceRequirements } from "../../src/commands/check-service-dependencies.js";

describe("graph-selected native services", () => {
  it("retains source and only selects MySQL declaration peers for MySQL", () => {
    const calls: DependencySelection[] = [];
    const checker = Layer.succeed(SelectedDependencies, {
      check: (selection) =>
        Effect.sync(() => {
          calls.push(selection);
          return [];
        }),
    });
    const graph = JSON.stringify({
      nodes: [
        {
          kind: "service",
          source: { file: "src/services/db/service.ts" },
          capability: { kind: "drizzle", dialect: "mysql" },
        },
        {
          kind: "service",
          source: { file: "src/services/sqlite/service.ts" },
          capability: { kind: "drizzle", dialect: "sqlite" },
        },
        {
          kind: "service",
          source: { file: "src/services/auth/service.ts" },
          capability: { kind: "better-auth" },
        },
        { kind: "service", capability: { kind: "generic" } },
      ],
    });
    Effect.runSync(
      checkSelectedServiceRequirements("/consumer", graph).pipe(Effect.provide(checker)),
    );
    expect(
      calls.map((call) => ({
        capabilities: call.capabilities,
        source: call.source,
        phase: call.phase,
      })),
    ).toEqual([
      { capabilities: ["drizzle", "mysql"], source: "src/services/db/service.ts", phase: "check" },
      { capabilities: ["drizzle"], source: "src/services/sqlite/service.ts", phase: "check" },
      { capabilities: ["better-auth"], source: "src/services/auth/service.ts", phase: "check" },
    ]);
  });
});
