/**
 * Exercises normalization's real helper/re-export/dynamic dependency policy under
 * Bun. Fixtures use unevaluated source text; paired grouped compiler probes supply
 * separate positive executable evidence, while these cases assert fatal edges.
 */
import assert from "node:assert/strict";
import { normalizeCompilation } from "../src/normalize.js";
import { runLayoutProbe } from "./layout-probe-runner.js";
import { Effect } from "effect";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const service =
  'import { defineService } from "@relkit/app/services"; export default defineService({});';

/**
 * Inspects source-only boundary diagnostics without running any candidate module.
 * @param root - Flat or grouped fixed services root for paired static cases.
 * @param importer - Actual path of the module containing the tested dependency.
 * @param text - Literal dependency syntax, including helper/re-export/dynamic forms.
 * @returns Only dependency diagnostics; missing runtime declarations are outside this fixture.
 */
function dependencies(root: "src" | "src/services", importer: string, text: string) {
  const result = normalizeCompilation({
    projectRoot: "/layout-virtual-project",
    sources: [
      { fileName: `${root}/orders/service.ts`, text: service },
      { fileName: `${root}/payments/service.ts`, text: service },
      { fileName: `${root}/payments/functions/charge.ts`, text: "export const value = 1;" },
      { fileName: "tests/bridge.ts", text: "export const value = 1;" },
      { fileName: "src/platform/settings.ts", text: "export const value = 1;" },
      { fileName: importer, text },
    ],
  });
  return result.diagnostics.filter((diagnostic) =>
    [
      "RELKIT_DOMAIN_BOUNDARY",
      "RELKIT_SOURCE_RESOLUTION",
      "RELKIT_BOUNDARY_ANALYSIS_LIMIT",
    ].includes(diagnostic.code),
  );
}

/** Verifies every supported static syntax receives the same cross-service policy.
 * @returns Lazy assertions using actual compiler normalization and native resolution.
 */
const staticAcceptance = Effect.fn("BoundaryProbe.static")(function* () {
  for (const root of ["src", "src/services"] as const) {
    for (const text of [
      'import { value } from "../payments/functions/charge.js";',
      'import type { value } from "../payments/functions/charge.js";',
      'export { value } from "../payments/functions/charge.js";',
      'void import("../payments/functions/charge.js");',
    ]) {
      const issues = dependencies(root, `${root}/orders/helper.ts`, text);
      assert.equal(issues.length, 1);
      assert.equal(issues[0]?.code, "RELKIT_DOMAIN_BOUNDARY");
      assert.ok(issues[0]?.suggestion?.includes(`${root}/payments/service.ts`));
    }
    assert.deepEqual(
      dependencies(
        root,
        `${root}/orders/helper.ts`,
        'import payments from "../payments/service.js";',
      ),
      [],
    );
  }
});

/** Verifies helpers cannot cross Platform/Routes/tooling direction or hide missing imports.
 * @returns Lazy layer and analysis-limit assertions with real source coordinates.
 */
const layerAcceptance = Effect.fn("BoundaryProbe.layers")(function* () {
  assert.equal(
    dependencies(
      "src/services",
      "src/platform/helper.ts",
      'export { value } from "../services/payments/functions/charge.js";',
    )[0]?.code,
    "RELKIT_DOMAIN_BOUNDARY",
  );
  assert.equal(
    dependencies(
      "src/services",
      "src/services/orders/helper.ts",
      'import { value } from "../../../tests/bridge.js";',
    )[0]?.code,
    "RELKIT_DOMAIN_BOUNDARY",
  );
  assert.equal(
    dependencies(
      "src/services",
      "src/routes/helper.ts",
      'import payments from "../services/payments/service.js";',
    ).length,
    0,
  );
});

/** Checks unsupported dynamic analysis and missing boundaries remain explicit.
 * @returns Lazy warning and missing-boundary assertions.
 */
