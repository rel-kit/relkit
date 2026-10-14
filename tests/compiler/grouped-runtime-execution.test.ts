/** Proves generated flat/grouped registries execute the same original inferred-ID descriptor across validated migration. */
import { expect, test } from "bun:test";
import { Effect } from "effect";
import { migrationFixture } from "../../packages/cli/tests/migration/fixture.js";
import {
  LayoutMigration,
  layoutMigrationLayer,
} from "../../packages/cli/src/migration/layout-migration.service.js";
import { checkProject } from "../../packages/cli/src/commands/check.js";
import { scaffoldNative } from "../../scripts/scaffold-native.js";
import { executeGroupedManifest } from "./grouped-runtime-execution.js";

test(
  "generated manifests keep and execute the original descriptor through the same inferred ID after source movement",
  () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const root = yield* migrationFixture;
        const baseline = yield* scaffoldNative("grouped.runtime.check.flat", () =>
          checkProject({ projectRoot: root }),
        );
        expect(baseline.ok, JSON.stringify(baseline.diagnostics)).toBe(true);
        expect(yield* executeGroupedManifest(root, false)).toBe("hello");
        const migration = yield* LayoutMigration;
        const migrated = yield* migration.write(root);
        expect(migrated.status).toBe("committed");
        const grouped = yield* scaffoldNative("grouped.runtime.check.grouped", () =>
          checkProject({ projectRoot: root }),
        );
        expect(grouped.ok, JSON.stringify(grouped.diagnostics)).toBe(true);
        expect(grouped.graphHash).not.toBe(baseline.graphHash);
        expect(yield* executeGroupedManifest(root, true)).toBe("hello");
      }).pipe(Effect.provide(layoutMigrationLayer), Effect.scoped),
    ),
  60_000,
);
