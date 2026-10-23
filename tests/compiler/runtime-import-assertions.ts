/**
 * Asserts selected runtime imports stay guarded behind dependency preflight.
 * Capability registrations retain their owners while executable modules deduplicate.
 */
import { expect } from "bun:test";

interface RuntimeModuleIdentity {
  readonly packageName: string;
  readonly packageVersion: string;
  readonly exportName: string;
}

/** Checks preflight completion, literal guarded imports, and exact module ownership. */
export function assertGuardedRuntimeImports(
  source: string,
  registrations: readonly RuntimeModuleIdentity[],
): void {
  const preflight = "await Effect.runPromise(checkIntegrationDependencies(";
  const completion = ".pipe(Effect.provide(SelectedDependenciesLive)));";
  const preflightEnd = source.indexOf(completion);
  expect(source).toContain('from "@relkit/app/internal/runtime";');
  expect(source).not.toContain('from "@relkit/provider/');
  expect(source.split(preflight)).toHaveLength(2);
  expect(preflightEnd).toBeGreaterThan(source.indexOf(preflight));
  expect(source.slice(0, preflightEnd)).not.toContain("await import(");
  expect(source).toContain('projectRoot: fileURLToPath(new URL(".", import.meta.url))');
  expect(source).toContain('phase: "runtime"');
  expect(
    [...source.matchAll(/(?:from|import)\s+["'](@relkit\/[^"']+\/runtime)["']/g)].map(
      (match) => match[1],
    ),
  ).toEqual(["@relkit/app/internal/runtime"]);
  const modules = new Map(
    registrations.map((entry) => [
      JSON.stringify([entry.packageName, entry.packageVersion, entry.exportName]),
      entry,
    ]),
  );
  const ordered = [...modules.values()].sort((a, b) => a.packageName.localeCompare(b.packageName));
  expect(source.match(/await import\(/g)).toHaveLength(ordered.length);
  for (const [index, entry] of ordered.entries()) {
    const owner = JSON.stringify(entry.packageName);
    const specifier = JSON.stringify(`${entry.packageName}${entry.exportName.slice(1)}`);
    const binding = `__relkit_runtime_${index}`;
    const initialize = `const ${binding} = await Effect.runPromise(initializeIntegration(${owner}, async () => await import(${specifier})));`;
    expect(source.split(initialize)).toHaveLength(2);
    expect(source.indexOf(initialize)).toBeGreaterThan(preflightEnd + completion.length);
    expect(source).toContain(
      `{ packageName: ${owner}, packageVersion: ${JSON.stringify(entry.packageVersion)}, exportName: ${JSON.stringify(entry.exportName)}, module: ${binding} }`,
    );
  }
  expect(source.match(/module: __relkit_runtime_\d+/g)).toHaveLength(ordered.length);
}
