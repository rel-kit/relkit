/** The deprecated `@relkit/app` re-export keeps working and warns once, naming `relkit`. */
import { expect, test } from "bun:test";
import { resolve } from "node:path";

const dist = resolve(import.meta.dir, "../../packages/app/dist");

/** Imports the given `@relkit/app` entries in one process and returns its output. */
async function importEntries(...entries: string[]) {
  const script = entries.map((entry) => `await import(${JSON.stringify(`${dist}/${entry}`)});`);
  const child = Bun.spawn(["bun", "-e", `${script.join("\n")}\nconsole.log("imported");`], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { output: `${out}${err}`, code };
}

test("importing @relkit/app works and warns once with the replacement", async () => {
  const { output, code } = await importEntries("index.js", "schema.js", "routes.js");
  expect(code).toBe(0);
  expect(output).toContain("imported");
  const warnings = output
    .split("\n")
    .filter((line) => line.includes("WARN") && line.includes("RELKIT_DEPRECATED_APP_PACKAGE"));
  expect(warnings).toHaveLength(1);
  expect(output).toContain("Use the `relkit` package (`relkit migrate` rewrites imports) instead.");
  expect(output).toContain("https://relkit.dev/docs/errors/relkit-deprecated-app-package");
});

test("every @relkit/app entry carries the warning", async () => {
  for (const entry of ["agents.js", "host.js", "tasks.js"]) {
    const { output } = await importEntries(entry);
    expect(output).toContain("RELKIT_DEPRECATED_APP_PACKAGE");
  }
});