const dynamicAcceptance = Effect.fn("BoundaryProbe.dynamic")(function* () {
  const computed = dependencies(
    "src/services",
    "src/services/orders/helper.ts",
    "const target = 'runtime'; void import(target);",
  );
  assert.equal(computed[0]?.code, "RELKIT_BOUNDARY_ANALYSIS_LIMIT");
  assert.equal(computed[0]?.severity, "warning");
  assert.equal(computed[0]?.file, "src/services/orders/helper.ts");
  assert.equal(
    dependencies("src/services", "src/services/orders/helper.ts", 'void import("./missing.js");')[0]
      ?.severity,
    "warning",
  );
  assert.equal(
    dependencies(
      "src/services",
      "src/services/orders/helper.ts",
      'import value from "./missing.js";',
    )[0]?.code,
    "RELKIT_SOURCE_RESOLUTION",
  );
  const missing = normalizeCompilation({
    projectRoot: "/layout-virtual-project",
    sources: [
      {
        fileName: "src/services/orders/functions/get.ts",
        text: 'import { defineFunction } from "@relkit/app/functions"; export default defineFunction({});',
      },
    ],
  });
  assert.equal(missing.activatable, false);
  assert.ok(
    missing.diagnostics.some(
      (issue) =>
        issue.file === "src/services/orders/service.ts" &&
        issue.message.includes("must export exactly one service"),
    ),
  );
});

/** Enforces physical service ownership through native package links, including preserved symlinks.
 * @returns Compiler boundary assertions after every owned native fixture is removed. */
const linkedAcceptance = Effect.fn("BoundaryProbe.linked")(function* () {
  const root = yield* Effect.acquireRelease(
    Effect.tryPromise(() => mkdtemp(join(tmpdir(), "relkit-linked-boundary-"))),
    (root) => Effect.promise(() => rm(root, { recursive: true, force: true })),
  );
  for (const serviceRoot of ["src", "src/services"]) {
    const sources = [
      { fileName: `${serviceRoot}/orders/service.ts`, text: service },
      { fileName: `${serviceRoot}/payments/service.ts`, text: service },
      { fileName: `${serviceRoot}/payments/internal.ts`, text: "export const value = 1;" },
    ];
    yield* Effect.tryPromise(async () => {
      for (const source of sources) {
        await mkdir(dirname(join(root, source.fileName)), { recursive: true });
        await writeFile(join(root, source.fileName), source.text);
      }
      await writeFile(join(root, serviceRoot, "payments/package.json"), '{"types":"internal.ts"}');
      await mkdir(join(root, "node_modules"), { recursive: true });
      await rm(join(root, "node_modules/private-payment"), { force: true });
      await symlink(
        join(root, serviceRoot, "payments"),
        join(root, "node_modules/private-payment"),
      );
    });
    for (const preserveSymlinks of [false, true]) {
      yield* Effect.tryPromise(() =>
        writeFile(
          join(root, "tsconfig.json"),
          JSON.stringify({
            compilerOptions: { moduleResolution: "Bundler", preserveSymlinks },
          }),
        ),
      );
      for (const importer of [
        `${serviceRoot}/orders/helper.ts`,
        "src/routes/helper.ts",
        "src/platform/helper.ts",
      ]) {
        const result = normalizeCompilation({
          projectRoot: root,
          sources: [
            ...sources,
            {
              fileName: importer,
              text: 'import { value } from "private-payment";',
            },
          ],
        });
        assert(
          result.diagnostics.some((issue) => issue.code === "RELKIT_DOMAIN_BOUNDARY"),
          importer,
        );
      }
      const publicImport = normalizeCompilation({
        projectRoot: root,
        sources: [
          ...sources,
          {
            fileName: `${serviceRoot}/orders/helper.ts`,
            text: 'import payments from "private-payment/service.js";',
          },
        ],
      });
      assert(!publicImport.diagnostics.some((issue) => issue.code === "RELKIT_DOMAIN_BOUNDARY"));
    }
    yield* Effect.promise(() => rm(join(root, "src"), { recursive: true, force: true }));
  }
});

if (import.meta.main)
  await runLayoutProbe(
    Effect.scoped(
      Effect.gen(function* () {
        yield* staticAcceptance();
        yield* layerAcceptance();
        yield* dynamicAcceptance();
        yield* linkedAcceptance();
      }),
    ),
  );
