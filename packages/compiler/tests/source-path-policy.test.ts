/** Verifies lexical and native ownership rejection without importing application modules. */
import { it, expect } from "@effect/vitest";
import { Effect } from "effect";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeAuthoredModulesEffect } from "../src/discovery/source-path-policy.js";

it.effect("rejects equivalent duplicate paths and case-colliding paths", () =>
  Effect.gen(function* () {
    for (const fileName of ["./src/services/orders/value.ts", "src/services/Orders/value.ts"]) {
      const failure = yield* Effect.flip(
        normalizeAuthoredModulesEffect(
          [
            { fileName: "src/services/orders/value.ts", text: "" },
            { fileName, text: "" },
          ],
          "/virtual-project",
        ),
      );
      expect(failure._tag).toBe("SourceLocationError");
    }
  }),
);

it.live("rejects native escapes, cross-service aliases and duplicate physical files", () =>
  Effect.acquireUseRelease(
    Effect.tryPromise(() => mkdtemp(join(tmpdir(), "relkit-layout-paths-"))),
    (root) =>
      Effect.gen(function* () {
        yield* Effect.tryPromise(async () => {
          await mkdir(join(root, "src/services/orders"), { recursive: true });
          await mkdir(join(root, "src/services/payments"), { recursive: true });
          await writeFile(join(root, "src/services/payments/value.ts"), "export const value = 1;");
          await symlink("../payments/value.ts", join(root, "src/services/orders/alias.ts"));
          await symlink("value.ts", join(root, "src/services/payments/copy.ts"));
          await symlink("/etc/hosts", join(root, "src/services/orders/escape.ts"));
        });
        for (const fileName of ["src/services/orders/alias.ts", "src/services/orders/escape.ts"]) {
          const failure = yield* Effect.flip(
            normalizeAuthoredModulesEffect([{ fileName, text: "" }], root),
          );
          expect(failure._tag).toBe("SourceLocationError");
        }
        const duplicate = yield* Effect.flip(
          normalizeAuthoredModulesEffect(
            [
              { fileName: "src/services/payments/value.ts", text: "" },
              { fileName: "src/services/payments/copy.ts", text: "" },
            ],
            root,
          ),
        );
        expect(duplicate._tag).toBe("SourceLocationError");
        const sameOwner = yield* normalizeAuthoredModulesEffect(
          [{ fileName: "src/services/payments/copy.ts", text: "" }],
          root,
        );
        expect(sameOwner[0]?.fileName).toBe("src/services/payments/copy.ts");
      }),
    (root) => Effect.promise(() => rm(root, { recursive: true, force: true })),
  ),
);
