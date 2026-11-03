/** Importing a plain Better Auth file during `relkit check` opens no timers, sockets or output. */
import { expect, test } from "bun:test";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const detectors = resolve(root, "packages/cli/src/compiler/discovery/evaluator-detectors.ts");
const fixtures = resolve(root, "packages/better-auth/tests/fixtures");

/** Imports one Better Auth file in a fresh process under the evaluator's detectors. */
function evaluate(authFile: string): readonly { readonly kind: string }[] {
  // A fresh process, like the evaluator child, so no earlier import hides an effect.
  const probe = `
    import { installEvaluatorDetectors } from ${JSON.stringify(detectors)};
    const session = installEvaluatorDetectors({
      projectRoot: ${JSON.stringify(resolve(root, "packages/better-auth"))},
      generatedDirectory: ${JSON.stringify(resolve(root, "packages/better-auth/.relkit/generated"))},
      networkAllowlist: [],
    });
    let report;
    try {
      const module = await import(${JSON.stringify(authFile)});
      if (module.default.capability.kind !== "better-auth") throw new Error("not a service");
      await new Promise((settle) => setTimeout(settle, 0));
      report = session.finish();
    } finally {
      session.restore();
    }
    process.stdout.write(JSON.stringify(report));
  `;
  const env = { ...process.env };
  delete env.BETTER_AUTH_SECRET;
  delete env.BETTER_AUTH_URL;
  const result = Bun.spawnSync([process.execPath, "-e", probe], {
    cwd: resolve(root, "packages/better-auth"),
    env,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 60_000,
  });
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  const report = JSON.parse(result.stdout.toString()) as {
    readonly sideEffects: readonly { readonly kind: string }[];
  };
  return report.sideEffects;
}

test("the evaluator's detectors see no side effects from a Better Auth file", () => {
  expect(evaluate(resolve(fixtures, "auth-file.ts"))).toEqual([]);
}, 90_000);

test("without a base URL the file still opens no timers or sockets; Better Auth only warns", () => {
  const kinds = evaluate(resolve(fixtures, "auth-file-without-url.ts")).map(({ kind }) => kind);
  expect(kinds.filter((kind) => kind !== "direct-output")).toEqual([]);
}, 90_000);
