/**
 * Runs on Bun because it exercises Bun's evictable module registry. A reload whose import fails
 * must not leave modules behind that make the next import hang (after a parse error) or return
 * a half-initialized module (after a top-level throw): the warm evaluator imports several
 * candidates in one pass and the development server imports again on the next save.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, expect, test } from "bun:test";
import { createModuleReloader } from "../../src/app/dev-module-reload.js";
import { bunModules } from "../../src/runtime/bun/processes.js";

const roots: string[] = [];
let generation = 0;

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/**
 * Writes `route.ts` → `service.ts` → `member.ts` and loads each like the warm evaluator does.
 * @returns The project root, a writer and an importer that gives up after one second.
 */
async function loadedProject() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "relkit-module-reload-")));
  roots.push(root);
  mkdirSync(root, { recursive: true });
  const write = (file: string, text: string) => writeFileSync(join(root, file), text);
  write("route.ts", 'import service from "./service.ts";\nexport default `route ${service}`;\n');
  write("service.ts", 'import member from "./member.ts";\nexport default `service ${member}`;\n');
  write("member.ts", 'export default "member v0";\n');
  const load = async (file: string) => {
    generation += 1;
    const url = `${pathToFileURL(join(root, file)).href}?relkit_generation=${generation}`;
    const imported = import(url).then((module: { default: string }) => module.default);
    const timeout = Bun.sleep(1_000).then(() => "pending");
    return Promise.race([imported, timeout]).catch((error: Error) => `failed: ${error.message}`);
  };
  for (const file of ["route.ts", "service.ts", "member.ts"]) await load(file);
  const reloader = createModuleReloader(root, bunModules);
  reloader.record();
  return { root, write, load, reloader };
}

test("after a parse error every later import fails instead of hanging, and the fix loads", async () => {
  const { root, write, load, reloader } = await loadedProject();
  write("member.ts", 'export default "member v1";\nconst broken: = ;\n');
  reloader.invalidate([join(root, "member.ts")]);
  expect(await load("route.ts")).toStartWith("failed:");
  expect(reloader.discardFailed()).toContain(join(root, "member.ts"));
  expect(await load("member.ts")).toStartWith("failed:");
  reloader.discardFailed();
  expect(await load("service.ts")).toStartWith("failed:");
  write("member.ts", 'export default "member v2";\n');
  reloader.invalidate([join(root, "member.ts")]);
  expect(await load("route.ts")).toBe("route service member v2");
});

test("the next reload after a parse error loads without an explicit discard", async () => {
  const { root, write, load, reloader } = await loadedProject();
  write("member.ts", 'export default "member v1";\nconst broken: = ;\n');
  reloader.invalidate([join(root, "member.ts")]);
  expect(await load("route.ts")).toStartWith("failed:");
  write("member.ts", 'export default "member v2";\n');
  reloader.invalidate([join(root, "member.ts")]);
  expect(await load("member.ts")).toBe("member v2");
  expect(await load("route.ts")).toBe("route service member v2");
});

test("after a top-level throw a later import reports the throw again", async () => {
  const { root, write, load, reloader } = await loadedProject();
  write("member.ts", 'throw new Error("top-level failure");\nexport default "member v1";\n');
  reloader.invalidate([join(root, "member.ts")]);
  expect(await load("route.ts")).toBe("failed: top-level failure");
  reloader.discardFailed();
  expect(await load("member.ts")).toBe("failed: top-level failure");
});
