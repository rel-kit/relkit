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
  const preflight = "await checkRuntimeIntegrations(";
  const completion = 'phase: "runtime" });';
  const preflightEnd = source.indexOf(completion);
  expect(source).toContain('from "relkit/host";');
  expect(source).not.toMatch(/from ["']effect["']|Effect\./);
  expect(source).not.toContain('from "@relkit/provider/');
  expect(source.split(preflight)).toHaveLength(2);
  expect(preflightEnd).toBeGreaterThan(source.indexOf(preflight));
  expect(source.slice(0, preflightEnd)).not.toContain("await import(");
  expect(source).toContain('projectRoot: fileURLToPath(new URL(".", import.meta.url))');
  expect(source).toContain('phase: "runtime"');
  expect(
    [...source.matchAll(/(?:from|import)\s+["'](relkit\/host|@?relkit\/[^"']+\/runtime)["']/g)].map(
      (match) => match[1],
    ),
  ).toEqual(["relkit/host"]);
  const modules = new Map(
    registrations.map((entry) => [
      JSON.stringify([entry.packageName, entry.packageVersion, entry.exportName]),
      entry,
    ]),
  );
  const ordered = [...modules.values()].sort((a, b) => a.packageName.localeCompare(b.packageName));
  expect(source.match(/await import\(/g)).toHaveLength(ordered.length);
  for (const [index, entry] of ordered.entries()) {
    const owner = JSON.stringify(entry.packageName).replaceAll("<", "\\u003c");
    const specifier = JSON.stringify(`${entry.packageName}${entry.exportName.slice(1)}`).replaceAll(
      "<",
      "\\u003c",
    );
    const binding = `__relkit_runtime_${index}`;
    const initialize = `const ${binding} = await loadRuntimeIntegration(${owner}, async () => await import(${specifier}));`;
    expect(source.split(initialize)).toHaveLength(2);
    expect(source.indexOf(initialize)).toBeGreaterThan(preflightEnd + completion.length);
    expect(source).toContain(
      `{ packageName: ${owner}, packageVersion: ${JSON.stringify(entry.packageVersion).replaceAll("<", "\\u003c")}, exportName: ${JSON.stringify(entry.exportName).replaceAll("<", "\\u003c")}, module: ${binding} }`,
    );
  }
  expect(source.match(/module: __relkit_runtime_\d+/g)).toHaveLength(ordered.length);
}
